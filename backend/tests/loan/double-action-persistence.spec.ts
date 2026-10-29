import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import { freezeBusinessDate } from '../fixtures/business-clock';
import {
  pickupFixture,
  pickupRequest,
  PICKUP_NOW,
  PICKUP_START,
} from '../fixtures/pickup';
import { LoanService } from '../../src/loan/loan.service';
import { StaffScopeService } from '../../src/common/authority/staff-scope.service';
import { PenaltyService } from '../../src/common/penalty/penalty.service';
import { NotificationService } from '../../src/notification/notification.service';
import { CreditTierService } from '../../src/common/credit/credit-tier.service';
import { LoanRequestService } from '../../src/loan/loan.request.service';
import { EligibilityService } from '../../src/common/authority/eligibility.service';
import { InspectionService } from '../../src/inspection/inspection.service';
import { createInspectionInput } from '../../src/inspection/inspection.schema';

/**
 * #220: the same action sent twice at the same moment must happen once.
 *
 * Runs against committed rows and real separate transactions (the shared
 * fixture client runs everything inside one transaction, which cannot race).
 * The isolated database is dropped after the run, so rows are not cleaned up.
 */
describe('#220: two identical actions at once', () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    requireIsolatedDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  beforeEach(() => freezeBusinessDate(PICKUP_NOW));
  afterEach(() => jest.useRealTimers());

  function realServices() {
    const notifications = new NotificationService(prisma);
    const audit = { record: jest.fn() };
    return {
      loan: new LoanService(
        prisma,
        new StaffScopeService(prisma),
        new PenaltyService(prisma),
        notifications,
        audit as never,
        new CreditTierService(prisma),
      ),
      requests: new LoanRequestService(
        prisma,
        new CreditTierService(prisma),
        new EligibilityService(prisma),
        notifications,
        audit as never,
      ),
    };
  }

  it('prepares a request once when two staff press Prepare together', async () => {
    const f = await pickupFixture(prisma);
    const { loan, requests } = realServices();
    const request = await pickupRequest({ ...f, service: requests });

    const settled = await Promise.allSettled([
      loan.allocate(f.staff, {
        reservationKey: request.reservationKey,
        condition: 'Normal',
      }),
      loan.allocate(f.staff, {
        reservationKey: request.reservationKey,
        condition: 'Normal',
      }),
    ]);

    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    const refused = settled.find((s) => s.status === 'rejected');
    expect(refused).toMatchObject({
      reason: { businessCode: 'WRONG_LOAN_STATE' },
    });
    expect(
      await prisma.usageLog.count({
        where: { ReservationKey: request.reservationKey },
      }),
    ).toBe(1);
  }, 20_000);

  it('never leaves a cancelled request with a prepared unit', async () => {
    const f = await pickupFixture(prisma);
    const { loan, requests } = realServices();
    const request = await pickupRequest({ ...f, service: requests });

    const settled = await Promise.allSettled([
      loan.allocate(f.staff, {
        reservationKey: request.reservationKey,
        condition: 'Normal',
      }),
      requests.cancel(f.users[0], { reservationKey: request.reservationKey }),
    ]);

    // FR-REQ-10 (revised 29 Oct 2569): a prepared request is still the
    // borrower's to cancel, so the cancel wins in either order. Preparing
    // either lands first and is undone, or finds the request cancelled.
    const [prepare, cancel] = settled;
    expect(cancel.status).toBe('fulfilled');
    if (prepare.status === 'rejected') {
      expect(prepare.reason).toMatchObject({
        businessCode: 'NOT_APPROVED_YET',
      });
    }
    // What must never happen is a cancelled request keeping a prepared unit.
    const row = await prisma.reservations.findUniqueOrThrow({
      where: { ReservationKey: request.reservationKey },
      select: {
        ApproveStatus: true,
        UsageLogs: { select: { UsageKey: true } },
      },
    });
    expect(row).toEqual({ ApproveStatus: 'Canceled', UsageLogs: [] });
  }, 20_000);

  it('never cancels a loan while staff are handing it over', async () => {
    const f = await pickupFixture(prisma);
    const { loan, requests } = realServices();
    const request = await pickupRequest({ ...f, service: requests });
    const prepared = await loan.allocate(f.staff, {
      reservationKey: request.reservationKey,
      condition: 'Normal',
    });
    await prisma.images.create({
      data: {
        UsageKey: prepared.usageKey,
        ResourceKey: f.units[0].ResourceKey,
        SubmittedBy: f.users[0].accountKey,
        SubmissionType: 'BeforePicture',
        ImageURL: `/media/inspection/race-handover-${prepared.usageKey}.png`,
        ActionTime: PICKUP_START,
      },
    });
    freezeBusinessDate(PICKUP_START);

    // The handover has marked the loan Lended but not committed yet when the
    // borrower presses cancel: the moment a cancel must wait for, not undo.
    const slow = withSlowStep(prisma, 'resourceInfo', 'update', 1_500);
    const counter = new LoanService(
      slow.client,
      new StaffScopeService(prisma),
      new PenaltyService(prisma),
      new NotificationService(prisma),
      { record: jest.fn() } as never,
      new CreditTierService(prisma),
    );
    const handover = counter.confirmPickup(f.staff, {
      usageKey: prepared.usageKey,
    });
    await slow.reached;
    const settled = await Promise.allSettled([
      handover,
      requests.cancel(f.users[0], { reservationKey: request.reservationKey }),
    ]);

    expect({
      outcomes: settled.map((s) =>
        s.status === 'fulfilled'
          ? 'ok'
          : (s.reason as { businessCode?: string }).businessCode,
      ),
      request: (
        await prisma.reservations.findUniqueOrThrow({
          where: { ReservationKey: request.reservationKey },
          select: { ApproveStatus: true },
        })
      ).ApproveStatus,
      loan:
        (
          await prisma.usageLog.findUnique({
            where: { UsageKey: prepared.usageKey },
            select: { CurrentStatus: true },
          })
        )?.CurrentStatus ?? null,
      unit: (
        await prisma.resourceInfo.findUniqueOrThrow({
          where: { ResourceKey: f.units[0].ResourceKey },
          select: { ResourceStatus: true },
        })
      ).ResourceStatus,
      pickupPhotos: await prisma.images.count({
        where: { UsageKey: prepared.usageKey },
      }),
    }).toEqual({
      outcomes: ['ok', 'CANNOT_CANCEL'],
      request: 'Approved',
      loan: 'Lended',
      unit: 'Lended',
      pickupPhotos: 1,
    });
  }, 20_000);

  /**
   * Holds every `tx[model][method]` call inside `client.$transaction` for
   * `holdMs`, resolving `reached` first, so the test can act while that
   * transaction has written but not committed.
   */
  function withSlowStep(
    client: PrismaService,
    model: string,
    method: string,
    holdMs: number,
  ): { client: PrismaService; reached: Promise<void> } {
    let signal!: () => void;
    const reached = new Promise<void>((resolve) => (signal = resolve));
    const slowTx = (tx: object) =>
      new Proxy(tx, {
        get(target, prop) {
          const value = (target as Record<string | symbol, unknown>)[prop];
          if (prop !== model) {
            return typeof value === 'function'
              ? (value as (...a: unknown[]) => unknown).bind(target)
              : value;
          }
          return new Proxy(value as Record<string, unknown>, {
            get(delegate, name) {
              const fn = delegate[name as string];
              if (name !== method || typeof fn !== 'function') return fn;
              return async (...args: unknown[]) => {
                signal();
                await new Promise((resolve) => setTimeout(resolve, holdMs));
                return (fn as (...a: unknown[]) => Promise<unknown>).apply(
                  delegate,
                  args,
                );
              };
            },
          });
        },
      });
    const wrapped = new Proxy(client, {
      get(target, prop) {
        const value = (target as unknown as Record<string | symbol, unknown>)[
          prop
        ];
        if (prop === '$transaction') {
          return (work: (tx: object) => Promise<unknown>, options?: unknown) =>
            (
              value as (
                w: (tx: object) => Promise<unknown>,
                o?: unknown,
              ) => Promise<unknown>
            ).call(target, (tx: object) => work(slowTx(tx)), options);
        }
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      },
    });
    return { client: wrapped, reached };
  }

  /**
   * Holds the first `parties` calls of `client[model][method]` until all of
   * them have their result, so every caller is past its read-before-the-
   * transaction before any of them writes. Later calls pass straight through.
   * Without it, two calls started together usually run one after the other and
   * the race would only show up now and then (#220 R4 reproduced on the live
   * stack, not in Jest).
   */
  function withReadBarrier<T extends object>(
    client: T,
    model: string,
    method: string,
    parties = 2,
  ): T {
    let arrived = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    // Never hang the suite if a caller fails before reaching the read.
    const timer = setTimeout(() => release(), 5_000);
    const delegate = (client as Record<string, unknown>)[model] as Record<
      string,
      unknown
    >;
    const wrapped = new Proxy(delegate, {
      get(target, prop) {
        const value = target[prop as string];
        if (prop !== method || typeof value !== 'function') return value;
        return async (...args: unknown[]) => {
          const result: unknown = await (
            value as (...a: unknown[]) => Promise<unknown>
          ).apply(target, args);
          if (arrived < parties) {
            arrived += 1;
            if (arrived === parties) {
              clearTimeout(timer);
              release();
            }
            await gate;
          }
          return result;
        };
      },
    });
    return new Proxy(client, {
      get(target, prop) {
        if (prop === model) return wrapped;
        const value = (target as Record<string | symbol, unknown>)[prop];
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      },
    });
  }

  it('grades a return once when two staff save a grade together', async () => {
    const f = await pickupFixture(prisma);
    const { loan, requests } = realServices();
    const request = await pickupRequest({ ...f, service: requests });
    const prepared = await loan.allocate(f.staff, {
      reservationKey: request.reservationKey,
      condition: 'Normal',
    });
    await prisma.images.createMany({
      data: (['BeforePicture', 'AfterPicture'] as const).map((stage) => ({
        UsageKey: prepared.usageKey,
        ResourceKey: f.units[0].ResourceKey,
        SubmittedBy: f.users[0].accountKey,
        SubmissionType: stage,
        ImageURL: `/media/inspection/race-${stage}.png`,
        ActionTime: PICKUP_START,
      })),
    });
    freezeBusinessDate(PICKUP_START);
    await requests.confirmMyPickup(f.users[0], prepared.usageKey);
    freezeBusinessDate(new Date(PICKUP_START.getTime() + 86_400_000));
    await loan.recordReturn(f.staff, { usageKey: prepared.usageKey });

    const inspection = new InspectionService(
      withReadBarrier(prisma, 'usageLog', 'findUnique'),
      new StaffScopeService(prisma),
      new PenaltyService(prisma),
      { toStoredEvidenceUrl: (url: string) => url } as never,
      { record: jest.fn() } as never,
      new NotificationService(prisma),
    );
    const grade = createInspectionInput.parse({
      usageKey: prepared.usageKey,
      level: 'B2',
      note: 'two inspectors at once',
      imageUrls: ['/media/inspection/race-grade.png'],
    });

    const settled = await Promise.allSettled([
      inspection.createInspection(f.staff, grade),
      inspection.createInspection(f.staff, grade),
    ]);

    // One grade, one penalty: a second penalty would charge the borrower twice.
    expect({
      fulfilled: settled.filter((s) => s.status === 'fulfilled').length,
      refused: settled
        .filter((s): s is PromiseRejectedResult => s.status === 'rejected')
        .map((s) => (s.reason as { businessCode?: string }).businessCode),
      inspections: await prisma.inspection.count({
        where: { UsageKey: prepared.usageKey },
      }),
      penalties: await prisma.penaltyInfo.count({
        where: { UsageKey: prepared.usageKey },
      }),
    }).toEqual({
      fulfilled: 1,
      refused: ['ALREADY_INSPECTED'],
      inspections: 1,
      penalties: 1,
    });
  }, 20_000);
});
