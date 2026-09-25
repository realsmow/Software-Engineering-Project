import { ItemManagementService } from './item.management.service';
import type { PrismaService } from '../prisma.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { ImageService } from '../image/image.service';
import type { TrpcUser } from '../trpc/context';

/**
 * FR-EQP-05: delete is allowed only on a record with no history. A unit/room
 * needs zero Reservations, UsageLog rows and Images (the spec's own list) -
 * this file also checks Inspection and RepairLog, which can exist without a
 * Reservation/UsageLog (RepairLog.ReservationKey is optional) and would
 * otherwise surface as a raw FK violation instead of HAS_HISTORY. A type may
 * be deleted only once every one of its units already has been.
 */

const staff: TrpcUser = {
  accountKey: 4,
  role: 'staff',
  facultyKey: null,
  creditScore: 100,
};

function harness() {
  const tx = {
    itemIndiv: { delete: jest.fn().mockResolvedValue({}) },
    roomInfo: { delete: jest.fn().mockResolvedValue({}) },
    retirementRequest: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    conditionLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    eligibility: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    resourceInfo: { delete: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    itemInfo: {
      findUnique: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
    itemIndiv: {
      findUnique: jest.fn(),
    },
    roomInfo: {
      findUnique: jest.fn(),
    },
    reservations: { count: jest.fn().mockResolvedValue(0) },
    usageLog: { count: jest.fn().mockResolvedValue(0) },
    images: { count: jest.fn().mockResolvedValue(0) },
    inspection: { count: jest.fn().mockResolvedValue(0) },
    repairLog: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn((arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : (arg as (t: typeof tx) => unknown)(tx),
    ),
  } as unknown as PrismaService;
  const scope = {
    resolveGroupKeys: jest.fn().mockResolvedValue([1]),
    assertResourceInScope: jest.fn(),
  } as unknown as StaffScopeService;
  const images = {
    toStoredUrl: (url?: string) => url ?? null,
    toPublicUrl: (url: string | null) => url,
  } as unknown as ImageService;
  const audit = { record: jest.fn() };
  return {
    service: new ItemManagementService(
      prisma,
      scope,
      images,
      audit as never,
      { retirementRequested: jest.fn(), retirementDecided: jest.fn() } as never,
    ),
    prisma,
    scope,
    tx,
    audit,
  };
}

describe('deleteType', () => {
  it('refuses with HAS_HISTORY while units remain', async () => {
    const t = harness();
    (t.prisma.itemInfo.findUnique as jest.Mock).mockResolvedValueOnce({
      ItemName: 'Multimeter',
      _count: { Items: 3 },
    });

    await expect(
      t.service.deleteItemType(staff, { itemKey: 5 }),
    ).rejects.toMatchObject({
      businessCode: 'HAS_HISTORY',
      details: { itemKey: 5, units: 3 },
    });
    expect(t.prisma.itemInfo.delete).not.toHaveBeenCalled();
  });

  it('deletes a type with no units left, and audits it', async () => {
    const t = harness();
    (t.prisma.itemInfo.findUnique as jest.Mock).mockResolvedValueOnce({
      ItemName: 'Multimeter',
      _count: { Items: 0 },
    });

    const result = await t.service.deleteItemType(staff, { itemKey: 5 });

    expect(result).toEqual({ itemKey: 5 });
    expect(t.prisma.itemInfo.delete).toHaveBeenCalledWith({
      where: { ItemKey: 5 },
    });
    expect(t.audit.record).toHaveBeenCalledWith(
      { accountKey: staff.accountKey },
      'delete',
      'item/5',
      expect.any(String),
    );
  });

  it('reports ITEM_TYPE_NOT_FOUND for an unknown key', async () => {
    const t = harness();
    (t.prisma.itemInfo.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(
      t.service.deleteItemType(staff, { itemKey: 999 }),
    ).rejects.toMatchObject({ businessCode: 'ITEM_TYPE_NOT_FOUND' });
  });
});

describe('deleteUnit', () => {
  const unit = { IndivKey: 7, ItemID: 'MM-001' };

  it('refuses with HAS_HISTORY when a usage log exists', async () => {
    const t = harness();
    (t.prisma.itemIndiv.findUnique as jest.Mock).mockResolvedValueOnce(unit);
    (t.prisma.usageLog.count as jest.Mock).mockResolvedValueOnce(1);

    await expect(
      t.service.deleteItemUnit(staff, { resourceKey: 10 }),
    ).rejects.toMatchObject({ businessCode: 'HAS_HISTORY' });
    expect(t.tx.itemIndiv.delete).not.toHaveBeenCalled();
  });

  it('refuses with HAS_HISTORY for a repair log with no reservation behind it', async () => {
    // RepairLog.ReservationKey is optional, so a repair can exist with zero
    // Reservations and zero UsageLog rows - this is the case that would
    // otherwise hit the RepairLog_ResourceKey_fkey RESTRICT constraint.
    const t = harness();
    (t.prisma.itemIndiv.findUnique as jest.Mock).mockResolvedValueOnce(unit);
    (t.prisma.repairLog.count as jest.Mock).mockResolvedValueOnce(1);

    await expect(
      t.service.deleteItemUnit(staff, { resourceKey: 10 }),
    ).rejects.toMatchObject({ businessCode: 'HAS_HISTORY' });
  });

  it('deletes a fresh unit: its own ConditionLog/Eligibility rows, then itself', async () => {
    const t = harness();
    (t.prisma.itemIndiv.findUnique as jest.Mock).mockResolvedValueOnce(unit);

    const result = await t.service.deleteItemUnit(staff, { resourceKey: 10 });

    expect(result).toEqual({ resourceKey: 10 });
    // Regression: a resource that once had a (cancelled or rejected)
    // retirement request must still be deletable - RetirementRequest is
    // RESTRICT-linked to ResourceInfo, and leaving it behind turned this
    // delete into a raw FK violation instead of succeeding.
    expect(t.tx.retirementRequest.deleteMany).toHaveBeenCalledWith({
      where: { ResourceKey: 10 },
    });
    expect(t.tx.conditionLog.deleteMany).toHaveBeenCalledWith({
      where: { ResourceKey: 10 },
    });
    expect(t.tx.eligibility.deleteMany).toHaveBeenCalledWith({
      where: { ResourceKey: 10 },
    });
    expect(t.tx.itemIndiv.delete).toHaveBeenCalledWith({
      where: { IndivKey: 7 },
    });
    expect(t.tx.resourceInfo.delete).toHaveBeenCalledWith({
      where: { ResourceKey: 10 },
    });
    expect(t.audit.record).toHaveBeenCalledWith(
      { accountKey: staff.accountKey },
      'delete',
      'unit/10',
      expect.any(String),
    );
  });

  it("checks the unit is in the caller's scope before touching it", async () => {
    const t = harness();
    (t.prisma.itemIndiv.findUnique as jest.Mock).mockResolvedValueOnce(unit);
    await t.service.deleteItemUnit(staff, { resourceKey: 10 });
    expect(t.scope.assertResourceInScope).toHaveBeenCalledWith(staff, 10);
  });
});

describe('deleteRoom', () => {
  const room = { RoomKey: 2, RoomName: 'Lab A' };

  it('refuses with HAS_HISTORY when a reservation exists', async () => {
    const t = harness();
    (t.prisma.roomInfo.findUnique as jest.Mock).mockResolvedValueOnce(room);
    (t.prisma.reservations.count as jest.Mock).mockResolvedValueOnce(2);

    await expect(
      t.service.deleteRoom(staff, { resourceKey: 50 }),
    ).rejects.toMatchObject({ businessCode: 'HAS_HISTORY' });
    expect(t.tx.roomInfo.delete).not.toHaveBeenCalled();
  });

  it('deletes a fresh room', async () => {
    const t = harness();
    (t.prisma.roomInfo.findUnique as jest.Mock).mockResolvedValueOnce(room);

    const result = await t.service.deleteRoom(staff, { resourceKey: 50 });

    expect(result).toEqual({ resourceKey: 50 });
    expect(t.tx.roomInfo.delete).toHaveBeenCalledWith({
      where: { RoomKey: 2 },
    });
    expect(t.tx.resourceInfo.delete).toHaveBeenCalledWith({
      where: { ResourceKey: 50 },
    });
  });

  it('reports RESOURCE_NOT_FOUND for an unknown room', async () => {
    const t = harness();
    (t.prisma.roomInfo.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(
      t.service.deleteRoom(staff, { resourceKey: 999 }),
    ).rejects.toMatchObject({ businessCode: 'RESOURCE_NOT_FOUND' });
  });
});
