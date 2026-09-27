import type { Prisma } from '../../src/generated/prisma/client';
import { LoanExtensionService } from '../../src/loan/loan.extension.service';
import { StaffScopeService } from '../../src/common/authority/staff-scope.service';
import { CreditTierService } from '../../src/common/credit/credit-tier.service';
import { EligibilityService } from '../../src/common/authority/eligibility.service';
import { NotificationService } from '../../src/notification/notification.service';
import { historyFixture } from './borrower-history';

export async function creditLoanFixture(
  tx: Prisma.TransactionClient,
  tier: 'T0' | 'T1' | 'T2' | 'unconfigured',
  creditTier: 'D0' | 'D1' | 'D2' | 'D3',
  used = 0,
  allowed = 2,
) {
  const f = await historyFixture(tx);
  const band = await tx.creditTier.findFirstOrThrow({
    where: { CreditTierName: creditTier },
  });
  const score = band.CreditMin;
  await tx.accountInfo.update({
    where: { AccountKey: f.borrower.AccountKey },
    data: { UserCredit: score },
  });
  await tx.penaltyInfo.create({
    data: {
      AccountKey: f.borrower.AccountKey,
      CreditDeducted: 100 - score - 12,
      Reason: 'ReturnLate',
      InEffect: true,
      ActionTime: f.inspectedAt,
      ExpirationTime: f.penalty.ExpirationTime,
    },
  });
  await tx.borrowRule.update({
    where: { BorrowRuleKey: f.rule.BorrowRuleKey },
    data: { RuleName: tier },
  });
  await tx.authority.create({
    data: {
      AccountKey: f.borrower.AccountKey,
      ManageGroupKey: f.group.ManageGroupKey,
      AuthorityRoleKey: f.authorityRole.AuthorityRoleKey,
    },
  });
  await tx.eligibility.create({
    data: {
      ResourceKey: f.resource.ResourceKey,
      GroupKey: f.group.ManageGroupKey,
      RoleKey: f.authorityRole.AuthorityRoleKey,
    },
  });
  await tx.borrowConstraints.create({
    data: {
      BorrowRuleKey: f.rule.BorrowRuleKey,
      CreditTierKey: band.CreditTierKey,
      MaxBorrowDate: creditTier === 'D3' ? 5 : 7,
      MaxExtendTime: allowed,
    },
  });
  const due = new Date(Date.now() + 86_400_000);
  const automaticallyApproved =
    tier === 'T0' ||
    (tier === 'T1' && (creditTier === 'D0' || creditTier === 'D1'));
  const reservation = await tx.reservations.create({
    data: {
      ResourceKey: f.resource.ResourceKey,
      ReservedBy: f.borrower.AccountKey,
      StartTime: new Date(Date.now() - 5 * 86_400_000),
      EndTime: due,
      ApproveStatus: 'Approved',
      AutoApproved: automaticallyApproved,
      ApprovedBy: automaticallyApproved ? null : f.decider.accountKey,
      ApprovedAt: new Date(Date.now() - 5 * 86_400_000),
      ReservationExpiration: due,
      ActionTime: new Date(Date.now() - 5 * 86_400_000),
    },
  });
  await tx.resourceInfo.update({
    where: { ResourceKey: f.resource.ResourceKey },
    data: { ResourceStatus: 'Lended' },
  });
  const activeLoan = await tx.usageLog.create({
    data: {
      AccountKey: f.borrower.AccountKey,
      ResourceKey: f.resource.ResourceKey,
      CurrentStatus: 'Lended',
      ReservationKey: reservation.ReservationKey,
      CheckoutCondition: f.checkoutCondition.ConditionKey,
      CheckoutTime: reservation.StartTime,
      DueTime: due,
    },
  });
  const user = {
    ...f.decider,
    accountKey: f.borrower.AccountKey,
    role: 'borrower' as const,
    creditScore: score,
  };
  for (let index = 0; index < used; index += 1) {
    await tx.extensionRequest.create({
      data: {
        UsageKey: activeLoan.UsageKey,
        RequestedBy: user.accountKey,
        ExtendNo: index + 1,
        PreviousDueTime: new Date(due.getTime() - (used - index) * 86_400_000),
        RequestedDueTime: new Date(
          due.getTime() - (used - index - 1) * 86_400_000,
        ),
        ApproveStatus: 'Approved',
        ApprovedBy:
          tier === 'T2' || creditTier === 'D2'
            ? f.decider.accountKey
            : tier === 'T1' && (index + 1) % 2 === 0
              ? f.inspector.AccountKey
              : null,
        RequestedAt: new Date(due.getTime() - (used - index + 1) * 86_400_000),
        ResolvedAt: new Date(due.getTime() - (used - index + 1) * 86_400_000),
      },
    });
  }
  const audit = { record: jest.fn() };
  const extensions = new LoanExtensionService(
    f.client,
    new StaffScopeService(f.client),
    new CreditTierService(f.client),
    new EligibilityService(f.client),
    new NotificationService(f.client),
    audit as never,
  );
  return { f, score, due, activeLoan, reservation, user, extensions, audit };
}
