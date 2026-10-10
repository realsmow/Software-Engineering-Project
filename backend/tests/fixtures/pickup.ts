import type { Prisma } from '../../src/generated/prisma/client';
import { LoanService } from '../../src/loan/loan.service';
import { StaffScopeService } from '../../src/common/authority/staff-scope.service';
import { PenaltyService } from '../../src/common/penalty/penalty.service';
import { NotificationService } from '../../src/notification/notification.service';
import {
  createRequestInput,
  createRequestOutput,
} from '../../src/loan/loan.schema';
import type { TrpcUser } from '../../src/trpc/context';
import { requestFixture } from './loan-request';
import { transactionClient } from './borrower-history';
import { CreditTierService } from '../../src/common/credit/credit-tier.service';

export const PICKUP_NOW = new Date('2031-09-26T00:00:00.000Z');
export const PICKUP_START = new Date('2031-09-26T02:00:00.000Z');
// Monday 17:00 Bangkok: a weekend due date would roll to Monday anyway (#178).
export const PICKUP_END = new Date('2031-09-29T10:00:00.000Z');

export async function pickupFixture(tx: Prisma.TransactionClient) {
  const f = await requestFixture(tx, 'T1', 2);
  const role = await tx.roleInfo.findFirstOrThrow({
    where: { RoleName: 'Staff' },
  });
  const authority = await tx.authorityRole.create({
    data: { AuthorityName: `${f.item.ItemName}-counter`, AuthorityLevel: 1 },
  });
  const account = await tx.accountInfo.create({
    data: {
      Email: `counter.${f.item.ItemName}@example.test`,
      UserID: `counter.${f.item.ItemName}`,
      HashedPassword: 'unused-test-hash',
      UserFName: 'Counter',
      UserLName: 'Staff',
      RoleKey: role.RoleKey,
      UserCredit: 100,
      Authorities: {
        create: {
          ManageGroupKey: f.group.ManageGroupKey,
          AuthorityRoleKey: authority.AuthorityRoleKey,
        },
      },
    },
  });
  const staff: TrpcUser = {
    accountKey: account.AccountKey,
    role: 'staff',
    facultyKey: null,
    creditScore: 100,
  };
  const client = transactionClient(tx);
  const notifications = new NotificationService(client);
  const loan = new LoanService(
    client,
    new StaffScopeService(client),
    new PenaltyService(client),
    notifications,
    f.audit as never,
    new CreditTierService(client),
  );
  return { ...f, client, staff, loan, notifications };
}

export async function pickupRequest(
  f: Awaited<ReturnType<typeof pickupFixture>>,
  borrower = 0,
  unit = 0,
  startTime = PICKUP_START,
  endTime = PICKUP_END,
) {
  const output = createRequestOutput.strict().parse(
    await f.service.create(
      f.users[borrower],
      createRequestInput.parse({
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        lines: [
          { resourceKey: f.units[unit].ResourceKey, reason: 'Counter project' },
        ],
      }),
    ),
  );
  expect(output.rejected).toEqual([]);
  expect(output.created).toHaveLength(1);
  expect(output.created[0]).toMatchObject({
    status: 'approved',
    resource: { resourceKey: f.units[unit].ResourceKey },
    approval: { autoApproved: true },
  });
  return output.created[0];
}
