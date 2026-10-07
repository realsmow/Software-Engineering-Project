import type { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import { BusinessError } from '../../src/common/errors/business-error';
import {
  clashingWindowFilter,
  withBuffer,
} from '../../src/common/booking/booking-window';
import {
  allocateLoanInput,
  swapUnitInput,
  loanOutput,
  recordReturnOutput,
} from '../../src/loan/loan.schema';
import { inHistoryFixture } from '../fixtures/borrower-history';
import { freezeBusinessDate } from '../fixtures/business-clock';
import { workHours } from '../../src/common/schemas/datetime.schema';
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
  // Staff swap by the serial on the label (#149).
  const serial = await f.client.itemIndiv.findUniqueOrThrow({
    where: { ResourceKey: f.units[1].ResourceKey },
    select: { ItemID: true },
  });
  return () =>
    action === 'swap'
      ? f.loan.swapUnit(
          f.staff,
          swapUnitInput.parse({
            usageKey: prepared!.usageKey,
            serialNo: serial.ItemID,
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
    requireIsolatedDatabase();
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

  describe('early receipt preserves a future return deadline', () => {
    let savedHours: { start: number; end: number };
    beforeEach(() => {
      savedHours = { ...workHours };
      // The screenshot's 18:27 receipt is inside this configured opening window.
      // This isolates the inverted deadline from a separate hours-policy issue.
      Object.assign(workHours, { start: 8, end: 20 });
      jest.setSystemTime(new Date('2026-10-07T07:00:00+07:00'));
    });
    afterEach(() => Object.assign(workHours, savedHours));
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
      const receiptAt = new Date(actual);
      const originalDue = new Date('2026-10-08T16:00:00+07:00');
      let actualDue: { api: string; usage: Date; reservation: Date };
      beforeEach(async () => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await pickupFixture(tx);
          const request = await pickupRequest(
            f,
            0,
            0,
            new Date('2026-10-08T09:00:00+07:00'),
            originalDue,
          );
          const prepared = loanOutput
            .strict()
            .parse(
              await f.loan.allocate(
                f.staff,
                allocateLoanInput.parse({
                  reservationKey: request.reservationKey,
                }),
              ),
            );
          expect(prepared).toMatchObject({
            status: 'Prepared',
            dueAt: originalDue.toISOString(),
          });
          jest.setSystemTime(receiptAt);
          await tx.images.create({
            data: {
              UsageKey: prepared.usageKey,
              ResourceKey: prepared.resourceKey,
              SubmittedBy: f.users[0].accountKey,
              SubmissionType: 'BeforePicture',
              ImageURL: '/media/early-pickup-deadline.png',
              ActionTime: receiptAt,
            },
          });
          const collected = loanOutput
            .strict()
            .parse(
              await f.loan.confirmPickup(f.staff, {
                usageKey: prepared.usageKey,
                early: true,
              }),
            );
          expect(collected).toMatchObject({
            status: 'Lended',
            checkoutAt: receiptAt.toISOString(),
          });
          const usage = await tx.usageLog.findUniqueOrThrow({
            where: { UsageKey: prepared.usageKey },
          });
          const reservation = await tx.reservations.findUniqueOrThrow({
            where: { ReservationKey: request.reservationKey },
          });
          expect(usage).toMatchObject({
            CurrentStatus: 'Lended',
            CheckoutTime: receiptAt,
          });
          expect(reservation.StartTime).toEqual(receiptAt);
          expect(reservation.EndTime).toEqual(usage.DueTime);
          expect(collected.dueAt).toBe(usage.DueTime.toISOString());
          expect(
            await tx.resourceInfo.findUniqueOrThrow({
              where: { ResourceKey: collected.resourceKey },
            }),
          ).toMatchObject({ ResourceStatus: 'Lended' });
          // Capture real readback before the enclosing fixture rolls back.
          actualDue = {
            api: collected.dueAt,
            usage: usage.DueTime,
            reservation: reservation.EndTime,
          };
        });
      });
      if (keepOriginal) {
        it.failing(
          'accepts receipt but retains 8 Oct 16:00 in the API and both SQL records',
          () => {
            expect(actualDue).toEqual({
              api: originalDue.toISOString(),
              usage: originalDue,
              reservation: originalDue,
            });
            expect(actualDue.usage.getTime()).toBeGreaterThan(
              receiptAt.getTime(),
            );
          },
        );
      } else {
        it('keeps the usual date-only shift when 7 Oct 16:00 is still in the future', () => {
          const shiftedDue = new Date('2026-10-07T16:00:00+07:00');
          expect(actualDue).toEqual({
            api: shiftedDue.toISOString(),
            usage: shiftedDue,
            reservation: shiftedDue,
          });
          expect(actualDue.usage.getTime()).toBeGreaterThan(
            receiptAt.getTime(),
          );
        });
      }
    });
  });

  it.each(['2031-09-27', '2031-09-28'])(
    'does not let borrower or ordinary staff collect a Monday request on %s',
    async (day) => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await pickupFixture(tx);
        const booked = await pickupRequest(
          f,
          0,
          0,
          new Date('2031-09-29T02:00:00Z'),
          new Date('2031-10-01T10:00:00Z'),
        );
        const prepared = loanOutput
          .strict()
          .parse(
            await f.loan.allocate(
              f.staff,
              allocateLoanInput.parse({
                reservationKey: booked.reservationKey,
              }),
            ),
          );
        await tx.images.create({
          data: {
            UsageKey: prepared.usageKey,
            ResourceKey: f.units[0].ResourceKey,
            SubmittedBy: f.users[0].accountKey,
            SubmissionType: 'BeforePicture',
            ImageURL: '/media/weekend-ready.png',
            ActionTime: new Date(),
          },
        });
        jest.setSystemTime(new Date(`${day}T02:00:00Z`));
        f.audit.record.mockClear();
        const before = await snapshot(tx, f, booked.reservationKey);
        await expect(
          f.service.confirmMyPickup(f.users[0], prepared.usageKey),
        ).rejects.toMatchObject({ businessCode: 'PICKUP_NOT_OPEN' });
        await expect(
          f.loan.confirmPickup(f.staff, { usageKey: prepared.usageKey }),
        ).rejects.toMatchObject({ businessCode: 'PICKUP_NOT_OPEN' });
        expect(await snapshot(tx, f, booked.reservationKey)).toEqual(before);
        expect(f.audit.record).not.toHaveBeenCalled();
      });
    },
  );

  it.each(['2031-09-27', '2031-09-28'])(
    'records an actual %s return before the rolled Monday due without deducting late credit',
    async (day) => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await pickupFixture(tx);
        const request = await pickupRequest(
          f,
          0,
          0,
          new Date('2031-09-26T02:00:00Z'),
          new Date('2031-09-27T06:00:00Z'),
        );
        expect(request.endTime).toBe('2031-09-29T10:00:00.000Z');
        const prepared = loanOutput
          .strict()
          .parse(
            await f.loan.allocate(
              f.staff,
              allocateLoanInput.parse({
                reservationKey: request.reservationKey,
              }),
            ),
          );
        await tx.images.create({
          data: {
            UsageKey: prepared.usageKey,
            ResourceKey: f.units[0].ResourceKey,
            SubmittedBy: f.users[0].accountKey,
            SubmissionType: 'BeforePicture',
            ImageURL: '/media/weekend-return-before.png',
            ActionTime: new Date(),
          },
        });
        jest.setSystemTime(new Date('2031-09-26T02:00:00Z'));
        await f.service.confirmMyPickup(f.users[0], prepared.usageKey);
        const before = await tx.accountInfo.findUniqueOrThrow({
          where: { AccountKey: f.users[0].accountKey },
        });
        jest.setSystemTime(new Date(`${day}T02:00:00Z`));
        await tx.images.create({
          data: {
            UsageKey: prepared.usageKey,
            ResourceKey: f.units[0].ResourceKey,
            SubmittedBy: f.users[0].accountKey,
            SubmissionType: 'AfterPicture',
            ImageURL: '/media/weekend-return-after.png',
            ActionTime: new Date(),
          },
        });
        const returned = recordReturnOutput
          .strict()
          .parse(
            await f.loan.recordReturn(f.staff, { usageKey: prepared.usageKey }),
          );
        expect(returned.latePenalty).toBeNull();
        expect(returned.loan.status).toBe('Returned');
        expect(
          await tx.penaltyInfo.count({
            where: {
              UsageKey: prepared.usageKey,
              Reason: { startsWith: 'ReturnLate' },
            },
          }),
        ).toBe(0);
        expect(
          (
            await tx.accountInfo.findUniqueOrThrow({
              where: { AccountKey: f.users[0].accountKey },
            })
          ).UserCredit,
        ).toBe(before.UserCredit);
      });
    },
  );

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
        it('rejects the unavailable target without moving the reservation or writing pickup state', () => {
          expect(actual).toEqual(expected);
        });
      },
    );
  });
});
