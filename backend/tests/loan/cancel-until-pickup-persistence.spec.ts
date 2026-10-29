import type { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import { inHistoryFixture } from '../fixtures/borrower-history';
import { freezeBusinessDate } from '../fixtures/business-clock';
import { pickupFixture, pickupRequest, PICKUP_START } from '../fixtures/pickup';

/**
 * FR-REQ-10 as revised on 29 Oct 2569: a borrower may call a request off
 * until they collect it, not only until staff prepare it. The unit staff set
 * aside goes back to the pool and the counter is told to put it back.
 * Each case runs in a transaction that is rolled back, so nothing is left
 * prepared or on loan for other suites.
 */
describe('cancelling a request until it is collected', () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    requireIsolatedDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  afterEach(() => jest.useRealTimers());

  /** A T1 unit prepared by staff and photographed by its borrower. */
  async function preparedLoan(tx: Prisma.TransactionClient) {
    freezeBusinessDate(PICKUP_START);
    const f = await pickupFixture(tx);
    const request = await pickupRequest(f);
    const prepared = await f.loan.allocate(f.staff, {
      reservationKey: request.reservationKey,
      condition: 'Normal',
    });
    await tx.images.create({
      data: {
        UsageKey: prepared.usageKey,
        ResourceKey: f.units[0].ResourceKey,
        SubmittedBy: f.users[0].accountKey,
        SubmissionType: 'BeforePicture',
        ImageURL: `/media/inspection/cancel-${prepared.usageKey}.jpg`,
        ActionTime: PICKUP_START,
      },
    });
    return {
      f,
      reservationKey: request.reservationKey,
      usageKey: prepared.usageKey,
    };
  }

  it('offers the cancel button while the unit waits at the counter', () =>
    inHistoryFixture(prisma, async (tx) => {
      const { f, reservationKey } = await preparedLoan(tx);

      const mine = await f.service.getMine(f.users[0], reservationKey);
      expect(mine.cancellable).toBe(true);
    }));

  it('cancels a prepared item and removes its pickup record and photo', () =>
    inHistoryFixture(prisma, async (tx) => {
      const { f, reservationKey, usageKey } = await preparedLoan(tx);

      const result = await f.service.cancel(f.users[0], { reservationKey });

      expect(result.status).toBe('cancelled');
      expect({
        loans: await tx.usageLog.count({
          where: { ReservationKey: reservationKey },
        }),
        photos: await tx.images.count({ where: { UsageKey: usageKey } }),
      }).toEqual({ loans: 0, photos: 0 });
    }));

  it('frees the prepared unit for the same hours', () =>
    inHistoryFixture(prisma, async (tx) => {
      const { f, reservationKey } = await preparedLoan(tx);
      await f.service.cancel(f.users[0], { reservationKey });

      // pickupRequest asserts the second borrower gets this very unit,
      // auto-approved, which only holds once the first booking let go of it.
      const next = await pickupRequest(f, 1, 0);
      expect(next.reservationKey).not.toBe(reservationKey);
    }));

  it('tells the counter staff to put the prepared unit back', () =>
    inHistoryFixture(prisma, async (tx) => {
      const { f, reservationKey } = await preparedLoan(tx);
      await f.service.cancel(f.users[0], { reservationKey });

      const notes = await tx.notification.findMany({
        where: {
          AccountKey: f.staff.accountKey,
          NotificationType: 'StaffTask',
        },
        select: { Body: true, BodyEn: true },
      });
      // The asset number tells staff which box on the counter to shelve.
      expect(notes).toContainEqual({
        Body: expect.stringContaining(`${f.item.ItemName}-0`),
        BodyEn: expect.stringContaining(`${f.item.ItemName}-0`),
      });
    }));

  it('still refuses once the unit has been handed over', () =>
    inHistoryFixture(prisma, async (tx) => {
      const { f, reservationKey, usageKey } = await preparedLoan(tx);
      await f.loan.confirmPickup(f.staff, { usageKey });

      await expect(
        f.service.cancel(f.users[0], { reservationKey }),
      ).rejects.toMatchObject({ businessCode: 'CANNOT_CANCEL' });
      const mine = await f.service.getMine(f.users[0], reservationKey);
      expect(mine.cancellable).toBe(false);
    }));
});
