import type { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import {
  inHistoryFixture,
  transactionClient,
} from '../fixtures/borrower-history';
import { freezeBusinessDate } from '../fixtures/business-clock';
import { requestFixture, requestService } from '../fixtures/loan-request';
import { createRequestOutput } from '../../src/loan/loan.schema';
import {
  pickupFixture,
  PICKUP_END,
  PICKUP_NOW,
  PICKUP_START,
} from '../fixtures/pickup';

/**
 * #236 (instructor item 1, team decision D-01): a cart is one borrow, so it
 * is created whole or not at all. Before, each line committed on its own and
 * a cart could come back half made. Each case is rolled back afterwards.
 */
describe('#236: a cart is created whole or not at all', () => {
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

  const window = {
    startTime: PICKUP_START.toISOString(),
    endTime: PICKUP_END.toISOString(),
  };

  /**
   * Sends one cart. The fixture's own service runs a nested transaction
   * without a savepoint, so a refused cart could not roll back inside the
   * test transaction; this client gives it a savepoint, like a real one.
   */
  async function send(
    tx: Prisma.TransactionClient,
    f: Pick<Awaited<ReturnType<typeof requestFixture>>, 'users'>,
    borrower: number,
    resourceKeys: number[],
  ) {
    const { service } = requestService(transactionClient(tx));
    return createRequestOutput.strict().parse(
      await service.create(f.users[borrower], {
        ...window,
        lines: resourceKeys.map((resourceKey) => ({ resourceKey })),
      }),
    );
  }

  async function counts(
    tx: Prisma.TransactionClient,
    f: Awaited<ReturnType<typeof requestFixture>>,
  ) {
    return {
      reservations: await tx.reservations.count({
        where: { ResourceKey: { in: f.units.map((u) => u.ResourceKey) } },
      }),
      carts: await tx.requestCart.count(),
    };
  }

  it('gives two lines for one type two units, in one cart', () =>
    inHistoryFixture(prisma, async (tx) => {
      const f = await requestFixture(tx, 'T1', 2);
      const unit = f.units[0].ResourceKey;

      const result = await send(tx, f, 0, [unit, unit]);

      expect(result.rejected).toEqual([]);
      expect(result.created).toHaveLength(2);
      expect(
        new Set(result.created.map((r) => r.resource.resourceKey)),
      ).toEqual(new Set(f.units.map((u) => u.ResourceKey)));
      expect(new Set(result.created.map((r) => r.cartKey)).size).toBe(1);
    }));

  it('creates nothing, not even the cart, when a later line finds no unit left', () =>
    inHistoryFixture(prisma, async (tx) => {
      const f = await requestFixture(tx, 'T1', 3);
      // Another borrower holds units 0 and 1 for the same hours.
      await send(tx, f, 1, [f.units[0].ResourceKey]);
      await send(tx, f, 1, [f.units[1].ResourceKey]);
      const before = await counts(tx, f);

      // The first line gets unit 2; the second finds nothing free.
      const result = await send(tx, f, 0, [
        f.units[0].ResourceKey,
        f.units[0].ResourceKey,
      ]);

      expect(result.created).toEqual([]);
      expect(result.rejected).toMatchObject([
        { resourceKey: f.units[0].ResourceKey, code: 'WINDOW_NOT_AVAILABLE' },
      ]);
      expect(await counts(tx, f)).toEqual(before);
    }));

  it('reports every refused line and writes nothing', () =>
    inHistoryFixture(prisma, async (tx) => {
      const f = await requestFixture(tx, 'T1', 2);
      const before = await counts(tx, f);

      const result = await send(tx, f, 0, [
        999_001,
        f.units[0].ResourceKey,
        999_002,
      ]);

      expect(result.created).toEqual([]);
      expect(result.rejected).toMatchObject([
        { resourceKey: 999_001, code: 'RESOURCE_NOT_FOUND' },
        { resourceKey: 999_002, code: 'RESOURCE_NOT_FOUND' },
      ]);
      expect(await counts(tx, f)).toEqual(before);
    }));

  it('sends the counter no "item to prepare" for a cart it did not create', () =>
    inHistoryFixture(prisma, async (tx) => {
      // pickupFixture adds a staff member over the department, so every
      // auto-approved line would tell them to prepare it.
      const f = await pickupFixture(tx);
      await send(tx, f, 1, [f.units[0].ResourceKey]);
      const staffNotices = () =>
        tx.notification.count({ where: { AccountKey: f.staff.accountKey } });
      const before = await staffNotices();

      // The first line gets unit 1; the second finds nothing free.
      const result = await send(tx, f, 0, [
        f.units[0].ResourceKey,
        f.units[0].ResourceKey,
      ]);

      expect(result.created).toEqual([]);
      expect(await staffNotices()).toBe(before);
    }));
});
