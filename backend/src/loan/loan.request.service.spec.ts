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

function service(
  db: any,
  eligibility: any = { assertMayBorrow: jest.fn().mockResolvedValue({ maxBorrowDays: 7 }) },
  creditTier = 'D0',
  audit: any = { record: jest.fn() },
) {
  return new LoanRequestService(
    db,
    { resolveTier: jest.fn().mockResolvedValue({ creditTierKey: 1, creditTier }), tierMapper: jest.fn().mockResolvedValue(() => creditTier) } as any,
    eligibility as any,
    audit as any,
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

  it('6.10 borrower can cancel their own pending request', async () => {
    const db: any = dbFor();
    const row = await db.reservations.findUnique();
    row.ApproveStatus = 'Pending';
    row.AutoApproved = false;
    row.ApprovedAt = null;
    row.ResolvedAt = null;
    db.reservations.update = jest.fn().mockImplementation(({ data }: any) => {
      row.ApproveStatus = data.ApproveStatus;
      row.ResolvedAt = data.ResolvedAt;
      row.Reason = data.Reason;
      return Promise.resolve(row);
    });

    const result = await service(db).cancel(user, {
      reservationKey: 101,
      reason: 'เปลี่ยนแผนการใช้งาน',
    });

    expect(db.reservations.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { ReservationKey: 101 },
      data: expect.objectContaining({
        ApproveStatus: 'Canceled',
        Reason: 'เปลี่ยนแผนการใช้งาน',
      }),
    }));
    expect(result.status).toBe('cancelled');
    expect(result.cancellable).toBe(false);
  });

  it('6.10 borrower cannot cancel another borrower’s request', async () => {
    const db: any = dbFor();
    db.reservations.update = jest.fn();
    const otherUser = { accountKey: 99, role: 'borrower' as const, facultyKey: null, creditScore: 80 };

    await expect(
      service(db).cancel(otherUser, { reservationKey: 101 }),
    ).rejects.toMatchObject({
      message: 'RESERVATION_NOT_FOUND',
    });

    expect(db.reservations.update).not.toHaveBeenCalled();
  });

  it('6.3 rejects a borrower who fails eligibility', async () => {
    const db = dbFor();
    const eligibility = { assertMayBorrow: jest.fn().mockRejectedValue(new BusinessError('NOT_ELIGIBLE')) };
    const result = await service(db, eligibility as any).create(user, future as any);
    expect(result.created).toHaveLength(0); expect(result.rejected[0].code).toBe('NOT_ELIGIBLE');
  });
});

describe('one room held at a time', () => {
  // Rooms are same-day only, so the clock is pinned to the morning of the
  // fixture's day and the window is 09:00-10:00 Bangkok, on the slot grid.
  const roomWindow = { startTime: '2099-01-10T02:00:00.000Z', endTime: '2099-01-10T03:00:00.000Z', lines: [{ resourceKey: 7 }] };
  beforeEach(() => jest.useFakeTimers({ now: new Date('2099-01-10T01:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] }));
  afterEach(() => jest.useRealTimers());

  // Sent straight to loan.create on purpose: the limit has to hold on every
  // path that can book a room, not only the one the room page uses.
  const room = {
    ...baseResource,
    BorrowRuleInfo: { RuleName: 'T3' },
    Item: null,
    Room: { RoomName: 'Lab 2', CreditWeight: 0 },
  };

  function holding(count: number) {
    const db = dbFor(room as any);
    const tx = (db.$transaction as jest.Mock);
    // First count is the window clash, second is what this borrower holds.
    tx.mockImplementation(async (arg: any) => {
      const inner = { reservations: { count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(count), create: jest.fn().mockResolvedValue({ ReservationKey: 101 }) } };
      return Array.isArray(arg) ? Promise.all(arg) : arg(inner);
    });
    return db;
  }

  it('refuses a second room while one is still held', async () => {
    const result = await service(holding(1)).create(user, roomWindow as any);
    expect(result.created).toHaveLength(0);
    expect(result.rejected[0].code).toBe('ROOM_BOOKING_LIMIT_REACHED');
  });

  it('books the first one', async () => {
    const result = await service(holding(0)).create(user, roomWindow as any);
    expect(result.created).toHaveLength(1);
  });

  it('leaves equipment alone', async () => {
    const db = dbFor();
    const result = await service(db).create(user, future as any);
    expect(result.created).toHaveLength(1);
  });
});

describe('room windows sent as raw instants', () => {
  const room = { ...baseResource, BorrowRuleInfo: { RuleName: 'T3' }, Item: null, Room: { RoomName: 'Lab 2', CreditWeight: 0 } };
  beforeEach(() => jest.useFakeTimers({ now: new Date('2099-01-10T01:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] }));
  afterEach(() => jest.useRealTimers());
  const at = (s: string, e: string) => ({ startTime: `2099-01-10T${s}:00.000Z`, endTime: `2099-01-10T${e}:00.000Z`, lines: [{ resourceKey: 7 }] });

  it.each([
    ['off the grid (13:10-13:40)', at('06:10', '06:40'), 'ROOM_SLOT_OUT_OF_RANGE'],
    ['seven slots', at('07:00', '10:30'), 'ROOM_SLOT_LIMIT_EXCEEDED'],
    ['across lunch', at('04:30', '06:30'), 'ROOM_SLOTS_NOT_CONTIGUOUS'],
    ['another day', { startTime: '2099-01-15T02:00:00.000Z', endTime: '2099-01-15T03:00:00.000Z', lines: [{ resourceKey: 7 }] }, 'ROOM_BOOKING_SAME_DAY_ONLY'],
  ])('refuses %s', async (_l, input, code) => {
    const result = await service(dbFor(room as any)).create(user, input as any);
    expect(result.created).toHaveLength(0);
    expect(result.rejected[0].code).toBe(code);
  });
});

describe('audit trail', () => {
  it('records a create row for each reservation opened', async () => {
    const db = dbFor();
    const audit = { record: jest.fn() };
    const result = await service(db, undefined, 'D0', audit).create(user, future as any);

    expect(audit.record).toHaveBeenCalledWith(
      { accountKey: user.accountKey },
      'create',
      `reservation/${result.created[0].reservationKey}`,
      expect.any(String),
    );
  });

  it('does not record anything when every line is rejected', async () => {
    const db = dbFor({ ...baseResource, AllowBorrow: false });
    const audit = { record: jest.fn() };
    await service(db, undefined, 'D0', audit).create(user, future as any);

    expect(audit.record).not.toHaveBeenCalled();
  });
});
