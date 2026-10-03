import { PrismaService } from '../prisma.service';
import { CreditTierService } from '../common/credit/credit-tier.service';
import { recomputeCredit } from '../common/credit/recompute-credit';
import { creditOutput } from './credit.schema';
import {
  historyFixture,
  inHistoryFixture,
  requireIsolatedDatabase,
  transactionClient,
} from '../../tests/fixtures/borrower-history';
import { freezeBusinessDate } from '../../tests/fixtures/business-clock';
import { CreditService } from './credit.service';

describe('CreditService — Module 3.3 / 3.4', () => {
  const prisma = { accountInfo: { findUnique: jest.fn() } } as any;
  const creditTiers = { resolveBorrowLimits: jest.fn() } as any;
  let service: CreditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CreditService(prisma as never, creditTiers as never);
  });

  it('3.3 calculates total credit deducted from active penalties, treating null as zero', async () => {
    prisma.accountInfo.findUnique.mockResolvedValue({
      AccountKey: 10,
      UserCredit: 72,
      Penalties: [
        {
          PenaltyKey: 1,
          Reason: 'Late',
          CreditDeducted: 5,
          ActionTime: new Date(),
          ExpirationTime: new Date(Date.now() + 86400000),
          Appealed: false,
        },
        {
          PenaltyKey: 2,
          Reason: 'Ban',
          CreditDeducted: null,
          ActionTime: new Date(),
          ExpirationTime: new Date(Date.now() + 86400000),
          Appealed: false,
        },
        {
          PenaltyKey: 3,
          Reason: 'Damage',
          CreditDeducted: 3,
          ActionTime: new Date(),
          ExpirationTime: new Date(Date.now() + 86400000),
          Appealed: false,
        },
      ],
    });
    creditTiers.resolveBorrowLimits.mockResolvedValue({
      creditTier: 'D2',
      maxBorrowDays: 7,
      maxExtendTimes: 1,
    });

    const result = await service.getCredit(10);

    expect(result.score).toBe(72);
    expect(result.totalDeducted).toBe(8);
    expect(result.activePenalties).toHaveLength(3);
  });

  it('3.4 returns score, tier, borrow limits, penalties and total deduction for credit.me data', async () => {
    prisma.accountInfo.findUnique.mockResolvedValue({
      AccountKey: 10,
      UserCredit: 95,
      Penalties: [],
    });
    creditTiers.resolveBorrowLimits.mockResolvedValue({
      creditTier: 'D0',
      maxBorrowDays: 14,
      maxExtendTimes: 3,
    });

    await expect(service.getCredit(10)).resolves.toMatchObject({
      accountId: 10,
      score: 95,
      tier: 'D0',
      maxBorrowDays: 14,
      maxExtendTimes: 3,
      activePenalties: [],
      totalDeducted: 0,
    });
  });
});

// Real service/adapter assertions share this module's suite; setup is scoped.
describe('Persisted business records', () => {
  const NOW = new Date('2031-09-26T03:00:00.000Z');

  const DAY = 86_400_000;

  describe('FR-CRD-06/07: credit and penalties actually in force', () => {
    let prisma: PrismaService;
    beforeAll(async () => {
      requireIsolatedDatabase();
      prisma = new PrismaService();
      await prisma.$connect();
    });
    afterAll(async () => prisma?.$disconnect());
    beforeEach(() => freezeBusinessDate(NOW));
    afterEach(() => jest.useRealTimers());

    it.each([
      ['expired exactly now', true, 0],
      ['expired one millisecond ago', true, -1],
      ['revoked but not expired', false, DAY],
    ] as const)(
      'excludes a penalty %s from both credit and the visible penalty list',
      async (_name, inEffect, offset) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await historyFixture(tx);
          await tx.penaltyInfo.update({
            where: { PenaltyKey: f.penalty.PenaltyKey },
            data: {
              InEffect: inEffect,
              ExpirationTime: new Date(NOW.getTime() + offset),
            },
          });
          expect(await recomputeCredit(tx, f.borrower.AccountKey)).toBe(100);
          const client = transactionClient(tx);
          const result = creditOutput
            .strict()
            .parse(
              await new CreditService(
                client,
                new CreditTierService(client),
              ).getCredit(f.borrower.AccountKey),
            );
          expect(result).toMatchObject({
            score: 100,
            tier: 'D0',
            totalDeducted: 0,
            activePenalties: [],
          });
          expect(
            (
              await tx.accountInfo.findUniqueOrThrow({
                where: { AccountKey: f.borrower.AccountKey },
              })
            ).UserCredit,
          ).toBe(100);
        });
      },
    );

    it('counts a penalty expiring one millisecond later as active', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await historyFixture(tx);
        await tx.penaltyInfo.update({
          where: { PenaltyKey: f.penalty.PenaltyKey },
          data: { ExpirationTime: new Date(NOW.getTime() + 1) },
        });
        expect(await recomputeCredit(tx, f.borrower.AccountKey)).toBe(88);
        const client = transactionClient(tx);
        const result = await new CreditService(
          client,
          new CreditTierService(client),
        ).getCredit(f.borrower.AccountKey);
        expect(result.totalDeducted).toBe(12);
        expect(result.activePenalties.map((p) => p.id)).toEqual([
          f.penalty.PenaltyKey,
        ]);
      });
    });

    it('includes a ban without points, sorts expiry dates, and excludes another account', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await historyFixture(tx);
        const ban = await tx.penaltyInfo.create({
          data: {
            AccountKey: f.borrower.AccountKey,
            Reason: null,
            CreditDeducted: null,
            ActionTime: null,
            ExpirationTime: new Date(NOW.getTime() + 40 * DAY),
            InEffect: true,
            Appealed: null,
          },
        });
        await tx.penaltyInfo.create({
          data: {
            AccountKey: f.inspector.AccountKey,
            Reason: 'Other user',
            CreditDeducted: 99,
            ExpirationTime: new Date(NOW.getTime() + DAY),
            InEffect: true,
          },
        });
        expect(await recomputeCredit(tx, f.borrower.AccountKey)).toBe(88);
        const client = transactionClient(tx);
        const result = creditOutput
          .strict()
          .parse(
            await new CreditService(
              client,
              new CreditTierService(client),
            ).getCredit(f.borrower.AccountKey),
          );
        expect(result.totalDeducted).toBe(12);
        expect(result.activePenalties.map((p) => p.id)).toEqual([
          ban.PenaltyKey,
          f.penalty.PenaltyKey,
        ]);
        expect(result.activePenalties[0]).toMatchObject({
          creditDeducted: null,
          issuedAt: null,
          reason: null,
          appealed: false,
        });
      });
    });

    it('updates score and band at 80 points without counting an expired deduction', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await historyFixture(tx);
        for (const [amount, expiry] of [
          [8, DAY],
          [40, -1],
        ])
          await tx.penaltyInfo.create({
            data: {
              AccountKey: f.borrower.AccountKey,
              CreditDeducted: amount,
              ExpirationTime: new Date(NOW.getTime() + expiry),
              InEffect: true,
            },
          });
        expect(await recomputeCredit(tx, f.borrower.AccountKey)).toBe(80);
        const client = transactionClient(tx);
        const result = await new CreditService(
          client,
          new CreditTierService(client),
        ).getCredit(f.borrower.AccountKey);
        expect(result).toMatchObject({
          score: 80,
          tier: 'D0',
          totalDeducted: 20,
        });
        expect(result.activePenalties).toHaveLength(2);
      });
    });

    it('keeps credit at zero when active deductions exceed the base score', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await historyFixture(tx);
        await tx.penaltyInfo.create({
          data: {
            AccountKey: f.borrower.AccountKey,
            CreditDeducted: 100,
            ExpirationTime: new Date(NOW.getTime() + DAY),
            InEffect: true,
          },
        });
        expect(await recomputeCredit(tx, f.borrower.AccountKey)).toBe(0);
        const client = transactionClient(tx);
        expect(
          await new CreditService(
            client,
            new CreditTierService(client),
          ).getCredit(f.borrower.AccountKey),
        ).toMatchObject({ score: 0, tier: 'D3', totalDeducted: 112 });
      });
    });

    it('reports USER_NOT_FOUND for an absent account without fabricating credit', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const client = transactionClient(tx);
        await expect(
          new CreditService(client, new CreditTierService(client)).getCredit(
            2_147_483_600,
          ),
        ).rejects.toMatchObject({ businessCode: 'USER_NOT_FOUND' });
      });
    });

    it.each(['item', 'room', 'no loan'] as const)(
      'reads the %s name linked to an actual penalty without changing credit',
      async (kind) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await historyFixture(tx);
          let expectedName: string | null = null;
          if (kind === 'item') {
            await tx.itemInfo.updateMany({
              where: {
                Items: { some: { ResourceKey: f.resource.ResourceKey } },
              },
              data: { ItemName: 'QA equipment name' },
            });
            expectedName = 'QA equipment name';
          } else if (kind === 'room') {
            await tx.itemIndiv.deleteMany({
              where: { ResourceKey: f.resource.ResourceKey },
            });
            await tx.resourceInfo.update({
              where: { ResourceKey: f.resource.ResourceKey },
              data: { ResourceType: 'Room' },
            });
            await tx.roomInfo.create({
              data: {
                ResourceKey: f.resource.ResourceKey,
                RoomName: 'QA laboratory',
                CreditWeight: 4,
              },
            });
            expectedName = 'QA laboratory';
          } else {
            await tx.penaltyInfo.update({
              where: { PenaltyKey: f.penalty.PenaltyKey },
              data: { UsageKey: null },
            });
          }
          const client = transactionClient(tx);
          const result = creditOutput
            .strict()
            .parse(
              await new CreditService(
                client,
                new CreditTierService(client),
              ).getCredit(f.borrower.AccountKey),
            );
          expect(result.activePenalties).toHaveLength(1);
          expect(result.activePenalties[0]).toMatchObject({
            id: f.penalty.PenaltyKey,
            itemName: expectedName,
            creditDeducted: 12,
          });
          expect(result).toMatchObject({ score: 88, totalDeducted: 12 });
        });
      },
    );
  });
});
