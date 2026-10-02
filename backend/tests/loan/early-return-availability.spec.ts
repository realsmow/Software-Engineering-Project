import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import { inHistoryFixture } from '../fixtures/borrower-history';
import { creditLoanFixture } from '../fixtures/loan-extension';
import { resourcesFreeInWindow } from '../../src/common/booking/booking-window';

// TC-26: a unit returned early must be bookable for the rest of its old window.
describe('early return frees the unit once inspected', () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    requireIsolatedDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('holds the window while out, still while ungraded, and frees it after inspection', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await creditLoanFixture(tx, 'T1', 'D0', 0);
      const unit = await tx.resourceInfo.findUniqueOrThrow({
        where: { ResourceKey: f.activeLoan.ResourceKey },
        select: { ResourceKey: true, BufferTime: true },
      });
      // A window inside the original reservation, before its end date.
      const start = new Date(f.reservation.StartTime.getTime() + 60_000);
      const end = new Date(f.reservation.EndTime.getTime() - 60_000);
      const free = async () =>
        (await resourcesFreeInWindow(tx, [unit], start, end)).has(
          unit.ResourceKey,
        );

      expect(await free()).toBe(false);

      await tx.usageLog.update({
        where: { UsageKey: f.activeLoan.UsageKey },
        data: { CurrentStatus: 'Returned', CheckInTime: new Date() },
      });
      // Back but not graded: inspection may still send it to repair.
      expect(await free()).toBe(false);

      await tx.usageLog.update({
        where: { UsageKey: f.activeLoan.UsageKey },
        data: { CurrentStatus: 'Inspected' },
      });
      // The reservation still reads Approved, but its loan is over.
      expect(
        (
          await tx.reservations.findUniqueOrThrow({
            where: { ReservationKey: f.reservation.ReservationKey },
          })
        ).ApproveStatus,
      ).toBe('Approved');
      expect(await free()).toBe(true);
    });
  });
});
