import { ItemManagementService } from './item.management.service';
import type { PrismaService } from '../prisma.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { ImageService } from '../image/image.service';
import type { TrpcUser } from '../trpc/context';

/**
 * FR-EQP-08, the staff-facing half: requesting and withdrawing a retirement.
 * The supervisor's half (approve/reject) is
 * approval/approval.retirement.spec.ts - this file only covers what staff can
 * do on their own: file a request, and refuse to file one that would strand
 * an active loan, and cancel their own still-pending request.
 */

const staff: TrpcUser = {
  accountKey: 4,
  role: 'staff',
  facultyKey: null,
  creditScore: 100,
};

function retirementRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    RequestKey: 1,
    ResourceKey: 10,
    Reason: 'Hinge is broken',
    ApproveStatus: 'Pending',
    RequestedAt: new Date('2026-01-01T00:00:00Z'),
    DecidedAt: null,
    DecisionNote: null,
    RequestedByUser: {
      AccountKey: staff.accountKey,
      UserID: 'staff1',
      UserFName: 'Sam',
      UserLName: 'One',
    },
    DecidedByUser: null,
    Resource: {
      ResourceType: 'Item',
      ManagedBy: 1,
      Item: { ItemID: 'MM-001', Item: { ItemName: 'Multimeter' } },
      Room: null,
    },
    ...overrides,
  };
}

function harness() {
  // requestRetirement's create + notify runs inside `$transaction(async tx =>
  // ...)`; `tx` shares the create/findUniqueOrThrow mocks below so a test can
  // still assert on `prisma.retirementRequest.create`.
  const tx = {
    retirementRequest: {
      create: jest.fn().mockResolvedValue({ RequestKey: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(retirementRow()),
    },
    accountInfo: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = {
    resourceInfo: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ ResourceStatus: 'InStorage', ManagedBy: 1 }),
    },
    retirementRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(retirementRow()),
      create: tx.retirementRequest.create,
      update: jest.fn().mockResolvedValue({}),
    },
    usageLog: { findFirst: jest.fn().mockResolvedValue(null) },
    reservations: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (work: (client: typeof tx) => unknown) =>
      work(tx),
    ),
  } as unknown as PrismaService;
  const scope = {
    assertResourceInScope: jest.fn(),
  } as unknown as StaffScopeService;
  const images = {
    toStoredUrl: (url?: string) => url ?? null,
    toPublicUrl: (url: string | null) => url,
  } as unknown as ImageService;
  const audit = { record: jest.fn() };
  const notifications = {
    retirementRequested: jest.fn(),
    retirementDecided: jest.fn(),
  };
  return {
    service: new ItemManagementService(
      prisma,
      scope,
      images,
      audit as never,
      notifications as never,
    ),
    prisma,
    tx,
    scope,
    audit,
    notifications,
  };
}

describe('requestRetirement', () => {
  it('files a pending request and returns it', async () => {
    const t = harness();

    const result = await t.service.requestRetirement(staff, {
      resourceKey: 10,
      reason: 'Hinge is broken',
    });

    expect(t.prisma.retirementRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ResourceKey: 10,
          RequestedBy: staff.accountKey,
          Reason: 'Hinge is broken',
          ApproveStatus: 'Pending',
        }),
      }),
    );
    expect(result.status).toBe('Pending');
    expect(t.audit.record).toHaveBeenCalledWith(
      { accountKey: staff.accountKey },
      'create',
      'retirement/1',
      expect.any(String),
    );
  });

  it("notifies every supervisor with authority over the resource's department", async () => {
    const t = harness();
    t.tx.accountInfo.findMany.mockResolvedValueOnce([
      { AccountKey: 21 },
      { AccountKey: 22 },
    ]);

    await t.service.requestRetirement(staff, {
      resourceKey: 10,
      reason: 'Hinge is broken',
    });

    expect(t.tx.accountInfo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          Role: { RoleName: 'Supervisor' },
          Authorities: { some: { ManageGroupKey: 1 } },
        }),
      }),
    );
    expect(t.notifications.retirementRequested).toHaveBeenCalledTimes(2);
    expect(t.notifications.retirementRequested).toHaveBeenCalledWith(
      t.tx,
      expect.objectContaining({ accountKey: 21, requestKey: 1 }),
    );
    expect(t.notifications.retirementRequested).toHaveBeenCalledWith(
      t.tx,
      expect.objectContaining({ accountKey: 22, requestKey: 1 }),
    );
  });

  it('sends nobody a notification when the department has no supervisor yet', async () => {
    const t = harness();

    await t.service.requestRetirement(staff, {
      resourceKey: 10,
      reason: 'Hinge is broken',
    });

    expect(t.notifications.retirementRequested).not.toHaveBeenCalled();
  });

  it('refuses a resource that is already retired', async () => {
    const t = harness();
    (t.prisma.resourceInfo.findUnique as jest.Mock).mockResolvedValueOnce({
      ResourceStatus: 'Retired',
    });

    await expect(
      t.service.requestRetirement(staff, { resourceKey: 10, reason: 'x' }),
    ).rejects.toMatchObject({ businessCode: 'RESOURCE_ALREADY_RETIRED' });
  });

  it('refuses a second pending request for the same resource', async () => {
    const t = harness();
    (t.prisma.retirementRequest.findFirst as jest.Mock).mockResolvedValueOnce({
      RequestKey: 99,
    });

    await expect(
      t.service.requestRetirement(staff, { resourceKey: 10, reason: 'x' }),
    ).rejects.toMatchObject({
      businessCode: 'RETIREMENT_ALREADY_PENDING',
      details: { resourceKey: 10, requestKey: 99 },
    });
  });

  it('refuses while the unit is out on loan', async () => {
    const t = harness();
    (t.prisma.usageLog.findFirst as jest.Mock).mockResolvedValueOnce({
      UsageKey: 5,
      CurrentStatus: 'Lended',
    });

    await expect(
      t.service.requestRetirement(staff, { resourceKey: 10, reason: 'x' }),
    ).rejects.toMatchObject({ businessCode: 'RETIREMENT_BLOCKED_BY_ACTIVITY' });
  });

  it('refuses while an approved reservation is still upcoming', async () => {
    const t = harness();
    (t.prisma.reservations.findFirst as jest.Mock).mockResolvedValueOnce({
      ReservationKey: 3,
      StartTime: new Date(),
      EndTime: new Date(Date.now() + 60_000),
    });

    await expect(
      t.service.requestRetirement(staff, { resourceKey: 10, reason: 'x' }),
    ).rejects.toMatchObject({ businessCode: 'RETIREMENT_BLOCKED_BY_ACTIVITY' });
  });
});

describe('cancelRetirement', () => {
  it('lets the requester withdraw their own pending request', async () => {
    const t = harness();
    (t.prisma.retirementRequest.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        ResourceKey: 10,
        RequestedBy: staff.accountKey,
        ApproveStatus: 'Pending',
      })
      .mockResolvedValueOnce(retirementRow({ ApproveStatus: 'Canceled' }));

    const result = await t.service.cancelRetirement(staff, { requestKey: 1 });

    expect(t.prisma.retirementRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { RequestKey: 1 },
        data: expect.objectContaining({ ApproveStatus: 'Canceled' }),
      }),
    );
    expect(result.status).toBe('Canceled');
  });

  it("refuses to cancel someone else's request", async () => {
    const t = harness();
    (t.prisma.retirementRequest.findUnique as jest.Mock).mockResolvedValueOnce({
      ResourceKey: 10,
      RequestedBy: 999,
      ApproveStatus: 'Pending',
    });

    await expect(
      t.service.cancelRetirement(staff, { requestKey: 1 }),
    ).rejects.toMatchObject({ businessCode: 'NOT_YOUR_RETIREMENT_REQUEST' });
    expect(t.prisma.retirementRequest.update).not.toHaveBeenCalled();
  });

  it('refuses a request that has already been decided', async () => {
    const t = harness();
    (t.prisma.retirementRequest.findUnique as jest.Mock).mockResolvedValueOnce({
      ResourceKey: 10,
      RequestedBy: staff.accountKey,
      ApproveStatus: 'Approved',
    });

    await expect(
      t.service.cancelRetirement(staff, { requestKey: 1 }),
    ).rejects.toMatchObject({ businessCode: 'RETIREMENT_ALREADY_DECIDED' });
  });

  it('reports RETIREMENT_REQUEST_NOT_FOUND for an unknown key', async () => {
    const t = harness();
    (t.prisma.retirementRequest.findUnique as jest.Mock).mockResolvedValueOnce(
      null,
    );

    await expect(
      t.service.cancelRetirement(staff, { requestKey: 404 }),
    ).rejects.toMatchObject({ businessCode: 'RETIREMENT_REQUEST_NOT_FOUND' });
  });
});
