import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma.service';
import type { Prisma } from '../../src/generated/prisma/client';
import { ApprovalService } from '../../src/approval/approval.service';
import { AppealService } from '../../src/appeal/appeal.service';
import { StaffScopeService } from '../../src/common/authority/staff-scope.service';
import { PenaltyService } from '../../src/common/penalty/penalty.service';
import { NotificationService } from '../../src/notification/notification.service';
import type { TrpcUser } from '../../src/trpc/context';

export { requireIsolatedDatabase } from './isolated-database';

/**
 * Reuse the enclosing fixture transaction for actual service SQL. This is the
 * savepoint adapter originally used by pickupFixture, shared by read fixtures
 * too because Prisma services use both callback and array transactions.
 */
export function transactionClient(tx: Prisma.TransactionClient): PrismaService {
  let transactionNo = 0;
  return new Proxy(tx, {
    get(target, property) {
      if (property === '$transaction')
        return async (
          work:
            | ((transaction: Prisma.TransactionClient) => Promise<unknown>)
            | Promise<unknown>[],
        ) => {
          const savepoint = `fixture_${++transactionNo}`;
          await tx.$executeRawUnsafe(`SAVEPOINT "${savepoint}"`);
          try {
            let result: unknown;
            if (Array.isArray(work)) {
              const rows: unknown[] = [];
              for (const query of work) rows.push(await query);
              result = rows;
            } else result = await work(tx);
            await tx.$executeRawUnsafe(`RELEASE SAVEPOINT "${savepoint}"`);
            return result;
          } catch (error) {
            await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT "${savepoint}"`);
            await tx.$executeRawUnsafe(`RELEASE SAVEPOINT "${savepoint}"`);
            throw error;
          }
        };
      return Reflect.get(target, property) as unknown;
    },
  }) as unknown as PrismaService;
}

// Every fixture is rolled back, including when a setup assertion fails.
export async function inHistoryFixture<T>(
  prisma: PrismaService,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const rollback = new Error('ROLLBACK_HISTORY_FIXTURE');
  let result: T;
  try {
    await prisma.$transaction(
      async (tx) => {
        result = await work(tx);
        throw rollback;
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return result!;
}

export async function historyFixture(tx: Prisma.TransactionClient) {
  const token = `history-${randomUUID()}`;
  const role = await tx.roleInfo.create({ data: { RoleName: token } });
  const accounts = await Promise.all(
    ['borrower', 'staff', 'supervisor'].map((name) =>
      tx.accountInfo.create({
        data: {
          Email: `${name}.${token}@example.test`,
          UserID: `${name}.${token}`,
          HashedPassword: 'unused-test-hash',
          UserFName: name,
          UserLName: 'History',
          RoleKey: role.RoleKey,
          UserCredit: 88,
        },
      }),
    ),
  );
  const [borrower, inspector, decider] = accounts;
  const user = (accountKey: number, userRole: TrpcUser['role']): TrpcUser => ({
    accountKey,
    role: userRole,
    facultyKey: null,
    creditScore: 88,
  });
  const group = await tx.managementGroup.create({
    data: { GroupType: 'Faculty' },
  });
  const authorityRole = await tx.authorityRole.create({
    data: { AuthorityName: token, AuthorityLevel: 1 },
  });
  await tx.authority.create({
    data: {
      AccountKey: decider.AccountKey,
      ManageGroupKey: group.ManageGroupKey,
      AuthorityRoleKey: authorityRole.AuthorityRoleKey,
    },
  });
  const rule = await tx.borrowRule.create({ data: { RuleName: 'T2' } });
  const resource = await tx.resourceInfo.create({
    data: {
      ManagedBy: group.ManageGroupKey,
      BorrowRule: rule.BorrowRuleKey,
      BufferTime: 0,
      ResourceStatus: 'InStorage',
      ResourceType: 'Item',
      AllowBorrow: true,
      Item: {
        create: {
          ItemID: token,
          Item: { create: { ItemName: token, CreditWeight: 4 } },
        },
      },
    },
  });
  const inspectedAt = new Date(Date.now() - 60_000);
  const checkoutCondition = await tx.conditionLog.create({
    data: {
      ResourceKey: resource.ResourceKey,
      LoggedBy: inspector.AccountKey,
      Condition: 'Normal',
      LoggedAt: new Date(inspectedAt.getTime() - 86_400_000),
    },
  });
  const condition = await tx.conditionLog.create({
    data: {
      ResourceKey: resource.ResourceKey,
      LoggedBy: inspector.AccountKey,
      Condition: 'MajorDamage',
      LoggedAt: inspectedAt,
    },
  });
  const usage = await tx.usageLog.create({
    data: {
      ResourceKey: resource.ResourceKey,
      AccountKey: borrower.AccountKey,
      CurrentStatus: 'Inspected',
      CheckoutCondition: checkoutCondition.ConditionKey,
      CheckInCondition: condition.ConditionKey,
      CheckoutTime: new Date(inspectedAt.getTime() - 86_400_000),
      DueTime: inspectedAt,
      CheckInTime: inspectedAt,
    },
  });
  const penalty = await tx.penaltyInfo.create({
    data: {
      AccountKey: borrower.AccountKey,
      UsageKey: usage.UsageKey,
      Reason: 'DamagedItem',
      CreditDeducted: 12,
      ActionTime: inspectedAt,
      ExpirationTime: new Date(Date.now() + 30 * 86_400_000),
      InEffect: true,
      Appealed: true,
    },
  });
  const appeal = await tx.appealInfo.create({
    data: {
      OriginalPenalty: penalty.PenaltyKey,
      FiledBy: borrower.AccountKey,
      AppealReason: 'Review the damage grade',
      ApproveStatus: 'Pending',
      ActionTime: inspectedAt,
    },
  });
  await tx.inspection.create({
    data: {
      UsageKey: usage.UsageKey,
      ResourceKey: resource.ResourceKey,
      InspectorKey: inspector.AccountKey,
      ConditionKey: condition.ConditionKey,
      AppealKey: appeal.AppealKey,
      PenaltyKey: penalty.PenaltyKey,
      ActionTime: inspectedAt,
    },
  });
  // Services start their own transactions; reuse this rollback transaction for writes.
  const client = new Proxy(tx, {
    get(target, property) {
      if (property === '$transaction') {
        return (
          work: (transaction: Prisma.TransactionClient) => Promise<unknown>,
        ) => work(tx);
      }
      return Reflect.get(target, property) as unknown;
    },
  }) as unknown as PrismaService;
  const scope = new StaffScopeService(client);
  const notifications = new NotificationService(client);
  const audit = { record: jest.fn() };
  const history = new ApprovalService(
    client,
    scope,
    {} as never,
    {} as never,
    notifications,
    audit as never,
    {} as never,
  );
  const appeals = new AppealService(
    client,
    scope,
    notifications,
    audit as never,
    new PenaltyService(client),
  );
  return {
    client,
    group,
    authorityRole,
    rule,
    borrower,
    inspector,
    decider: user(decider.AccountKey, 'supervisor'),
    admin: user(inspector.AccountKey, 'admin'),
    resource,
    condition,
    checkoutCondition,
    usage,
    appeal,
    penalty,
    inspectedAt,
    history,
    appeals,
  };
}
