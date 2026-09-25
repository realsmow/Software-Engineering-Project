import { ApprovalService } from './approval.service';
import type { PrismaService } from '../prisma.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { CreditTierService } from '../common/credit/credit-tier.service';
import type { LoanRequestService } from '../loan/loan.request.service';
import type { NotificationService } from '../notification/notification.service';
import type { AuditService } from '../common/audit/audit.service';
import type { ItemManagementService } from '../item/item.management.service';
import type { TrpcUser } from '../trpc/context';

/**
 * FR-EQP-08, the supervisor's half: this desk is a supervisor's call, not
 * staff's, unlike the shared borrowing queue that splits by tier and credit
 * band. `assertSupervisor` is the actual gate - StaffMiddleware on the router
 * is only a floor - and approving is the one write that actually retires a
 * resource, so it re-checks activity right before doing it.
 */

const supervisor: TrpcUser = {
  accountKey: 9,
  role: 'supervisor',
  facultyKey: null,
  creditScore: 100,
};
const staffUser: TrpcUser = {
  accountKey: 4,
  role: 'staff',
  facultyKey: null,
  creditScore: 100,
};

function pendingRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ResourceKey: 10,
    RequestedBy: staffUser.accountKey,
    ApproveStatus: 'Pending',
    Resource: { Item: { Item: { ItemName: 'Multimeter' } }, Room: null },
    ...overrides,
  };
}

function harness() {
  const prisma = {
    retirementRequest: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(pendingRequest()),
      update: jest.fn().mockResolvedValue({}),
    },
    resourceInfo: { update: jest.fn().mockResolvedValue({}) },
    // Both branches now run through an interactive `$transaction(async tx =>
    // ...)`; `prisma` itself doubles as `tx` here since its methods are the
    // same jest.fn()s the tests assert against either way.
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[]),
    ),
  } as unknown as PrismaService;

  const scope = {
    resourceScope: jest.fn().mockResolvedValue({}),
    assertResourceInScope: jest.fn(),
  } as unknown as StaffScopeService;

  const itemManagement = {
    assertNotActive: jest.fn(),
    readRetirementRequest: jest
      .fn()
      .mockResolvedValue({ requestKey: 1, status: 'Approved' }),
  } as unknown as ItemManagementService;

  const notifications = {
    retirementDecided: jest.fn(),
  } as unknown as NotificationService;

  const service = new ApprovalService(
    prisma,
    scope,
    {} as CreditTierService,
    {} as LoanRequestService,
    notifications,
    { record: jest.fn() } as unknown as AuditService,
    itemManagement,
  );

  return { service, prisma, scope, itemManagement, notifications };
}

describe('retirementQueue', () => {
  it("refuses staff - this desk is a supervisor's", async () => {
    const t = harness();
    await expect(
      t.service.retirementQueue(staffUser, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ businessCode: 'APPROVAL_NEEDS_SUPERVISOR' });
  });

  it("scopes to the supervisor's own departments", async () => {
    const t = harness();
    await t.service.retirementQueue(supervisor, { page: 1, pageSize: 20 });
    expect(t.scope.resourceScope).toHaveBeenCalledWith(supervisor);
  });
});

describe('decideRetirement', () => {
  it('refuses staff', async () => {
    const t = harness();
    await expect(
      t.service.decideRetirement(staffUser, {
        requestKey: 1,
        decision: 'approve',
      }),
    ).rejects.toMatchObject({ businessCode: 'APPROVAL_NEEDS_SUPERVISOR' });
  });

  it('refuses the requester deciding their own request', async () => {
    const t = harness();
    (t.prisma.retirementRequest.findUnique as jest.Mock).mockResolvedValueOnce(
      pendingRequest({ RequestedBy: supervisor.accountKey }),
    );

    await expect(
      t.service.decideRetirement(supervisor, {
        requestKey: 1,
        decision: 'approve',
      }),
    ).rejects.toMatchObject({ businessCode: 'CANNOT_DECIDE_OWN_RETIREMENT' });
  });

  it('refuses a request that is not pending any more', async () => {
    const t = harness();
    (t.prisma.retirementRequest.findUnique as jest.Mock).mockResolvedValueOnce(
      pendingRequest({ ApproveStatus: 'Rejected' }),
    );

    await expect(
      t.service.decideRetirement(supervisor, {
        requestKey: 1,
        decision: 'approve',
      }),
    ).rejects.toMatchObject({ businessCode: 'RETIREMENT_ALREADY_DECIDED' });
  });

  it('re-checks activity and retires the resource on approval', async () => {
    const t = harness();

    await t.service.decideRetirement(supervisor, {
      requestKey: 1,
      decision: 'approve',
    });

    expect(t.itemManagement.assertNotActive).toHaveBeenCalledWith(10);
    expect(t.prisma.resourceInfo.update).toHaveBeenCalledWith({
      where: { ResourceKey: 10 },
      data: { ResourceStatus: 'Retired', AllowBorrow: false },
    });
    expect(t.prisma.retirementRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ApproveStatus: 'Approved',
          DecidedBy: supervisor.accountKey,
        }),
      }),
    );
    expect(t.notifications.retirementDecided).toHaveBeenCalledWith(
      t.prisma,
      expect.objectContaining({
        accountKey: staffUser.accountKey,
        requestKey: 1,
        resourceName: 'Multimeter',
        decision: 'approve',
      }),
    );
  });

  it('rejects without retiring the resource', async () => {
    const t = harness();

    await t.service.decideRetirement(supervisor, {
      requestKey: 1,
      decision: 'reject',
      note: 'Still in active use',
    });

    expect(t.prisma.resourceInfo.update).not.toHaveBeenCalled();
    expect(t.itemManagement.assertNotActive).not.toHaveBeenCalled();
    expect(t.prisma.retirementRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ApproveStatus: 'Rejected',
          DecisionNote: 'Still in active use',
        }),
      }),
    );
    expect(t.notifications.retirementDecided).toHaveBeenCalledWith(
      t.prisma,
      expect.objectContaining({
        accountKey: staffUser.accountKey,
        requestKey: 1,
        resourceName: 'Multimeter',
        decision: 'reject',
        note: 'Still in active use',
      }),
    );
  });

  it('reports RETIREMENT_REQUEST_NOT_FOUND for an unknown key', async () => {
    const t = harness();
    (t.prisma.retirementRequest.findUnique as jest.Mock).mockResolvedValueOnce(
      null,
    );

    await expect(
      t.service.decideRetirement(supervisor, {
        requestKey: 404,
        decision: 'approve',
      }),
    ).rejects.toMatchObject({ businessCode: 'RETIREMENT_REQUEST_NOT_FOUND' });
  });
});
