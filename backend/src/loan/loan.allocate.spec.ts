import { randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import {
  listStaffQueueInput,
  paginatedStaffQueue,
  loanOutput,
  staffQueueCounts,
} from './loan.schema';
import {
  historyFixture,
  inHistoryFixture,
  requireIsolatedDatabase,
  transactionClient,
} from '../../tests/fixtures/borrower-history';
import { freezeBusinessDate } from '../../tests/fixtures/business-clock';
import { LoanService } from './loan.service';
import { PrismaService } from '../prisma.service';
import { StaffScopeService } from '../common/authority/staff-scope.service';
import type { PenaltyService } from '../common/penalty/penalty.service';
import type { NotificationService } from '../notification/notification.service';
import type { TrpcUser } from '../trpc/context';

/**
 * Preparing a request with a different unit than the one reserved.
 *
 * A T2 request is approved for one serial, so preparing another hands out a
 * unit nobody approved. swapUnit refused that at pickup, but allocate reached
 * the same result at preparation without looking at the tier.
 */
const staff = {
  accountKey: 4,
  role: 'staff',
  facultyKey: null,
  creditScore: 100,
} as TrpcUser;

function reserved(ruleName: string) {
  return {
    ReservationKey: 11,
    ReservedBy: 3,
    ApproveStatus: 'Approved',
    StartTime: new Date('2099-01-10T02:00:00Z'),
    EndTime: new Date('2099-01-11T09:00:00Z'),
    Resource: {
      ResourceKey: 26,
      ManagedBy: 3,
      BufferTime: 0,
      BorrowRule: 3,
      BorrowRuleInfo: { RuleName: ruleName },
      Item: {
        ItemKey: 7,
        ItemID: 'EE-OSC-001',
        Item: { ItemName: 'Scope', CreditWeight: 3 },
      },
      Room: null,
    },
    UsageLogs: [],
  };
}

function service(ruleName: string) {
  const findTarget = jest.fn().mockResolvedValue(null);
  const prisma = {
    reservations: {
      findUnique: jest.fn().mockResolvedValue(reserved(ruleName)),
    },
    resourceInfo: { findUnique: findTarget },
  } as unknown as PrismaService;
  const scope = {
    assertResourceInScope: jest.fn(),
  } as unknown as StaffScopeService;
  const audit = { record: jest.fn() };
  return {
    svc: new LoanService(
      prisma,
      scope,
      {} as PenaltyService,
      {} as NotificationService,
      audit as never,
    ),
    findTarget,
    audit,
  };
}

// Demo feedback: staff choose the unit at preparation for every tier.
it.each(['T1', 'T2'])(
  'lets a %s request go out on another unit of the same type',
  async (tier) => {
    const t = service(tier);
    // Past the scope check, the target is looked up; null here stops it there.
    await expect(
      t.svc.allocate(staff, {
        reservationKey: 11,
        resourceKey: 27,
        condition: 'Normal',
      }),
    ).rejects.toMatchObject({ businessCode: 'RESOURCE_NOT_FOUND' });
    expect(t.findTarget).toHaveBeenCalled();
  },
);

describe('allocate — audit trail', () => {
  function svcAllocating() {
    const row = reserved('T1');
    const tx = {
      conditionLog: {
        create: jest.fn().mockResolvedValue({ ConditionKey: 900 }),
      },
      usageLog: { create: jest.fn().mockResolvedValue({ UsageKey: 501 }) },
      resourceInfo: { update: jest.fn().mockResolvedValue({}) },
      reservations: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      reservations: {
        findUnique: jest.fn().mockResolvedValue(row),
        // The double-booking check (NFR-REL-02): no other booking clashes.
        findUniqueOrThrow: jest.fn().mockResolvedValue(row),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      resourceInfo: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ResourceStatus: 'InStorage',
          AllowBorrow: true,
          UsageLogs: [],
        }),
      },
      $transaction: jest.fn((work: (t: typeof tx) => unknown) => work(tx)),
    } as unknown as PrismaService;
    const scope = {
      assertResourceInScope: jest.fn(),
    } as unknown as StaffScopeService;
    const notifications = {
      pickupReady: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationService;
    const audit = { record: jest.fn() };
    const svc = new LoanService(
      prisma,
      scope,
      {} as PenaltyService,
      notifications,
      audit as never,
    );
    Object.assign(svc, {
      readUsage: jest.fn().mockResolvedValue({
        UsageKey: 501,
        ReservationKey: 11,
        CurrentStatus: 'Prepared',
        DueTime: row.EndTime,
        CheckoutTime: row.StartTime,
        CheckInTime: null,
        PendingExtension: null,
        Account: {
          AccountKey: 3,
          UserID: 'u3',
          UserFName: 'F',
          UserLName: 'L',
          UserCredit: 80,
        },
        Resource: row.Resource,
        CheckoutConditionLog: { Condition: 'Normal', Notes: null },
        CheckInConditionLog: null,
      }),
    });
    return { svc, audit };
  }

  it('records the allocation after it succeeds', async () => {
    const t = svcAllocating();
    await t.svc.allocate(staff, { reservationKey: 11, condition: 'Normal' });

    expect(t.audit.record).toHaveBeenCalledWith(
      { accountKey: staff.accountKey },
      'update',
      'reservation/11',
      expect.any(String),
    );
  });
});

describe('confirmPickup before the booked time', () => {
  const now = new Date('2099-01-09T02:00:00Z');
  // Booked 10 Jan 02:00 to 11 Jan 09:00, prepared a day ahead.
  const prepared = (room = false) => ({
    UsageKey: 8,
    ReservationKey: 11,
    CurrentStatus: 'Prepared',
    CheckoutTime: new Date('2099-01-10T02:00:00Z'),
    DueTime: new Date('2099-01-11T09:00:00Z'),
    Resource: {
      ResourceKey: 26,
      BufferTime: 0,
      Room: room ? { RoomName: 'Lab' } : null,
    },
    CheckoutConditionLog: { Condition: 'Normal' },
  });

  function svcFor(
    usage: ReturnType<typeof prepared>,
    clash: { ReservationKey: number } | null = null,
    photo = true,
  ) {
    const tx = {
      reservations: {
        findFirst: jest.fn().mockResolvedValue(clash),
        update: jest.fn().mockResolvedValue({}),
      },
      usageLog: { update: jest.fn().mockResolvedValue({}) },
      resourceInfo: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      images: {
        findFirst: jest.fn().mockResolvedValue(photo ? { ImageKey: 1 } : null),
      },
      $transaction: jest.fn((work: (t: typeof tx) => unknown) => work(tx)),
    };
    const scope = {
      assertResourceInScope: jest.fn(),
    } as unknown as StaffScopeService;
    const audit = { record: jest.fn() };
    const svc = new LoanService(
      prisma as unknown as PrismaService,
      scope,
      {} as PenaltyService,
      {} as NotificationService,
      audit as never,
    );
    Object.assign(svc, {
      readUsage: jest.fn().mockResolvedValue(usage),
      toLoan: jest.fn().mockReturnValue({}),
    });
    return { svc, tx, audit, prisma };
  }

  beforeEach(() =>
    jest.useFakeTimers({ now, doNotFake: ['nextTick', 'setImmediate'] }),
  );
  afterEach(() => jest.useRealTimers());

  it('refuses a plain handover before the pickup window', async () => {
    const t = svcFor(prepared());
    await expect(
      t.svc.confirmPickup(staff, { usageKey: 8 }),
    ).rejects.toMatchObject({
      businessCode: 'PICKUP_NOT_OPEN',
    });
    expect(t.tx.usageLog.update).not.toHaveBeenCalled();
  });

  it('moves the due date one day earlier, and off a weekend to Monday closing time (#178)', async () => {
    const t = svcFor(prepared());
    await t.svc.confirmPickup(staff, { usageKey: 8, early: true });

    // Sunday 11 Jan 16:00 one day earlier is Saturday, which the counter is
    // shut on, so it lands on Monday 12 Jan 17:00 Bangkok.
    const due = new Date('2099-01-12T10:00:00Z');
    expect(t.tx.reservations.update).toHaveBeenCalledWith({
      where: { ReservationKey: 11 },
      data: { StartTime: now, EndTime: due },
    });
    expect(t.tx.usageLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          CurrentStatus: 'Lended',
          CheckoutTime: now,
          DueTime: due,
        }),
      }),
    );
  });

  it('refuses an early handover when the added window including BufferTime clashes with another booking', async () => {
    const usage = prepared();
    usage.Resource.BufferTime = 1;
    const t = svcFor(usage, { ReservationKey: 12 });
    await expect(
      t.svc.confirmPickup(staff, { usageKey: 8, early: true }),
    ).rejects.toMatchObject({
      businessCode: 'WINDOW_NOT_AVAILABLE',
    });
    expect(t.tx.reservations.findFirst).toHaveBeenCalledWith({
      where: {
        ResourceKey: 26,
        ApproveStatus: { in: ['Pending', 'Approved'] },
        UsageLogs: { none: { CurrentStatus: 'Inspected' } },
        StartTime: { lt: new Date('2099-01-11T02:00:00Z') },
        EndTime: { gt: new Date('2099-01-08T02:00:00Z') },
        ReservationKey: { not: 11 },
      },
      select: { ReservationKey: true },
    });
    expect(t.tx.reservations.update).not.toHaveBeenCalled();
    expect(t.tx.usageLog.update).not.toHaveBeenCalled();
    expect(t.tx.resourceInfo.update).not.toHaveBeenCalled();
    expect(t.audit.record).not.toHaveBeenCalled();
  });

  it('refuses a handover nobody photographed (FR-PKP-03)', async () => {
    const t = svcFor(prepared(), null, false);
    await expect(
      t.svc.confirmPickup(staff, { usageKey: 8, early: true }),
    ).rejects.toMatchObject({
      businessCode: 'PICKUP_PHOTO_REQUIRED',
    });
    expect(t.tx.usageLog.update).not.toHaveBeenCalled();
  });

  it('never moves a room booking off its slots', async () => {
    const t = svcFor(prepared(true));
    await expect(
      t.svc.confirmPickup(staff, { usageKey: 8, early: true }),
    ).rejects.toMatchObject({
      businessCode: 'PICKUP_NOT_OPEN',
    });
    expect(t.prisma.$transaction).not.toHaveBeenCalled();
    expect(t.tx.reservations.update).not.toHaveBeenCalled();
    expect(t.tx.usageLog.update).not.toHaveBeenCalled();
    expect(t.audit.record).not.toHaveBeenCalled();
  });

  // an early receipt can land after the shifted return time.
  // Accept the handover but retain the original due date in that case.
  describe.each(['T0', 'T1', 'T2'])(
    '%s: early receipt must not create an already-due loan',
    (tier) => {
      describe.each([
        {
          label: 'one millisecond before shifted due',
          actual: '2026-10-07T15:59:59.999+07:00',
          keepOriginal: false,
        },
        {
          label: 'exactly at shifted due',
          actual: '2026-10-07T16:00:00.000+07:00',
          keepOriginal: true,
        },
        {
          label: 'one millisecond after shifted due',
          actual: '2026-10-07T16:00:00.001+07:00',
          keepOriginal: true,
        },
        {
          label: 'the reported 18:27 receipt',
          actual: '2026-10-07T18:27:00.000+07:00',
          keepOriginal: true,
        },
      ])('$label', ({ actual, keepOriginal }) => {
        let persistedDue: Date;
        let reservationEnd: Date;
        const receiptAt = new Date(actual);
        const originalDue = new Date('2026-10-08T16:00:00+07:00');
        beforeEach(async () => {
          jest.setSystemTime(receiptAt);
          const usage = {
            ...prepared(),
            CheckoutTime: new Date('2026-10-08T09:00:00+07:00'),
            DueTime: originalDue,
            Resource: {
              ...prepared().Resource,
              BorrowRuleInfo: { RuleName: tier },
            },
          };
          const t = svcFor(usage);
          // A correct implementation must still accept this authorized handover.
          // Thrown errors or missing writes must not count as expected failures.
          await t.svc.confirmPickup(staff, { usageKey: 8, early: true });
          expect(t.tx.usageLog.update).toHaveBeenCalledTimes(1);
          expect(t.tx.reservations.update).toHaveBeenCalledTimes(1);
          expect(t.tx.usageLog.update).toHaveBeenCalledWith({
            where: { UsageKey: 8 },
            data: {
              CurrentStatus: 'Lended',
              CheckoutTime: receiptAt,
              DueTime: expect.any(Date),
            },
          });
          expect(t.tx.reservations.update).toHaveBeenCalledWith({
            where: { ReservationKey: 11 },
            data: { StartTime: receiptAt, EndTime: expect.any(Date) },
          });
          expect(t.tx.resourceInfo.update).toHaveBeenCalledWith({
            where: { ResourceKey: 26 },
            data: { ResourceStatus: 'Lended' },
          });
          persistedDue = t.tx.usageLog.update.mock.calls[0][0].data
            .DueTime as Date;
          reservationEnd = t.tx.reservations.update.mock.calls[0][0].data
            .EndTime as Date;
          expect(reservationEnd).toEqual(persistedDue);
        });
        if (keepOriginal) {
          it('accepts pickup and retains the original due when shifting would end at or before receipt', () => {
            expect(persistedDue).toEqual(originalDue);
            expect(reservationEnd).toEqual(originalDue);
            expect(persistedDue.getTime()).toBeGreaterThan(receiptAt.getTime());
          });
        } else {
          it('still shifts only the date when the resulting due is after receipt', () => {
            const shiftedDue = new Date('2026-10-07T16:00:00+07:00');
            expect(persistedDue).toEqual(shiftedDue);
            expect(reservationEnd).toEqual(shiftedDue);
            expect(persistedDue.getTime()).toBeGreaterThan(receiptAt.getTime());
          });
        }
      });
    },
  );

  // Explicit Bangkok offsets and fixed expected dates are the requirement's
  // oracle. Do not derive expectations using the service's duration formula.
  const earlyDateCases = [
    {
      name: 'pickup a day earlier at a different clock time',
      planned: '2026-10-05T09:00:00+07:00',
      actual: '2026-10-04T13:00:00+07:00',
      originalDue: '2026-10-08T17:00:00+07:00',
      expectedDue: '2026-10-07T17:00:00+07:00',
    },
    {
      name: 'pickup earlier on the same Bangkok calendar day',
      planned: '2026-10-05T09:00:00+07:00',
      actual: '2026-10-05T08:00:00+07:00',
      originalDue: '2026-10-08T17:00:00+07:00',
      expectedDue: '2026-10-08T17:00:00+07:00',
    },
    {
      name: 'pickup the previous evening at closing time',
      // Kept inside counter hours: Oct 5 08:00 vs Oct 4 17:00 (#179).
      planned: '2026-10-05T08:00:00+07:00',
      actual: '2026-10-04T17:00:00+07:00',
      originalDue: '2026-10-08T17:00:00+07:00',
      expectedDue: '2026-10-07T17:00:00+07:00',
    },
    {
      name: 'pickup two calendar days earlier across a month boundary',
      planned: '2026-10-01T09:00:00+07:00',
      actual: '2026-09-29T13:00:00+07:00',
      originalDue: '2026-10-03T17:15:37.456+07:00',
      expectedDue: '2026-10-01T17:15:37.456+07:00',
    },
  ];

  describe.each(['T0', 'T1', 'T2'])(
    'FR-PKP-06 / %s: early pickup preserves the original due clock time',
    (tier) => {
      describe.each(earlyDateCases)('$name', (scenario) => {
        let writes: { due: Date; reservationEnd: Date };

        beforeEach(async () => {
          const actual = new Date(scenario.actual);
          jest.setSystemTime(actual);
          const usage = {
            ...prepared(),
            CheckoutTime: new Date(scenario.planned),
            DueTime: new Date(scenario.originalDue),
            Resource: {
              ...prepared().Resource,
              BorrowRuleInfo: { RuleName: tier },
            },
          };
          const t = svcFor(usage);
          await t.svc.confirmPickup(staff, { usageKey: 8, early: true });

          // Setup and the unaffected handover contract must pass normally.
          // An expected defect must never hide a thrown error or missing write.
          expect(t.prisma.images.findFirst).toHaveBeenCalledWith({
            where: { UsageKey: 8, SubmissionType: 'BeforePicture' },
            select: { ImageKey: true },
          });
          expect(t.prisma.$transaction).toHaveBeenCalledTimes(1);
          expect(t.tx.reservations.findFirst).toHaveBeenCalledTimes(1);
          expect(t.tx.reservations.update).toHaveBeenCalledTimes(1);
          expect(t.tx.usageLog.update).toHaveBeenCalledTimes(1);
          expect(t.tx.usageLog.update).toHaveBeenCalledWith({
            where: { UsageKey: 8 },
            data: {
              CurrentStatus: 'Lended',
              CheckoutTime: actual,
              DueTime: expect.any(Date),
            },
          });
          expect(t.tx.reservations.update).toHaveBeenCalledWith({
            where: { ReservationKey: 11 },
            data: { StartTime: actual, EndTime: expect.any(Date) },
          });
          expect(t.tx.resourceInfo.update).toHaveBeenCalledWith({
            where: { ResourceKey: 26 },
            data: { ResourceStatus: 'Lended' },
          });
          expect(t.audit.record).toHaveBeenCalledTimes(1);

          const due = t.tx.usageLog.update.mock.calls[0][0].data
            .DueTime as Date;
          const reservationEnd = t.tx.reservations.update.mock.calls[0][0].data
            .EndTime as Date;
          expect(reservationEnd).toEqual(due);
          writes = { due, reservationEnd };
        });

        // #150: these were red before the due date moved by calendar days.
        it('shifts only the due calendar date in Asia/Bangkok and preserves the original time in both records', () => {
          const expected = new Date(scenario.expectedDue);
          expect(writes).toEqual({ due: expected, reservationEnd: expected });
        });
      });
    },
  );

  it.each([
    ['on time', '2099-01-10T02:00:00Z'],
    ['inside the 15-minute pickup grace window', '2099-01-10T01:50:00Z'],
    ['late', '2099-01-10T04:00:00Z'],
  ])(
    'keeps the original due date and time when pickup is %s',
    async (_, iso) => {
      const actual = new Date(iso);
      jest.setSystemTime(actual);
      const usage = prepared();
      const t = svcFor(usage);
      await t.svc.confirmPickup(staff, { usageKey: 8 });
      expect(t.tx.usageLog.update).toHaveBeenCalledWith({
        where: { UsageKey: 8 },
        data: {
          CurrentStatus: 'Lended',
          CheckoutTime: actual,
          DueTime: usage.DueTime,
        },
      });
    },
  );
});

// Real service/adapter assertions share this module's suite; setup is scoped.
describe('Staff preparation and handover queues from persisted records', () => {
  const NOW = new Date('2031-09-26T03:00:00Z');

  const DAY = 86_400_000;

  type Fixture = Awaited<ReturnType<typeof historyFixture>>;

  function services(tx: Prisma.TransactionClient) {
    const client = transactionClient(tx);
    return new LoanService(
      client,
      new StaffScopeService(client),
      {} as never,
      {} as never,
      {} as never,
    );
  }

  // Each current loan gets its own physical unit and matching checkout evidence.
  async function usage(
    tx: Prisma.TransactionClient,
    f: Fixture,
    status: 'Prepared' | 'Lended' | 'Returned',
    dueOffset: number,
    ruleKey = f.rule.BorrowRuleKey,
  ) {
    const resource = await tx.resourceInfo.create({
      data: {
        ManagedBy: f.group.ManageGroupKey,
        BorrowRule: ruleKey,
        BufferTime: 0,
        ResourceType: 'Item',
        ResourceStatus: status === 'Lended' ? 'Lended' : 'InStorage',
        AllowBorrow: true,
        Item: {
          create: {
            ItemID: `queue-${randomUUID()}`,
            Item: { create: { ItemName: 'Queue meter', CreditWeight: 1 } },
          },
        },
      },
    });
    const checkout = await tx.conditionLog.create({
      data: {
        ResourceKey: resource.ResourceKey,
        LoggedBy: f.inspector.AccountKey,
        Condition: 'Normal',
        LoggedAt: new Date(NOW.getTime() - 20 * DAY),
      },
    });
    return tx.usageLog.create({
      data: {
        ResourceKey: resource.ResourceKey,
        AccountKey: f.borrower.AccountKey,
        CurrentStatus: status,
        CheckoutCondition: checkout.ConditionKey,
        CheckoutTime: new Date(NOW.getTime() - 20 * DAY),
        DueTime: new Date(NOW.getTime() + dueOffset),
        CheckInTime: status === 'Returned' ? NOW : null,
      },
    });
  }

  async function reservation(
    tx: Prisma.TransactionClient,
    f: Fixture,
    status: 'Approved' | 'Pending' | 'Rejected',
    offset: number,
  ) {
    return tx.reservations.create({
      data: {
        ResourceKey: f.resource.ResourceKey,
        ReservedBy: f.borrower.AccountKey,
        ApproveStatus: status,
        StartTime: new Date(NOW.getTime() + offset),
        EndTime: new Date(NOW.getTime() + offset + DAY),
        ActionTime: NOW,
        ReservationExpiration: new Date(NOW.getTime() + offset + DAY),
      },
    });
  }

  describe('FR-STF-01/02 / NFR-SEC-03: real staff queue filtering and detail access', () => {
    let prisma: PrismaService;
    beforeAll(async () => {
      requireIsolatedDatabase();
      prisma = new PrismaService();
      await prisma.$connect();
    });
    afterAll(async () => prisma?.$disconnect());
    beforeEach(() => freezeBusinessDate(NOW));
    afterEach(() => jest.useRealTimers());

    it('lists only approved unprepared requests in scope and does not present a suggested serial as confirmed', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const own = await historyFixture(tx),
          foreign = await historyFixture(tx);
        const visible = await reservation(tx, own, 'Approved', DAY);
        await reservation(tx, own, 'Pending', 2 * DAY);
        await reservation(tx, own, 'Rejected', 3 * DAY);
        await reservation(tx, foreign, 'Approved', DAY);
        const prepared = await reservation(tx, own, 'Approved', 4 * DAY);
        const preparedUsage = await usage(tx, own, 'Prepared', 5 * DAY);
        await tx.reservations.update({
          where: { ReservationKey: prepared.ReservationKey },
          data: { ResourceKey: preparedUsage.ResourceKey },
        });
        await tx.usageLog.update({
          where: { UsageKey: preparedUsage.UsageKey },
          data: { ReservationKey: prepared.ReservationKey },
        });
        const result = paginatedStaffQueue
          .strict()
          .parse(
            await services(tx).listStaffQueue(
              { ...own.decider, role: 'staff' },
              listStaffQueueInput.parse({ bucket: 'toPrepare' }),
            ),
          );
        expect(result.total).toBe(1);
        expect(result.items).toHaveLength(1);
        expect(result.items[0]).toMatchObject({
          reservationKey: visible.ReservationKey,
          usageKey: null,
          status: null,
          serialNo: null,
          tier: 'T2',
          borrower: {
            accountKey: own.borrower.AccountKey,
            studentId: own.borrower.UserID,
          },
          overdueDays: 0,
          lostEligible: false,
        });
      });
    });

    it('pages preparation requests oldest first without duplicating rows', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await historyFixture(tx);
        const later = await reservation(tx, f, 'Approved', 3 * DAY);
        const earlier = await reservation(tx, f, 'Approved', DAY);
        const service = services(tx);
        const first = await service.listStaffQueue(
          f.decider,
          listStaffQueueInput.parse({ bucket: 'toPrepare', pageSize: 1 }),
        );
        const second = await service.listStaffQueue(
          f.decider,
          listStaffQueueInput.parse({
            bucket: 'toPrepare',
            pageSize: 1,
            page: 2,
          }),
        );
        expect([first.total, second.total]).toEqual([2, 2]);
        expect([
          first.items[0].reservationKey,
          second.items[0].reservationKey,
        ]).toEqual([earlier.ReservationKey, later.ReservationKey]);
      });
    });

    it('separates handover, on-loan and overdue buckets and excludes another group', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await historyFixture(tx),
          foreign = await historyFixture(tx);
        const prepared = await usage(tx, f, 'Prepared', DAY);
        const late = await usage(tx, f, 'Lended', -1);
        const dueNow = await usage(tx, f, 'Lended', 0);
        const notLate = await usage(tx, f, 'Lended', DAY);
        await usage(tx, f, 'Returned', -DAY);
        await usage(tx, foreign, 'Lended', -DAY);
        const service = services(tx);
        const read = async (bucket: 'toHandover' | 'onLoan' | 'overdue') =>
          paginatedStaffQueue.parse(
            await service.listStaffQueue(
              f.decider,
              listStaffQueueInput.parse({ bucket }),
            ),
          );
        expect(
          (await read('toHandover')).items.map((row) => row.usageKey),
        ).toEqual([prepared.UsageKey]);
        expect((await read('onLoan')).items.map((row) => row.usageKey)).toEqual(
          [late.UsageKey, dueNow.UsageKey, notLate.UsageKey],
        );
        const overdue = await read('overdue');
        expect(overdue.total).toBe(1);
        expect(overdue.items[0]).toMatchObject({
          usageKey: late.UsageKey,
          overdueDays: 1,
          lostEligible: false,
        });
      });
    });

    it.each(['studentId', 'firstName', 'serial'])(
      'searches on-loan queue by %s while preserving group scope',
      async (field) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await historyFixture(tx),
            foreign = await historyFixture(tx);
          const ownUsage = await usage(tx, f, 'Lended', DAY);
          await usage(tx, foreign, 'Lended', DAY);
          const unit = await tx.itemIndiv.findUniqueOrThrow({
            where: { ResourceKey: ownUsage.ResourceKey },
          });
          const q =
            field === 'studentId'
              ? f.borrower.UserID
              : field === 'firstName'
                ? 'BORROWER'
                : unit.ItemID;
          const result = await services(tx).listStaffQueue(
            f.decider,
            listStaffQueueInput.parse({ bucket: 'onLoan', q }),
          );
          expect(result.total).toBe(1);
          expect(result.items[0].usageKey).toBe(ownUsage.UsageKey);
        });
      },
    );

    it('filters the tier without losing staff scope', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await historyFixture(tx);
        const t1 = await tx.borrowRule.create({ data: { RuleName: 'T1' } });
        const wanted = await usage(tx, f, 'Lended', DAY, t1.BorrowRuleKey);
        await usage(tx, f, 'Lended', 2 * DAY);
        const result = await services(tx).listStaffQueue(
          f.decider,
          listStaffQueueInput.parse({ bucket: 'onLoan', tier: 'T1' }),
        );
        expect(result.total).toBe(1);
        expect(result.items[0]).toMatchObject({
          usageKey: wanted.UsageKey,
          tier: 'T1',
        });
      });
    });

    it('reports dashboard counts consistently with the scoped queues', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await historyFixture(tx),
          foreign = await historyFixture(tx);
        await reservation(tx, f, 'Approved', DAY);
        await reservation(tx, foreign, 'Approved', DAY);
        await usage(tx, f, 'Prepared', DAY);
        await usage(tx, f, 'Lended', -DAY);
        await usage(tx, f, 'Lended', DAY);
        await usage(tx, f, 'Returned', -DAY);
        await usage(tx, foreign, 'Lended', -DAY);
        const result = staffQueueCounts
          .strict()
          .parse(await services(tx).getQueueCounts(f.decider));
        expect(result).toEqual({
          toPrepare: 1,
          toHandover: 1,
          onLoan: 2,
          overdue: 1,
          toInspect: 1,
          extensionsToInspect: 0,
        });
      });
    });

    it('returns a loan detail from scope and measures overdue days only up to its return', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await historyFixture(tx);
        const returned = await usage(tx, f, 'Returned', -2 * DAY);
        await tx.usageLog.update({
          where: { UsageKey: returned.UsageKey },
          data: { CheckInTime: new Date(NOW.getTime() - DAY) },
        });
        const result = loanOutput
          .strict()
          .parse(await services(tx).getLoanById(f.decider, returned.UsageKey));
        expect(result).toMatchObject({
          usageKey: returned.UsageKey,
          overdueDays: 1,
          checkoutCondition: 'Normal',
          borrower: { accountKey: f.borrower.AccountKey },
        });
      });
    });

    it("refuses another group's loan detail even when its numeric ID is known", async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const own = await historyFixture(tx),
          foreign = await historyFixture(tx);
        await expect(
          services(tx).getLoanById(own.decider, foreign.usage.UsageKey),
        ).rejects.toMatchObject({ businessCode: 'OUT_OF_MANAGEMENT_SCOPE' });
      });
    });
  });
});
