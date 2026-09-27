import type { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma.service';
import { BusinessError } from '../../src/common/errors/business-error';
import {
  clashingWindowFilter,
  withBuffer,
} from '../../src/common/booking/booking-window';
import {
  allocateLoanInput,
  swapUnitInput,
  loanOutput,
} from '../../src/loan/loan.schema';
import { inHistoryFixture } from '../fixtures/borrower-history';
import { freezeBusinessDate } from '../fixtures/business-clock';
import {
  pickupFixture,
  pickupRequest,
  PICKUP_NOW,
  PICKUP_START,
  PICKUP_END,
} from '../fixtures/pickup';

const DAY = 86_400_000;
type PickupFixture = Awaited<ReturnType<typeof pickupFixture>>;

async function selection(
  f: PickupFixture,
  action: 'allocate' | 'swap',
  reservationKey: number,
) {
  const prepared =
    action === 'swap'
      ? loanOutput
          .strict()
          .parse(
            await f.loan.allocate(
              f.staff,
              allocateLoanInput.parse({ reservationKey }),
            ),
          )
      : null;
  return () =>
    action === 'swap'
      ? f.loan.swapUnit(
          f.staff,
          swapUnitInput.parse({
            usageKey: prepared!.usageKey,
            resourceKey: f.units[1].ResourceKey,
            reason: 'Borrower requests a replacement',
          }),
        )
      : f.loan.allocate(
          f.staff,
          allocateLoanInput.parse({
            reservationKey,
            resourceKey: f.units[1].ResourceKey,
          }),
        );
}

async function snapshot(
  tx: Prisma.TransactionClient,
  f: PickupFixture,
  reservationKey: number,
) {
  const keys = f.units.map((unit) => unit.ResourceKey);
  return {
    reservation: await tx.reservations.findUniqueOrThrow({
      where: { ReservationKey: reservationKey },
    }),
    usages: await tx.usageLog.findMany({
      where: { ReservationKey: reservationKey },
      orderBy: { UsageKey: 'asc' },
    }),
    resources: await tx.resourceInfo.findMany({
      where: { ResourceKey: { in: keys } },
      orderBy: { ResourceKey: 'asc' },
    }),
    conditions: await tx.conditionLog.findMany({
      where: { ResourceKey: { in: keys } },
      orderBy: { ConditionKey: 'asc' },
    }),
    notifications: await tx.notification.findMany({
      where: { AccountKey: f.users[0].accountKey },
      orderBy: { NotificationKey: 'asc' },
    }),
  };
}

describe('NFR-REL-02 / SDS 4.4: unit selection preserves reserved windows', () => {
  let prisma: PrismaService;
  let termEnd: string | undefined;
  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    termEnd = process.env.TERM_END_DATE;
    delete process.env.TERM_END_DATE;
  });
  afterAll(async () => {
    if (termEnd === undefined) delete process.env.TERM_END_DATE;
    else process.env.TERM_END_DATE = termEnd;
    await prisma?.$disconnect();
  });
  beforeEach(() => freezeBusinessDate(PICKUP_NOW));
  afterEach(() => jest.useRealTimers());

  describe.each(['allocate', 'swap'] as const)('%s', (action) => {
    it.each(['adjacent booking', 'canceled booking'] as const)(
      'allows a replacement with a %s that does not hold this window',
      async (kind) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await pickupFixture(tx);
          const own = await pickupRequest(f);
          const other = await pickupRequest(
            f,
            1,
            1,
            kind === 'adjacent booking' ? PICKUP_END : PICKUP_START,
            kind === 'adjacent booking'
              ? new Date(PICKUP_END.getTime() + DAY)
              : PICKUP_END,
          );
          if (kind === 'canceled booking')
            await f.service.cancel(f.users[1], {
              reservationKey: other.reservationKey,
            });
          const perform = await selection(f, action, own.reservationKey);
          const output = loanOutput.strict().parse(await perform());
          expect(output).toMatchObject({
            status: 'Prepared',
            resourceKey: f.units[1].ResourceKey,
          });
          expect(
            await tx.reservations.findUniqueOrThrow({
              where: { ReservationKey: own.reservationKey },
            }),
          ).toMatchObject({ ResourceKey: f.units[1].ResourceKey });
          expect(
            await tx.usageLog.findUniqueOrThrow({
              where: { UsageKey: output.usageKey },
            }),
          ).toMatchObject({
            ReservationKey: own.reservationKey,
            ResourceKey: f.units[1].ResourceKey,
          });
        });
      },
    );

    describe.each(['overlapping booking', 'preparation buffer'] as const)(
      '%s',
      (kind) => {
        let actual: {
          rejected: boolean;
          state: Awaited<ReturnType<typeof snapshot>>;
        };
        let expected: typeof actual;
        beforeEach(async () => {
          await inHistoryFixture(prisma, async (tx) => {
            const f = await pickupFixture(tx);
            const own = await pickupRequest(f);
            if (kind === 'preparation buffer')
              await tx.resourceInfo.update({
                where: { ResourceKey: f.units[1].ResourceKey },
                data: { BufferTime: 1 },
              });
            const nextStart =
              kind === 'preparation buffer'
                ? new Date(PICKUP_END.getTime() + (3 * DAY) / 4)
                : PICKUP_START;
            const other = await pickupRequest(
              f,
              1,
              1,
              nextStart,
              new Date(nextStart.getTime() + 2 * DAY),
            );
            expect(
              await tx.usageLog.count({
                where: { ResourceKey: f.units[1].ResourceKey },
              }),
            ).toBe(0);
            const window = withBuffer(
              PICKUP_START,
              PICKUP_END,
              kind === 'preparation buffer' ? 1 : 0,
            );
            expect(
              await tx.reservations.count({
                where: clashingWindowFilter(
                  f.units[1].ResourceKey,
                  window.from,
                  window.to,
                ),
              }),
            ).toBe(1);
            const perform = await selection(f, action, own.reservationKey);
            expected = {
              rejected: true,
              state: await snapshot(tx, f, own.reservationKey),
            };
            let rejected = false;
            try {
              loanOutput.strict().parse(await perform());
            } catch (error) {
              // A database, schema or setup error cannot count as the known defect.
              if (!(error instanceof BusinessError)) throw error;
              expect([
                'ITEM_UNAVAILABLE',
                'WINDOW_NOT_AVAILABLE',
                'WINDOW_CROSSES_RESERVATION',
              ]).toContain(error.businessCode);
              rejected = true;
            }
            expect(
              await tx.reservations.findUniqueOrThrow({
                where: { ReservationKey: other.reservationKey },
              }),
            ).toMatchObject({
              ResourceKey: f.units[1].ResourceKey,
              ApproveStatus: 'Approved',
            });
            actual = {
              rejected,
              state: await snapshot(tx, f, own.reservationKey),
            };
          });
        });

        // Confirmed against SRS NFR-REL-02 and SDS 4.4: allocation must not
        // promise the same unit twice. FR-RSV-06 also preserves preparation days.
        // assertUnitFree currently checks UsageLog, but not Reservations.
        it(
          'rejects the unavailable target without moving the reservation or writing pickup state',
          () => {
            expect(actual).toEqual(expected);
          },
        );
      },
    );
  });
});
