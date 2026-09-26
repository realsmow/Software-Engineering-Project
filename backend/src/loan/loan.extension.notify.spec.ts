import { LoanExtensionService } from './loan.extension.service';
import type { PrismaService } from '../prisma.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { CreditTierService } from '../common/credit/credit-tier.service';
import type { EligibilityService } from '../common/authority/eligibility.service';
import type { NotificationService } from '../notification/notification.service';
import type { TrpcUser } from '../trpc/context';

/**
 * FR-NTF-04: an extension that lands on a supervisor's desk (T2, or a shaky
 * credit band) must tell every supervisor with authority over the resource's
 * department — the extension counterpart of loan.request.notify.spec.ts.
 */

const BORROWER: TrpcUser = {
  accountKey: 10,
  role: 'borrower',
  facultyKey: null,
  creditScore: 80,
};

const BORROWER_ROW = {
  AccountKey: BORROWER.accountKey,
  UserID: 'b10',
  UserFName: 'F',
  UserLName: 'L',
  UserCredit: 80,
};

function usageFor(resource: any) {
  return {
    UsageKey: 501,
    ReservationKey: null,
    AccountKey: BORROWER.accountKey,
    CurrentStatus: 'Lended',
    DueTime: new Date('2099-01-10T00:00:00Z'),
    PendingExtension: null,
    Account: BORROWER_ROW,
    Resource: resource,
  };
}

function build(resource: any, supervisors: { AccountKey: number }[] = []) {
  const tx = {
    extensionRequest: {
      create: jest.fn().mockResolvedValue({ ExtensionKey: 900 }),
    },
    usageLog: { update: jest.fn().mockResolvedValue({}) },
    reservations: { findFirst: jest.fn().mockResolvedValue(null) },
    accountInfo: { findMany: jest.fn().mockResolvedValue(supervisors) },
  };

  const usage = usageFor(resource);
  const prisma = {
    usageLog: { findUnique: jest.fn().mockResolvedValue(usage) },
    extensionRequest: {
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue({
        ExtensionKey: 900,
        UsageKey: usage.UsageKey,
        RequestedBy: BORROWER.accountKey,
        ExtendNo: 1,
        PreviousDueTime: usage.DueTime,
        RequestedDueTime: new Date('2099-01-15T00:00:00Z'),
        ApproveStatus: 'Pending',
        ApprovedBy: null,
        RequestedAt: new Date(),
        ResolvedAt: null,
        Reason: null,
        RequestedByUser: BORROWER_ROW,
        Usage: usage,
      }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    creditTier: { findMany: jest.fn().mockResolvedValue([]) },
    borrowConstraints: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((work: (t: unknown) => unknown) =>
      Promise.resolve(work(tx)),
    ),
  } as unknown as PrismaService;

  const scope = {} as unknown as StaffScopeService;
  const creditTiers = {
    resolveTier: jest
      .fn()
      .mockResolvedValue({ creditTier: 'D0', creditTierKey: 1 }),
    tierMapper: jest.fn().mockResolvedValue(() => 'D0'),
  } as unknown as CreditTierService;
  const eligibility = {
    assertMayBorrow: jest
      .fn()
      .mockResolvedValue({ maxExtendTimes: 2, maxBorrowDays: 7 }),
  } as unknown as EligibilityService;
  const notifications = {
    extensionNeedsSupervisor: jest.fn(),
    extensionApproved: jest.fn(),
  } as unknown as NotificationService;

  const service = new LoanExtensionService(
    prisma,
    scope,
    creditTiers,
    eligibility,
    notifications,
    { record: jest.fn() } as never,
  );

  return { service, tx, notifications };
}

const T2_RESOURCE = {
  ResourceKey: 26,
  ManagedBy: 3,
  BufferTime: 0,
  BorrowRule: 3,
  BorrowRuleInfo: { RuleName: 'T2' },
  Item: { ItemID: 'EE-OSC-001', Item: { ItemName: 'Scope' } },
  Room: null,
};

const T0_RESOURCE = {
  ...T2_RESOURCE,
  BorrowRuleInfo: { RuleName: 'T0' },
};

describe('FR-NTF-04: an extension routed to a supervisor', () => {
  it('notifies every supervisor with authority over the department', async () => {
    const { service, tx, notifications } = build(T2_RESOURCE, [
      { AccountKey: 21 },
      { AccountKey: 22 },
    ]);

    await service.request(BORROWER, {
      usageKey: 501,
      requestedDueAt: '2099-01-15T00:00:00.000Z',
    });

    expect(tx.accountInfo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          Role: { RoleName: 'Supervisor' },
          Authorities: { some: { ManageGroupKey: 3 } },
        }),
      }),
    );
    expect(notifications.extensionNeedsSupervisor).toHaveBeenCalledTimes(2);
    expect(notifications.extensionNeedsSupervisor).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ accountKey: 21, extensionKey: 900 }),
    );
  });

  it('does not notify the requester about their own extension', async () => {
    const { service, notifications } = build(T2_RESOURCE, [
      { AccountKey: BORROWER.accountKey },
    ]);

    await service.request(BORROWER, {
      usageKey: 501,
      requestedDueAt: '2099-01-15T00:00:00.000Z',
    });

    expect(notifications.extensionNeedsSupervisor).not.toHaveBeenCalled();
  });
});

describe('FR-NTF-04: an extension granted online', () => {
  it('notifies nobody at the supervisor desk', async () => {
    const { service, notifications } = build(T0_RESOURCE, [{ AccountKey: 21 }]);

    await service.request(BORROWER, {
      usageKey: 501,
      requestedDueAt: '2099-01-15T00:00:00.000Z',
    });

    expect(notifications.extensionNeedsSupervisor).not.toHaveBeenCalled();
    expect(notifications.extensionApproved).toHaveBeenCalled();
  });
});
