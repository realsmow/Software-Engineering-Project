import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import { freezeBusinessDate } from '../fixtures/business-clock';
import { pickupFixture, pickupRequest, PICKUP_NOW } from '../fixtures/pickup';
import { LoanService } from '../../src/loan/loan.service';
import { StaffScopeService } from '../../src/common/authority/staff-scope.service';
import { PenaltyService } from '../../src/common/penalty/penalty.service';
import { NotificationService } from '../../src/notification/notification.service';
import { CreditTierService } from '../../src/common/credit/credit-tier.service';
import { LoanRequestService } from '../../src/loan/loan.request.service';
import { EligibilityService } from '../../src/common/authority/eligibility.service';

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

    // Either order is fine; what must never happen is both succeeding.
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    const row = await prisma.reservations.findUniqueOrThrow({
      where: { ReservationKey: request.reservationKey },
      select: {
        ApproveStatus: true,
        UsageLogs: { select: { UsageKey: true } },
      },
    });
    if (row.ApproveStatus === 'Canceled') expect(row.UsageLogs).toEqual([]);
    else expect(row.UsageLogs).toHaveLength(1);
  }, 20_000);
});
