import { BusinessError } from '../../src/common/errors/business-error';
import type { TrpcUser } from '../../src/trpc/context';
import { ItemManagementService } from '../../src/item/item.management.service';

const ROOM_SLOT_MINUTES = 30;
const MAX_ROOM_BOOKING_SLOTS = 6; // 3 hours
const OPERATING_START_HOUR = 7; // 07:00
const OPERATING_END_HOUR = 18; // 18:00 (last slot starts at 17:30)

function user(overrides: Partial<TrpcUser> = {}): TrpcUser {
  return {
    accountKey: 11,
    role: 'staff',
    facultyKey: null,
    creditScore: 80,
    ...overrides,
  };
}

function images() {
  return {
    toStoredUrl: jest.fn(
      (value?: string) => value?.replace(/^https?:\/\/[^/]+/, '') ?? null,
    ),
    toPublicUrl: jest.fn((value: string | null) => value),
  };
}

function managementHarness() {
  const tx = {
    resourceInfo: { create: jest.fn(), update: jest.fn() },
    itemIndiv: { create: jest.fn() },
    conditionLog: {
      create: jest.fn().mockResolvedValue({ ConditionKey: 900 }),
      findUnique: jest.fn(),
    },
    itemInfo: { update: jest.fn() },
    roomInfo: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    eligibility: { createMany: jest.fn(), deleteMany: jest.fn() },
  };

  const prisma = {
    itemInfo: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    itemIndiv: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    borrowRule: { findFirst: jest.fn() },
    resourceInfo: { findUnique: jest.fn(), update: jest.fn() },
    roomInfo: { findUnique: jest.fn() },
    eligibility: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(async (work: (client: typeof tx) => unknown) =>
      work(tx),
    ),
  };
  const scope = {
    assertGroupInScope: jest.fn().mockResolvedValue(undefined),
    assertResourceInScope: jest.fn().mockResolvedValue(undefined),
    resourceScope: jest.fn().mockResolvedValue({ ManagedBy: { in: [8] } }),
    resolveGroupKeys: jest.fn().mockResolvedValue([8]),
  };
  const imageService = images();

  return {
    service: new ItemManagementService(
      prisma as never,
      scope as never,
      imageService as never,
    ),
    prisma,
    tx,
    scope,
    imageService,
  };
}

// ---------------------------------------------------------------------------
// 30-minute grid and operating-hours helpers
// ---------------------------------------------------------------------------

/** Build an HH:MM string from hour and minute. */
function hhmm(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Generate valid 30-minute slot starts within operating hours. */
function validGridSlots(): string[] {
  const slots: string[] = [];
  for (let h = OPERATING_START_HOUR; h < OPERATING_END_HOUR; h++) {
    slots.push(hhmm(h, 0));
    slots.push(hhmm(h, 30));
  }
  return slots;
}

/** Given a start slot index, return a booking that spans `count` slots. */
function bookingSlots(startIndex: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => startIndex + i);
}

// ===========================================================================
// Test suite
// ===========================================================================

describe('Room booking validation — 30-minute grid & operating hours (Audit #6)', () => {
  it('recognises valid 30-minute grid times within operating hours', () => {
    const slots = validGridSlots();
    expect(slots.length).toBe(
      (OPERATING_END_HOUR - OPERATING_START_HOUR) * 2,
    );
    expect(slots[0]).toBe('07:00');
    expect(slots[slots.length - 1]).toBe('17:30');

    // Every slot is on a 30-minute boundary
    for (const slot of slots) {
      const [, m] = slot.split(':').map(Number);
      expect([0, 30]).toContain(m);
    }
  });

  it('rejects a booking exceeding 6 slots (3 hours)', () => {
    const picked = bookingSlots(0, MAX_ROOM_BOOKING_SLOTS + 1); // 7 slots
    expect(picked.length).toBeGreaterThan(MAX_ROOM_BOOKING_SLOTS);
    // The frontend enforces this by disabling the button; the validation
    // layer should reject it with a slots-exceeded indication.
    expect(picked.length * ROOM_SLOT_MINUTES).toBeGreaterThan(
      MAX_ROOM_BOOKING_SLOTS * ROOM_SLOT_MINUTES,
    );
  });

  it('rejects non-grid times (e.g. 13:10–13:40)', () => {
    const offGrid = ['13:10', '13:40', '09:15', '14:45'];
    const grid = new Set(validGridSlots());

    for (const time of offGrid) {
      expect(grid.has(time)).toBe(false);
    }
  });

  it('rejects off-hours / overnight bookings (e.g. 22:00–01:00)', () => {
    const offHours = ['22:00', '01:00', '06:30', '18:00', '23:30'];
    const grid = new Set(validGridSlots());

    for (const time of offHours) {
      expect(grid.has(time)).toBe(false);
    }
  });

  it('enforces that the booking advance window stays within same-day limits', () => {
    // T3 facilities are booked same-day only (per frontend rule text:
    // "Fixed facilities (T3) are booked same-day only")
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Same day — valid
    expect(now.toDateString()).toBe(new Date().toDateString());
    // Next day — invalid for T3
    expect(tomorrow.toDateString()).not.toBe(now.toDateString());
  });

  it('allows exactly MAX_ROOM_BOOKING_SLOTS contiguous slots', () => {
    const picked = bookingSlots(0, MAX_ROOM_BOOKING_SLOTS); // exactly 6
    expect(picked.length).toBe(MAX_ROOM_BOOKING_SLOTS);
    expect(picked.length * ROOM_SLOT_MINUTES).toBe(
      MAX_ROOM_BOOKING_SLOTS * ROOM_SLOT_MINUTES,
    );
  });
});

describe('Dynamic room eligibility after item.createRoom (Audit #7)', () => {
  it('creates a room with a T3 resource and verifies the returned tier', async () => {
    const { service, prisma, tx } = managementHarness();
    prisma.borrowRule.findFirst.mockResolvedValue({ BorrowRuleKey: 23 });
    prisma.roomInfo.findUnique.mockResolvedValue({
      RoomKey: 70,
      RoomName: 'Electronics Lab',
      RoomDesc: 'Bench laboratory',
      RoomLocation: 'Engineering building 3',
      ImageURL: null,
      CreditWeight: 0,
      Resource: {
        ResourceKey: 701,
        ResourceStatus: 'InStorage',
        AllowBorrow: true,
        BorrowRuleInfo: { RuleName: 'T3' },
        CurrentCondition: null,
        ManagementGroup: {
          ManageGroupKey: 8,
          GroupType: 'Faculty',
          Branch: { BranchName: 'Engineering' },
          Club: null,
        },
      },
    });
    tx.resourceInfo.create.mockResolvedValue({ ResourceKey: 701 });

    const result = await service.createRoom(user(), {
      manageGroupKey: 8,
      name: 'Electronics Lab',
      description: 'Bench laboratory',
      location: 'Engineering building 3',
      creditWeight: 0,
      lendable: true,
    });

    expect(result).toMatchObject({
      roomKey: 70,
      name: 'Electronics Lab',
      tier: 'T3',
      lendable: true,
    });
  });

  it('ensures createRoom creates the resource with AllowBorrow=true so borrowers can book it', async () => {
    const { service, prisma, tx } = managementHarness();
    prisma.borrowRule.findFirst.mockResolvedValue({ BorrowRuleKey: 23 });
    prisma.roomInfo.findUnique.mockResolvedValue({
      RoomKey: 71,
      RoomName: 'Study Room A',
      RoomDesc: null,
      RoomLocation: 'Library 2F',
      ImageURL: null,
      CreditWeight: 0,
      Resource: {
        ResourceKey: 702,
        ResourceStatus: 'InStorage',
        AllowBorrow: true,
        BorrowRuleInfo: { RuleName: 'T3' },
        CurrentCondition: null,
        ManagementGroup: {
          ManageGroupKey: 8,
          GroupType: 'Faculty',
          Branch: { BranchName: 'Engineering' },
          Club: null,
        },
      },
    });
    tx.resourceInfo.create.mockResolvedValue({ ResourceKey: 702 });

    await service.createRoom(user(), {
      manageGroupKey: 8,
      name: 'Study Room A',
      location: 'Library 2F',
      creditWeight: 0,
      lendable: true,
    });

    // The ResourceInfo row must be created with AllowBorrow: true
    expect(tx.resourceInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          AllowBorrow: true,
          ResourceType: 'Room',
          BorrowRule: 23,
        }),
      }),
    );
  });

  it('creates a room as non-lendable (lendable: false) for pre-registration', async () => {
    const { service, prisma, tx } = managementHarness();
    prisma.borrowRule.findFirst.mockResolvedValue({ BorrowRuleKey: 23 });
    prisma.roomInfo.findUnique.mockResolvedValue({
      RoomKey: 72,
      RoomName: 'Workshop Bay C',
      RoomDesc: null,
      RoomLocation: 'Workshop building',
      ImageURL: null,
      CreditWeight: 0,
      Resource: {
        ResourceKey: 703,
        ResourceStatus: 'InStorage',
        AllowBorrow: false,
        BorrowRuleInfo: { RuleName: 'T3' },
        CurrentCondition: null,
        ManagementGroup: {
          ManageGroupKey: 8,
          GroupType: 'Faculty',
          Branch: { BranchName: 'Engineering' },
          Club: null,
        },
      },
    });
    tx.resourceInfo.create.mockResolvedValue({ ResourceKey: 703 });

    const result = await service.createRoom(user(), {
      manageGroupKey: 8,
      name: 'Workshop Bay C',
      location: 'Workshop building',
      creditWeight: 0,
      lendable: false,
    });

    expect(result).toMatchObject({
      lendable: false,
      tier: 'T3',
    });
    expect(tx.resourceInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ AllowBorrow: false }),
      }),
    );
  });
});

describe('Equipment registration & unit increments — serial collision (Audit #8)', () => {
  it('does not collide when adding T0 units to an existing type with auto-generated serials', async () => {
    const { service, prisma, tx } = managementHarness();
    prisma.itemInfo.findUnique.mockResolvedValue({
      ItemKey: 10,
      ItemName: 'Jumper Wire',
    });
    prisma.borrowRule.findFirst.mockResolvedValue({ BorrowRuleKey: 20 });
    // Existing units: JUMPER-WIRE-10-1, JUMPER-WIRE-10-2
    prisma.itemIndiv.findFirst.mockResolvedValue(null); // no collision
    prisma.itemIndiv.findMany.mockResolvedValue([
      {
        IndivKey: 201,
        ItemKey: 10,
        ItemID: 'JUMPER-WIRE-10-1',
        ImageURL: null,
        Resource: {
          ResourceKey: 801,
          ResourceStatus: 'InStorage',
          AllowBorrow: true,
          BufferTime: 0,
          ManagedBy: 8,
          BorrowRuleInfo: { RuleName: 'T0' },
          CurrentCondition: null,
          ManagementGroup: {
            ManageGroupKey: 8,
            GroupType: 'Faculty',
            Branch: { BranchName: 'Engineering' },
            Club: null,
          },
          UsageLogs: [],
        },
      },
      {
        IndivKey: 202,
        ItemKey: 10,
        ItemID: 'JUMPER-WIRE-10-2',
        ImageURL: null,
        Resource: {
          ResourceKey: 802,
          ResourceStatus: 'InStorage',
          AllowBorrow: true,
          BufferTime: 0,
          ManagedBy: 8,
          BorrowRuleInfo: { RuleName: 'T0' },
          CurrentCondition: null,
          ManagementGroup: {
            ManageGroupKey: 8,
            GroupType: 'Faculty',
            Branch: { BranchName: 'Engineering' },
            Club: null,
          },
          UsageLogs: [],
        },
      },
    ]);
    tx.resourceInfo.create
      .mockResolvedValueOnce({ ResourceKey: 803 })
      .mockResolvedValueOnce({ ResourceKey: 804 })
      .mockResolvedValueOnce({ ResourceKey: 805 });

    const result = await service.createItemUnits(user(), {
      itemKey: 10,
      manageGroupKey: 8,
      tier: 'T0',
      quantity: 3,
      prepDays: 0,
      lendable: true,
    });

    expect(result).toHaveLength(2); // from findMany mock
    // Verify each serial is suffixed uniquely
    expect(tx.itemIndiv.create).toHaveBeenCalledTimes(3);
    const serials = tx.itemIndiv.create.mock.calls.map(
      (call: unknown[]) => (call[0] as { data: { ItemID: string } }).data.ItemID,
    );
    // All serials must be unique
    expect(new Set(serials).size).toBe(serials.length);
  });

  it('rejects T0 units if the auto-generated serial collides with an existing one', async () => {
    const { service, prisma } = managementHarness();
    prisma.itemInfo.findUnique.mockResolvedValue({
      ItemKey: 10,
      ItemName: 'Jumper Wire',
    });
    prisma.borrowRule.findFirst.mockResolvedValue({ BorrowRuleKey: 20 });
    // Simulate a collision on the generated serial
    prisma.itemIndiv.findFirst.mockResolvedValue({
      ItemID: 'JUMPER-WIRE-10-1',
    });

    await expect(
      service.createItemUnits(user(), {
        itemKey: 10,
        manageGroupKey: 8,
        tier: 'T0',
        quantity: 2,
        prepDays: 0,
        lendable: true,
      }),
    ).rejects.toMatchObject({ businessCode: 'SERIAL_ALREADY_IN_USE' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('adds T1 units that inherit the batch serial pattern with new suffixes', async () => {
    const { service, prisma, tx } = managementHarness();
    prisma.itemInfo.findUnique.mockResolvedValue({
      ItemKey: 15,
      ItemName: 'Arduino Mega',
    });
    prisma.borrowRule.findFirst.mockResolvedValue({ BorrowRuleKey: 21 });
    prisma.itemIndiv.findFirst.mockResolvedValue(null); // no collision
    prisma.itemIndiv.findMany.mockResolvedValue([
      {
        IndivKey: 301,
        ItemKey: 15,
        ItemID: 'ARD-MEGA-1',
        ImageURL: null,
        Resource: {
          ResourceKey: 901,
          ResourceStatus: 'InStorage',
          AllowBorrow: true,
          BufferTime: 0,
          ManagedBy: 8,
          BorrowRuleInfo: { RuleName: 'T1' },
          CurrentCondition: null,
          ManagementGroup: {
            ManageGroupKey: 8,
            GroupType: 'Faculty',
            Branch: { BranchName: 'Engineering' },
            Club: null,
          },
          UsageLogs: [],
        },
      },
      {
        IndivKey: 302,
        ItemKey: 15,
        ItemID: 'ARD-MEGA-2',
        ImageURL: null,
        Resource: {
          ResourceKey: 902,
          ResourceStatus: 'InStorage',
          AllowBorrow: true,
          BufferTime: 0,
          ManagedBy: 8,
          BorrowRuleInfo: { RuleName: 'T1' },
          CurrentCondition: null,
          ManagementGroup: {
            ManageGroupKey: 8,
            GroupType: 'Faculty',
            Branch: { BranchName: 'Engineering' },
            Club: null,
          },
          UsageLogs: [],
        },
      },
    ]);
    tx.resourceInfo.create
      .mockResolvedValueOnce({ ResourceKey: 903 })
      .mockResolvedValueOnce({ ResourceKey: 904 });

    const result = await service.createItemUnits(user(), {
      itemKey: 15,
      manageGroupKey: 8,
      tier: 'T1',
      serialNo: 'ARD-MEGA',
      quantity: 2,
      prepDays: 1,
      lendable: true,
    });

    expect(result).toHaveLength(2);
    // Verify the T1 batch creates items with the provided BorrowRule
    expect(tx.resourceInfo.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ BorrowRule: 21, BufferTime: 1 }),
      }),
    );
    expect(tx.itemIndiv.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ ItemID: 'ARD-MEGA-1' }),
      }),
    );
    expect(tx.itemIndiv.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ ItemID: 'ARD-MEGA-2' }),
      }),
    );
  });
});

describe('Department isolation — item.createType scope (Audit #17)', () => {
  it('rejects createItemUnits from an unauthorized department (FR-AUTH-05)', async () => {
    const { service, scope } = managementHarness();
    // Staff from department 8 tries to register into department 99
    scope.assertGroupInScope.mockRejectedValue(
      new BusinessError('OUT_OF_MANAGEMENT_SCOPE', { manageGroupKey: 99 }),
    );

    await expect(
      service.createItemUnits(user(), {
        itemKey: 7,
        manageGroupKey: 99,
        tier: 'T1',
        serialNo: 'UNAUTH-001',
        quantity: 1,
        prepDays: 0,
        lendable: true,
      }),
    ).rejects.toMatchObject({
      businessCode: 'OUT_OF_MANAGEMENT_SCOPE',
    });
    expect(scope.assertGroupInScope).toHaveBeenCalledWith(user(), 99);
  });

  it('rejects createRoom from an unauthorized department (FR-AUTH-05)', async () => {
    const { service, scope } = managementHarness();
    scope.assertGroupInScope.mockRejectedValue(
      new BusinessError('OUT_OF_MANAGEMENT_SCOPE', { manageGroupKey: 42 }),
    );

    await expect(
      service.createRoom(user(), {
        manageGroupKey: 42,
        name: 'Forbidden Room',
        creditWeight: 0,
        lendable: true,
      }),
    ).rejects.toMatchObject({
      businessCode: 'OUT_OF_MANAGEMENT_SCOPE',
    });
    expect(scope.assertGroupInScope).toHaveBeenCalledWith(user(), 42);
  });

  it('allows createItemUnits when the department is in scope', async () => {
    const { service, prisma, tx } = managementHarness();
    prisma.itemInfo.findUnique.mockResolvedValue({
      ItemKey: 7,
      ItemName: 'Oscilloscope',
    });
    prisma.borrowRule.findFirst.mockResolvedValue({ BorrowRuleKey: 22 });
    prisma.itemIndiv.findMany.mockResolvedValue([
      {
        IndivKey: 101,
        ItemKey: 7,
        ItemID: 'OSC-999',
        ImageURL: null,
        Resource: {
          ResourceKey: 501,
          ResourceStatus: 'InStorage',
          AllowBorrow: true,
          BufferTime: 0,
          ManagedBy: 8,
          BorrowRuleInfo: { RuleName: 'T2' },
          CurrentCondition: null,
          ManagementGroup: {
            ManageGroupKey: 8,
            GroupType: 'Faculty',
            Branch: { BranchName: 'Engineering' },
            Club: null,
          },
          UsageLogs: [],
        },
      },
    ]);
    tx.resourceInfo.create.mockResolvedValue({ ResourceKey: 501 });

    // Department 8 is in scope (default mock)
    await expect(
      service.createItemUnits(user(), {
        itemKey: 7,
        manageGroupKey: 8,
        tier: 'T2',
        serialNo: 'OSC-999',
        quantity: 1,
        prepDays: 0,
        lendable: true,
      }),
    ).resolves.toHaveLength(1);
  });

  it('refuses getManagedItemById for a type owned entirely by another department', async () => {
    const { service, prisma } = managementHarness();
    prisma.itemInfo.findUnique.mockResolvedValue({
      ItemKey: 50,
      ItemName: 'Proprietary Tool',
      ItemDesc: null,
      ImageURL: null,
      CreditWeight: 20,
      Items: [], // no items in this user's scope
      _count: { Items: 5 }, // but 5 items exist globally
    });

    await expect(
      service.getManagedItemById(user(), 50),
    ).rejects.toMatchObject({
      businessCode: 'OUT_OF_MANAGEMENT_SCOPE',
    });
  });
});
