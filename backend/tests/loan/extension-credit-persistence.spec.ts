import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import { LoanRequestService } from '../../src/loan/loan.request.service';
import {
  extensionOptionsOutput,
  extensionOutput,
  createRequestInput,
  createRequestOutput,
} from '../../src/loan/loan.schema';
import { CreditTierService } from '../../src/common/credit/credit-tier.service';
import { EligibilityService } from '../../src/common/authority/eligibility.service';
import { NotificationService } from '../../src/notification/notification.service';
import { inHistoryFixture } from '../fixtures/borrower-history';
import { creditLoanFixture } from '../fixtures/loan-extension';

describe('SDS renewal credit gates and persistence', () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    requireIsolatedDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it.each(
    (['T0', 'T1', 'T2'] as const).flatMap((tier) =>
      [0, 1].map((used) => ({ tier, used })),
    ),
  )(
    'queues a D2 $tier extension after $used approved extensions for supervisor without changing the loan deadline',
    async ({ tier, used }) => {
      await inHistoryFixture(prisma, async (tx) => {
        const { due, activeLoan, user, extensions } = await creditLoanFixture(
          tx,
          tier,
          'D2',
          used,
        );
        const options = extensionOptionsOutput
          .strict()
          .parse(await extensions.getOptions(user, activeLoan.UsageKey));
        expect(options).toMatchObject({
          canRequest: true,
          route: 'supervisor',
          requiresInspection: true,
        });
        const result = extensionOutput.strict().parse(
          await extensions.request(user, {
            usageKey: activeLoan.UsageKey,
            requestedDueAt: new Date(due.getTime() + 86_400_000).toISOString(),
          }),
        );
        expect(result).toMatchObject({
          status: 'Pending',
          route: 'supervisor',
          autoApproved: false,
          extendNo: used + 1,
          extensionsUsed: used,
          dueAt: due.toISOString(),
        });
        expect(
          (
            await tx.usageLog.findUniqueOrThrow({
              where: { UsageKey: activeLoan.UsageKey },
            })
          ).PendingExtension,
        ).toBe(result.extensionKey);
        expect(
          (
            await tx.extensionRequest.findUniqueOrThrow({
              where: { ExtensionKey: result.extensionKey },
            })
          ).ApprovedBy,
        ).toBeNull();
      });
    },
  );

  it.each(['T0', 'T1', 'T2'] as const)(
    'refuses a D3 %s extension even with quota available and preserves the existing loan',
    async (tier) => {
      await inHistoryFixture(prisma, async (tx) => {
        const { f, score, due, activeLoan, user, extensions, audit } =
          await creditLoanFixture(tx, tier, 'D3');
        const options = extensionOptionsOutput
          .strict()
          .parse(await extensions.getOptions(user, activeLoan.UsageKey));
        expect(options).toMatchObject({
          canRequest: false,
          blockedBy: 'CREDIT_TOO_LOW',
          currentDueAt: due.toISOString(),
          extensionsUsed: 0,
          extensionsAllowed: 2,
          pendingExtensionKey: null,
        });
        await expect(
          extensions.request(user, {
            usageKey: activeLoan.UsageKey,
            requestedDueAt: new Date(due.getTime() + 86_400_000).toISOString(),
          }),
        ).rejects.toMatchObject({
          businessCode: 'CREDIT_TOO_LOW',
          details: { creditTier: 'D3', creditScore: score },
        });
        expect(
          await tx.extensionRequest.count({
            where: { UsageKey: activeLoan.UsageKey },
          }),
        ).toBe(0);
        expect(
          await tx.usageLog.findUniqueOrThrow({
            where: { UsageKey: activeLoan.UsageKey },
          }),
        ).toMatchObject({
          CurrentStatus: 'Lended',
          DueTime: due,
          PendingExtension: null,
        });
        expect(
          (
            await tx.accountInfo.findUniqueOrThrow({
              where: { AccountKey: f.borrower.AccountKey },
            })
          ).UserCredit,
        ).toBe(score);
        expect(audit.record).not.toHaveBeenCalled();
      });
    },
  );

  it('allows a D3 borrower to submit a new T1 request only after the ordinary eligibility check, for supervisor approval', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const { f, user, activeLoan, due, audit } = await creditLoanFixture(
        tx,
        'T1',
        'D3',
      );
      const item = await tx.itemIndiv.findUniqueOrThrow({
        where: { ResourceKey: f.resource.ResourceKey },
      });
      const available = await tx.resourceInfo.create({
        data: {
          ManagedBy: f.group.ManageGroupKey,
          BorrowRule: f.rule.BorrowRuleKey,
          ResourceType: 'Item',
          ResourceStatus: 'InStorage',
          BufferTime: 0,
          AllowBorrow: true,
          Item: {
            create: {
              ItemKey: item.ItemKey,
              ItemID: `${item.ItemID}-new-request`,
            },
          },
        },
      });
      const requests = new LoanRequestService(
        f.client,
        new CreditTierService(f.client),
        new EligibilityService(f.client),
        new NotificationService(f.client),
        audit as never,
      );
      const input = createRequestInput.parse({
        startTime: new Date(Date.now() + 86_400_000).toISOString(),
        endTime: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        lines: [{ resourceKey: available.ResourceKey }],
      });
      const refused = createRequestOutput
        .strict()
        .parse(await requests.create(user, input));
      expect(refused.created).toEqual([]);
      expect(refused.rejected).toEqual([
        expect.objectContaining({
          resourceKey: available.ResourceKey,
          code: 'NOT_ELIGIBLE',
        }),
      ]);
      await tx.eligibility.create({
        data: {
          ResourceKey: available.ResourceKey,
          GroupKey: f.group.ManageGroupKey,
          RoleKey: f.authorityRole.AuthorityRoleKey,
        },
      });
      const submitted = createRequestOutput
        .strict()
        .parse(await requests.create(user, input));
      expect(submitted.rejected).toEqual([]);
      expect(submitted.created).toHaveLength(1);
      expect(submitted.created[0]).toMatchObject({
        status: 'pending',
        usageKey: null,
        resource: { resourceKey: available.ResourceKey },
        approval: {
          route: 'supervisor',
          status: 'Pending',
          autoApproved: false,
        },
      });
      expect(
        await tx.usageLog.findUniqueOrThrow({
          where: { UsageKey: activeLoan.UsageKey },
        }),
      ).toMatchObject({
        DueTime: due,
        PendingExtension: null,
        CurrentStatus: 'Lended',
      });
    });
  });
});
