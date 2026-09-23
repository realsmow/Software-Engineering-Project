import { LoanRequestService } from './loan.request.service';
import { BusinessError } from '../common/errors/business-error';

const user = { accountKey: 10, creditScore: 80 } as any;
const baseResource = {
  ResourceKey: 7, BorrowRule: 2, AllowBorrow: true, ResourceStatus: 'InStorage',
  BufferTime: 0, BorrowRuleInfo: { RuleName: 'T0' },
  Item: { ItemID: 'CAL-01', Item: { ItemName: 'Caliper', CreditWeight: 1 } }, Room: null,
};

function dbFor(resource = baseResource) {
  const row: any = {
    ReservationKey: 101, ReservedBy: 10, Reason: null,
    StartTime: new Date('2099-01-10T08:00:00Z'), EndTime: new Date('2099-01-10T13:00:00Z'),
    ApproveStatus: 'Approved', ApprovedBy: null, AutoApproved: true,
    ApprovedAt: new Date('2099-01-01T00:00:00Z'), ReservationExpiration: new Date('2099-01-02T00:00:00Z'),
    ActionTime: new Date('2099-01-01T00:00:00Z'), ResolvedAt: null,
    Resource: resource, ReservedByUser: { UserCredit: 80 }, ApprovedByUser: null, UsageLogs: [],
  };
  const tx = {
    reservations: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }: any) => {
        row.ApproveStatus = data.ApproveStatus; row.AutoApproved = data.AutoApproved;
        row.ApprovedAt = data.ApprovedAt; row.Resource = resource;
        return Promise.resolve({ ReservationKey: 101 });
      }),
    },
  };
  return {
    resourceInfo: { findUnique: jest.fn().mockResolvedValue(resource) },
    penaltyInfo: { findFirst: jest.fn().mockResolvedValue(null) },
    authority: { findMany: jest.fn().mockResolvedValue([]) },
    borrowConstraints: { findUnique: jest.fn().mockResolvedValue({ MaxBorrowDate: 7, MaxExtendTime: 2, MinimumAuthorityLevel: null }) },
    creditTier: { findFirst: jest.fn().mockResolvedValue({ CreditTierKey: 1, CreditTierName: 'D0' }) },
    reservations: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockImplementation(() => Promise.resolve(row)), create: jest.fn() },
    usageLog: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (arg: any) => Array.isArray(arg) ? Promise.all(arg) : arg(tx)),
  };
}

function service(db: any, eligibility: any = { assertMayBorrow: jest.fn().mockResolvedValue({ maxBorrowDays: 7 }) }, creditTier = 'D0') {
  return new LoanRequestService(
    db,
    { resolveTier: jest.fn().mockResolvedValue({ creditTierKey: 1, creditTier }), tierMapper: jest.fn().mockResolvedValue(() => creditTier) } as any,
    eligibility as any,
  );
}

const future = { startTime: '2099-01-10T08:00:00.000Z', endTime: '2099-01-10T13:00:00.000Z', lines: [{ resourceKey: 7 }] };

describe('Module 6 request validation', () => {
  it('6.3 accepts an eligible borrower when stock and credit checks pass', async () => {
    const db = dbFor(); const result = await service(db).create(user, future as any);
    expect(result.created).toHaveLength(1); expect(result.rejected).toHaveLength(0);
  });

  it('6.3 rejects an unavailable resource before creating a reservation', async () => {
    const db = dbFor({ ...baseResource, AllowBorrow: false });
    const result = await service(db).create(user, future as any);
    expect(result.created).toHaveLength(0); expect(result.rejected[0].code).toBe('ITEM_UNAVAILABLE');
    expect(db.reservations.create).not.toHaveBeenCalled();
  });

  it('6.4 auto-approves a T0 request', async () => {
    const db = dbFor(); const result = await service(db).create(user, future as any);
    expect(result.created[0].approval.route).toBe('auto');
    expect(result.created[0].approval.status).toBe('Approved'); expect(result.created[0].approval.autoApproved).toBe(true);
  });
  it('6.5 routes T1 D2 to supervisor instead of auto-approving', async () => {
    const resource = { ...baseResource, BorrowRuleInfo: { RuleName: 'T1' } };
    const db = dbFor(resource); const result = await service(db, undefined, 'D2').create(user, future as any);
    expect(result.created[0].approval.route).toBe('supervisor');
    expect(result.created[0].approval.status).toBe('Pending'); expect(result.created[0].approval.autoApproved).toBe(false);
  });

  it('6.6 routes every T2 request to supervisor', async () => {
    const resource = { ...baseResource, BorrowRuleInfo: { RuleName: 'T2' } };
    const db = dbFor(resource); const result = await service(db).create(user, future as any);
    expect(result.created[0].approval.route).toBe('supervisor');
    expect(result.created[0].approval.status).toBe('Pending');
  });

  it('6.7 preserves the selected T2 serial/resource on the request', async () => {
    const resource = {
      ...baseResource, ResourceKey: 42, BorrowRuleInfo: { RuleName: 'T2' },
      Item: { ...baseResource.Item, ItemID: 'T2-SERIAL-42' },
    };
    const db = dbFor(resource);
    const result = await service(db).create(user, { ...future, lines: [{ resourceKey: 42 }] } as any);
    expect(result.created[0].resource.resourceKey).toBe(42);
    expect(result.created[0].resource.serialNo).toBe('T2-SERIAL-42');
  });

  it('lets the borrower complete pickup after attaching a before photo', async () => {
    const db: any = dbFor();
    const row = await db.reservations.findUnique();
    row.UsageLogs = [{
      UsageKey: 501,
      CurrentStatus: 'Prepared',
      DueTime: new Date('2099-01-10T13:00:00.000Z'),
    }];
    db.usageLog.findUnique = jest.fn().mockResolvedValue({
      UsageKey: 501,
      AccountKey: user.accountKey,
      ResourceKey: 7,
      ReservationKey: 101,
      CurrentStatus: 'Prepared',
    });
    db.images = { findFirst: jest.fn().mockResolvedValue({ ImageKey: 91 }) };
    const updateMany = jest.fn().mockImplementation(() => {
      row.UsageLogs[0].CurrentStatus = 'Lended';
      return Promise.resolve({ count: 1 });
    });
    const updateResource = jest.fn().mockResolvedValue({});
    db.$transaction.mockImplementation(async (arg: any) =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : arg({
            usageLog: { updateMany },
            resourceInfo: { update: updateResource },
          }),
    );

    const result = await service(db).confirmMyPickup(user, 501);

    expect(result.status).toBe('inUse');
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AccountKey: user.accountKey, CurrentStatus: 'Prepared' }),
      data: expect.objectContaining({ CurrentStatus: 'Lended' }),
    }));
    expect(updateResource).toHaveBeenCalledWith({
      where: { ResourceKey: 7 },
      data: { ResourceStatus: 'Lended' },
    });
  });

  it('does not complete borrower pickup without a before photo', async () => {
    const db: any = dbFor();
    db.usageLog.findUnique = jest.fn().mockResolvedValue({
      UsageKey: 501,
      AccountKey: user.accountKey,
      ResourceKey: 7,
      ReservationKey: 101,
      CurrentStatus: 'Prepared',
    });
    db.images = { findFirst: jest.fn().mockResolvedValue(null) };

    await expect(service(db).confirmMyPickup(user, 501)).rejects.toMatchObject({
      message: 'PICKUP_PHOTO_REQUIRED',
    });
  });

  it('6.3 rejects a borrower who fails eligibility', async () => {
    const db = dbFor();
    const eligibility = { assertMayBorrow: jest.fn().mockRejectedValue(new BusinessError('NOT_ELIGIBLE')) };
    const result = await service(db, eligibility as any).create(user, future as any);
    expect(result.created).toHaveLength(0); expect(result.rejected[0].code).toBe('NOT_ELIGIBLE');
  });
});
