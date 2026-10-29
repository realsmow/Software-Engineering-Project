import type { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import { inHistoryFixture } from '../fixtures/borrower-history';
import { freezeBusinessDate } from '../fixtures/business-clock';
import { pickupFixture, pickupRequest, PICKUP_START } from '../fixtures/pickup';

/**
 * #237 (team decision D-05, FR-PKP-02/03): the photo of the unit leaving the
 * counter is the borrower's own record, taken on their pickup page. A photo
 * staff attach at the counter no longer lets them hand over without it.
 * Each case runs in a transaction that is rolled back, so no loan is left on
 * loan for other suites' overdue counts.
 */
describe('#237: the handover photo is the borrower’s', () => {
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

  async function preparedLoan(tx: Prisma.TransactionClient) {
    freezeBusinessDate(PICKUP_START);
    const f = await pickupFixture(tx);
    const request = await pickupRequest(f);
    const prepared = await f.loan.allocate(f.staff, {
      reservationKey: request.reservationKey,
      condition: 'Normal',
    });
    const photo = (submittedBy: number) =>
      tx.images.create({
        data: {
          UsageKey: prepared.usageKey,
          ResourceKey: f.units[0].ResourceKey,
          SubmittedBy: submittedBy,
          SubmissionType: 'BeforePicture',
          ImageURL: `/media/inspection/handover-${submittedBy}.jpg`,
          ActionTime: PICKUP_START,
        },
      });
    return { f, usageKey: prepared.usageKey, photo };
  }

  it('refuses a counter handover when only staff photographed the unit', () =>
    inHistoryFixture(prisma, async (tx) => {
      const { f, usageKey, photo } = await preparedLoan(tx);
      await photo(f.staff.accountKey);

      await expect(
        f.loan.confirmPickup(f.staff, { usageKey }),
      ).rejects.toMatchObject({ businessCode: 'PICKUP_PHOTO_REQUIRED' });
    }));

  it('hands over once the borrower has photographed the unit', () =>
    inHistoryFixture(prisma, async (tx) => {
      const { f, usageKey, photo } = await preparedLoan(tx);
      await photo(f.users[0].accountKey);

      const loan = await f.loan.confirmPickup(f.staff, { usageKey });
      expect(loan.status).toBe('Lended');
    }));
});
