import type { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import {
  inHistoryFixture,
  transactionClient,
} from '../fixtures/borrower-history';
import { freezeBusinessDate } from '../fixtures/business-clock';
import { requestService } from '../fixtures/loan-request';
import { createRequestOutput } from '../../src/loan/loan.schema';
import { pickupFixture, PICKUP_END, PICKUP_START } from '../fixtures/pickup';

/**
 * #236 step 2 (instructor item 1, team decision D-01): every whole-cart
 * button is one transaction, done for every line or not at all. Before, the
 * page called the per-item procedure line by line, and a failure halfway left
 * the first lines done and the rest not. Each case is rolled back afterwards.
 */
describe('#236 step 2: whole-cart actions are all or nothing', () => {
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

  /** One borrower's cart of two units of one type, both auto-approved (T1). */
  async function twoLineCart(tx: Prisma.TransactionClient) {
    freezeBusinessDate(PICKUP_START);
    const f = await pickupFixture(tx);
    // A client with savepoints, so a refused cart rolls back inside the test.
    const { service: requests, audit: requestAudit } = requestService(
      transactionClient(tx),
    );
    const unit = f.units[0].ResourceKey;
    const made = createRequestOutput.strict().parse(
      await requests.create(f.users[0], {
        startTime: PICKUP_START.toISOString(),
        endTime: PICKUP_END.toISOString(),
        lines: [{ resourceKey: unit }, { resourceKey: unit }],
      }),
    );
    expect(made.rejected).toEqual([]);
    const reservationKeys = made.created
      .map((r) => r.reservationKey)
      .sort((a, b) => a - b);
    const photo = async (
      usageKey: number,
      stage: 'BeforePicture' | 'AfterPicture',
    ) => {
      const usage = await tx.usageLog.findUniqueOrThrow({
        where: { UsageKey: usageKey },
        select: { ResourceKey: true },
      });
      await tx.images.create({
        data: {
          UsageKey: usageKey,
          ResourceKey: usage.ResourceKey,
          SubmittedBy:
            stage === 'BeforePicture'
              ? f.users[0].accountKey
              : f.staff.accountKey,
          SubmissionType: stage,
          ImageURL: `/media/inspection/cart-${usageKey}-${stage}.jpg`,
          ActionTime: PICKUP_START,
        },
      });
    };
    const prepareEach = async () => {
      const usageKeys: number[] = [];
      for (const reservationKey of reservationKeys) {
        const loan = await f.loan.allocate(f.staff, {
          reservationKey,
          condition: 'Normal',
        });
        usageKeys.push(loan.usageKey);
      }
      return usageKeys;
    };
    const statusOf = async (usageKey: number) =>
      (
        await tx.usageLog.findUniqueOrThrow({
          where: { UsageKey: usageKey },
          select: { CurrentStatus: true },
        })
      ).CurrentStatus;
    return {
      f,
      requests,
      requestAudit,
      reservationKeys,
      photo,
      prepareEach,
      statusOf,
    };
  }

  describe('staff prepare the whole cart', () => {
    it('prepares every line in one go', () =>
      inHistoryFixture(prisma, async (tx) => {
        const { f, reservationKeys } = await twoLineCart(tx);
        const loans = await f.loan.allocateCart(f.staff, {
          lines: reservationKeys.map((reservationKey) => ({
            reservationKey,
            condition: 'Normal' as const,
          })),
        });
        expect(loans.map((l) => [l.reservationKey, l.status])).toEqual(
          reservationKeys.map((k) => [k, 'Prepared']),
        );
      }));

    it('prepares nothing when one line cannot be prepared', () =>
      inHistoryFixture(prisma, async (tx) => {
        const { f, requests, reservationKeys } = await twoLineCart(tx);
        await requests.cancel(f.users[0], {
          reservationKey: reservationKeys[1],
        });
        const audited = f.audit.record.mock.calls.length;

        await expect(
          f.loan.allocateCart(f.staff, {
            lines: reservationKeys.map((reservationKey) => ({
              reservationKey,
              condition: 'Normal' as const,
            })),
          }),
        ).rejects.toMatchObject({ businessCode: expect.any(String) });
        expect(
          await tx.usageLog.count({
            where: { ReservationKey: reservationKeys[0] },
          }),
        ).toBe(0);
        // No audit line for a step that was rolled back.
        expect(f.audit.record.mock.calls.length).toBe(audited);
      }));
  });

  describe('staff hand the whole cart over', () => {
    it('hands every line over once the borrower photographed each', () =>
      inHistoryFixture(prisma, async (tx) => {
        const { f, photo, prepareEach, statusOf } = await twoLineCart(tx);
        const usageKeys = await prepareEach();
        for (const usageKey of usageKeys)
          await photo(usageKey, 'BeforePicture');

        await f.loan.confirmPickupCart(f.staff, { usageKeys });
        expect(await statusOf(usageKeys[0])).toBe('Lended');
        expect(await statusOf(usageKeys[1])).toBe('Lended');
      }));

    it('hands nothing over when one unit has no borrower photo', () =>
      inHistoryFixture(prisma, async (tx) => {
        const { f, photo, prepareEach, statusOf } = await twoLineCart(tx);
        const usageKeys = await prepareEach();
        await photo(usageKeys[0], 'BeforePicture');

        await expect(
          f.loan.confirmPickupCart(f.staff, { usageKeys }),
        ).rejects.toMatchObject({ businessCode: 'PICKUP_PHOTO_REQUIRED' });
        expect(await statusOf(usageKeys[0])).toBe('Prepared');
      }));
  });

  describe('staff take the whole cart back', () => {
    async function onLoan(tx: Prisma.TransactionClient) {
      const cart = await twoLineCart(tx);
      const usageKeys = await cart.prepareEach();
      for (const usageKey of usageKeys) {
        await cart.photo(usageKey, 'BeforePicture');
        await cart.f.loan.confirmPickup(cart.f.staff, { usageKey });
      }
      return { ...cart, usageKeys };
    }

    it('records every return when each has a return photo', () =>
      inHistoryFixture(prisma, async (tx) => {
        const { f, photo, statusOf, usageKeys } = await onLoan(tx);
        for (const usageKey of usageKeys) await photo(usageKey, 'AfterPicture');

        const results = await f.loan.recordReturnCart(f.staff, { usageKeys });
        expect(results).toHaveLength(2);
        expect(await statusOf(usageKeys[0])).toBe('Returned');
        expect(await statusOf(usageKeys[1])).toBe('Returned');
      }));

    it('records no return when one unit has no return photo', () =>
      inHistoryFixture(prisma, async (tx) => {
        const { f, photo, statusOf, usageKeys } = await onLoan(tx);
        await photo(usageKeys[0], 'AfterPicture');

        await expect(
          f.loan.recordReturnCart(f.staff, { usageKeys }),
        ).rejects.toMatchObject({ businessCode: 'RETURN_PHOTO_REQUIRED' });
        expect(await statusOf(usageKeys[0])).toBe('Lended');
      }));
  });

  describe('the borrower confirms the whole pickup', () => {
    it('confirms every line once each has the borrower photo', () =>
      inHistoryFixture(prisma, async (tx) => {
        const { f, requests, photo, prepareEach, statusOf } =
          await twoLineCart(tx);
        const usageKeys = await prepareEach();
        for (const usageKey of usageKeys)
          await photo(usageKey, 'BeforePicture');

        await requests.confirmMyPickupCart(f.users[0], { usageKeys });
        expect(await statusOf(usageKeys[0])).toBe('Lended');
        expect(await statusOf(usageKeys[1])).toBe('Lended');
      }));

    it('confirms nothing when one unit has no photo yet', () =>
      inHistoryFixture(prisma, async (tx) => {
        const { f, requests, requestAudit, photo, prepareEach, statusOf } =
          await twoLineCart(tx);
        const usageKeys = await prepareEach();
        await photo(usageKeys[0], 'BeforePicture');
        const audited = requestAudit.record.mock.calls.length;

        await expect(
          requests.confirmMyPickupCart(f.users[0], { usageKeys }),
        ).rejects.toMatchObject({ businessCode: expect.any(String) });
        expect(await statusOf(usageKeys[0])).toBe('Prepared');
        expect(requestAudit.record.mock.calls.length).toBe(audited);
      }));
  });

  describe('the borrower cancels the whole cart', () => {
    const statusOfRequest = (tx: Prisma.TransactionClient, key: number) =>
      tx.reservations
        .findUniqueOrThrow({
          where: { ReservationKey: key },
          select: { ApproveStatus: true },
        })
        .then((r) => r.ApproveStatus);

    it('cancels every line together', () =>
      inHistoryFixture(prisma, async (tx) => {
        const { f, requests, reservationKeys } = await twoLineCart(tx);
        await requests.cancelCart(f.users[0], { reservationKeys });
        expect(await statusOfRequest(tx, reservationKeys[0])).toBe('Canceled');
        expect(await statusOfRequest(tx, reservationKeys[1])).toBe('Canceled');
      }));

    it('cancels nothing when one line can no longer be cancelled', () =>
      inHistoryFixture(prisma, async (tx) => {
        const { f, requests, reservationKeys, photo, statusOf } =
          await twoLineCart(tx);
        // The second unit is already in the borrower's hands.
        const loan = await f.loan.allocate(f.staff, {
          reservationKey: reservationKeys[1],
          condition: 'Normal',
        });
        await photo(loan.usageKey, 'BeforePicture');
        await f.loan.confirmPickup(f.staff, { usageKey: loan.usageKey });

        await expect(
          requests.cancelCart(f.users[0], { reservationKeys }),
        ).rejects.toMatchObject({ businessCode: 'CANNOT_CANCEL' });
        expect(await statusOfRequest(tx, reservationKeys[0])).toBe('Approved');
        expect(await statusOf(loan.usageKey)).toBe('Lended');
      }));
  });
});
