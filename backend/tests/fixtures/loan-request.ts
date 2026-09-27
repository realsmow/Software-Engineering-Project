import { randomUUID } from 'node:crypto';
import type { Prisma, ResourceInfo } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma.service';
import { LoanRequestService } from '../../src/loan/loan.request.service';
import { CreditTierService } from '../../src/common/credit/credit-tier.service';
import { EligibilityService } from '../../src/common/authority/eligibility.service';
import { NotificationService } from '../../src/notification/notification.service';
import type { TrpcUser } from '../../src/trpc/context';

export function requestService(client: PrismaService) {
  const audit = { record: jest.fn() };
  return {
    service: new LoanRequestService(
      client,
      new CreditTierService(client),
      new EligibilityService(client),
      new NotificationService(client),
      audit as never,
    ),
    audit,
  };
}

export async function requestFixture(
  tx: Prisma.TransactionClient,
  tier: 'T1' | 'T2' = 'T2',
  unitCount = 1,
) {
  const token = `request-${randomUUID()}`;
  const role = await tx.roleInfo.findFirstOrThrow({
    where: { RoleName: 'Student' },
  });
  const band = await tx.creditTier.findFirstOrThrow({
    where: { CreditTierName: 'D0' },
  });
  const group = await tx.managementGroup.create({
    data: { GroupType: 'Faculty' },
  });
  const authorityRole = await tx.authorityRole.create({
    data: { AuthorityName: token, AuthorityLevel: 0 },
  });
  const rule = await tx.borrowRule.create({ data: { RuleName: tier } });
  await tx.borrowConstraints.create({
    data: {
      BorrowRuleKey: rule.BorrowRuleKey,
      CreditTierKey: band.CreditTierKey,
      MaxBorrowDate: 14,
      MaxExtendTime: 3,
    },
  });
  const accounts = await Promise.all(
    [0, 1].map((index) =>
      tx.accountInfo.create({
        data: {
          Email: `${index}.${token}@example.test`,
          UserID: `${index}.${token}`,
          HashedPassword: 'unused-test-hash',
          UserFName: token,
          UserLName: String(index),
          RoleKey: role.RoleKey,
          UserCredit: 100,
          Authorities: {
            create: {
              ManageGroupKey: group.ManageGroupKey,
              AuthorityRoleKey: authorityRole.AuthorityRoleKey,
            },
          },
        },
      }),
    ),
  );
  const item = await tx.itemInfo.create({
    data: { ItemName: token, CreditWeight: 1 },
  });
  const units: ResourceInfo[] = [];
  for (let index = 0; index < unitCount; index++) {
    units.push(
      await tx.resourceInfo.create({
        data: {
          ManagedBy: group.ManageGroupKey,
          BorrowRule: rule.BorrowRuleKey,
          BufferTime: 0,
          ResourceType: 'Item',
          ResourceStatus: 'InStorage',
          AllowBorrow: true,
          Item: {
            create: { ItemKey: item.ItemKey, ItemID: `${token}-${index}` },
          },
          Eligibilities: {
            create: {
              GroupKey: group.ManageGroupKey,
              RoleKey: authorityRole.AuthorityRoleKey,
            },
          },
        },
      }),
    );
  }
  const users: TrpcUser[] = accounts.map((account) => ({
    accountKey: account.AccountKey,
    role: 'borrower',
    facultyKey: null,
    creditScore: 100,
  }));
  const client = new Proxy(tx, {
    get(target, property) {
      if (property === '$transaction')
        return (
          work: (transaction: Prisma.TransactionClient) => Promise<unknown>,
        ) => work(tx);
      return Reflect.get(target, property) as unknown;
    },
  }) as unknown as PrismaService;
  return {
    group,
    authorityRole,
    rule,
    accounts,
    item,
    units,
    users,
    ...requestService(client),
  };
}

// Concurrent tests must commit their setup so two independent transactions can read it.
// Delete only this fixture's keys afterwards; seeded and unrelated rows remain intact.
export async function deleteRequestFixture(
  prisma: PrismaService,
  f: Awaited<ReturnType<typeof requestFixture>>,
) {
  await prisma.$transaction(async (tx) => {
    const resource = { in: f.units.map((unit) => unit.ResourceKey) };
    const account = { in: f.accounts.map((row) => row.AccountKey) };
    await tx.notification.deleteMany({ where: { AccountKey: account } });
    await tx.reservations.deleteMany({ where: { ResourceKey: resource } });
    await tx.eligibility.deleteMany({ where: { ResourceKey: resource } });
    await tx.itemIndiv.deleteMany({ where: { ResourceKey: resource } });
    await tx.resourceInfo.deleteMany({ where: { ResourceKey: resource } });
    await tx.itemInfo.delete({ where: { ItemKey: f.item.ItemKey } });
    await tx.authority.deleteMany({ where: { AccountKey: account } });
    await tx.accountInfo.deleteMany({ where: { AccountKey: account } });
    await tx.borrowConstraints.deleteMany({
      where: { BorrowRuleKey: f.rule.BorrowRuleKey },
    });
    await tx.borrowRule.delete({
      where: { BorrowRuleKey: f.rule.BorrowRuleKey },
    });
    await tx.authorityRole.delete({
      where: { AuthorityRoleKey: f.authorityRole.AuthorityRoleKey },
    });
    await tx.managementGroup.delete({
      where: { ManageGroupKey: f.group.ManageGroupKey },
    });
  });
}
