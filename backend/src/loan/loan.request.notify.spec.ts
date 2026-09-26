import { LoanRequestService } from './loan.request.service';

/**
 * FR-NTF-04: a T2 request, or a T1 request from a D2/D3 borrower, must tell
 * every supervisor with authority over the resource's department — not just
 * leave it for whoever next opens the approval queue.
 *
 * Separate from loan.request.service.spec.ts so the routing assertions
 * already there (6.5-6.7) do not have to grow a second concern.
 */

const user = { accountKey: 10, creditScore: 80 } as any;

const t2Resource = {
  ResourceKey: 7,
  ManagedBy: 3,
  BorrowRule: 2,
  AllowBorrow: true,
  ResourceStatus: 'InStorage',
  BufferTime: 0,
  BorrowRuleInfo: { RuleName: 'T2' },
  Item: {
    ItemID: 'OSC-01',
    Item: { ItemName: 'Oscilloscope', CreditWeight: 1 },
  },
  Room: null,
};

const t0Resource = {
  ...t2Resource,
  BorrowRuleInfo: { RuleName: 'T0' },
  Item: { ItemID: 'CAL-01', Item: { ItemName: 'Caliper', CreditWeight: 1 } },
};

function dbFor(resource: any, supervisors: { AccountKey: number }[] = []) {
  const row: any = {
    ReservationKey: 101,
    ReservedBy: user.accountKey,
    Reason: null,
    StartTime: new Date('2099-01-10T08:00:00Z'),
    EndTime: new Date('2099-01-10T13:00:00Z'),
    ApproveStatus: 'Approved',
    ApprovedBy: null,
    AutoApproved: true,
    ApprovedAt: new Date('2099-01-01T00:00:00Z'),
    ReservationExpiration: new Date('2099-01-02T00:00:00Z'),
    ActionTime: new Date('2099-01-01T00:00:00Z'),
    ResolvedAt: null,
    Resource: resource,
    ReservedByUser: { UserCredit: 80 },
    ApprovedByUser: null,
    UsageLogs: [],
  };
  const tx = {
    reservations: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }: any) => {
        row.ApproveStatus = data.ApproveStatus;
        row.AutoApproved = data.AutoApproved;
        row.ApprovedAt = data.ApprovedAt;
        return Promise.resolve({ ReservationKey: 101 });
      }),
    },
    accountInfo: { findMany: jest.fn().mockResolvedValue(supervisors) },
  };
  return {
    resourceInfo: {
      findUnique: jest.fn().mockResolvedValue(resource),
      findMany: jest.fn().mockResolvedValue([]),
    },
    penaltyInfo: { findFirst: jest.fn().mockResolvedValue(null) },
    reservations: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(row)),
    },
    usageLog: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (arg: any) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(tx),
    ),
    __tx: tx,
  };
}

function service(db: any, creditTier = 'D0') {
  const notifications = { requestNeedsSupervisor: jest.fn() };
  const svc = new LoanRequestService(
    db as never,
    {
      resolveTier: jest
        .fn()
        .mockResolvedValue({ creditTierKey: 1, creditTier }),
      tierMapper: jest.fn().mockResolvedValue(() => creditTier),
    } as never,
    {
      assertMayBorrow: jest.fn().mockResolvedValue({ maxBorrowDays: 7 }),
    } as never,
    notifications as never,
    { record: jest.fn() } as never,
  );
  return { svc, notifications };
}

const future = {
  startTime: '2099-01-10T08:00:00.000Z',
  endTime: '2099-01-10T13:00:00.000Z',
  lines: [{ resourceKey: 7 }],
};

describe('FR-NTF-04: a request routed to a supervisor', () => {
  it('notifies every supervisor with authority over the department', async () => {
    const db = dbFor(t2Resource, [{ AccountKey: 21 }, { AccountKey: 22 }]);
    const { svc, notifications } = service(db);

    await svc.create(user as never, future);

    expect(db.__tx.accountInfo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          Role: { RoleName: 'Supervisor' },
          Authorities: { some: { ManageGroupKey: 3 } },
        }),
      }),
    );
    expect(notifications.requestNeedsSupervisor).toHaveBeenCalledTimes(2);
    expect(notifications.requestNeedsSupervisor).toHaveBeenCalledWith(
      db.__tx,
      expect.objectContaining({ accountKey: 21, reservationKey: 101 }),
    );
    expect(notifications.requestNeedsSupervisor).toHaveBeenCalledWith(
      db.__tx,
      expect.objectContaining({ accountKey: 22, reservationKey: 101 }),
    );
  });

  it('does not notify the requester about their own request', async () => {
    // A supervisor who borrows a T2 unit routes to themselves as the only
    // supervisor over the department.
    const db = dbFor(t2Resource, [{ AccountKey: user.accountKey }]);
    const { svc, notifications } = service(db);

    await svc.create(user as never, future);

    expect(notifications.requestNeedsSupervisor).not.toHaveBeenCalled();
  });
});

describe('FR-NTF-04: a request that clears automatically', () => {
  it('notifies nobody', async () => {
    const db = dbFor(t0Resource, [{ AccountKey: 21 }]);
    const { svc, notifications } = service(db);

    await svc.create(user as never, future);

    expect(notifications.requestNeedsSupervisor).not.toHaveBeenCalled();
  });
});
