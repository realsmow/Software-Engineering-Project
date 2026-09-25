import { BusinessError } from '../../src/common/errors/business-error';
import type { TrpcUser } from '../../src/trpc/context';
import { ItemManagementService } from '../../src/item/item.management.service';
import { ItemService } from '../../src/item/item.service';
import { InspectionService } from '../../src/inspection/inspection.service';

function user(overrides: Partial<TrpcUser> = {}): TrpcUser {
  return {
    accountKey: 11,
    role: 'staff',
    facultyKey: null,
    creditScore: 80,
    ...overrides,
  };
}

function unitRow(overrides: Record<string, unknown> = {}) {
  return {
    IndivKey: 101,
    ItemKey: 7,
    ItemID: 'OSC-001',
    ImageURL: null,
    Resource: {
      ResourceKey: 501,
      ResourceStatus: 'InStorage',
      AllowBorrow: true,
      BufferTime: 2,
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
    eligibility: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn() },
    conditionLog: {
      create: jest.fn().mockResolvedValue({ ConditionKey: 900 }),
      findUnique: jest.fn(),
    },
    itemInfo: { update: jest.fn() },
    roomInfo: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  };

  const prisma = {
    itemInfo: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    itemIndiv: {
      findFirst: jest.fn().mockResolvedValue(null),
      // The first call reads the type's existing serials; the default is a
      // type with no units yet.
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    borrowRule: { findFirst: jest.fn() },
    resourceInfo: { findUnique: jest.fn(), update: jest.fn() },
    roomInfo: { findUnique: jest.fn() },
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
  const audit = { record: jest.fn() };

  return {
    service: new ItemManagementService(
      prisma as never,
      scope as never,
      imageService as never,
      audit as never,
      { retirementRequested: jest.fn(), retirementDecided: jest.fn() } as never,
    ),
    prisma,
    tx,
    scope,
    imageService,
    audit,
  };
}

describe('Module 5 equipment management', () => {
  it('refuses a new item type from staff attached to no department', async () => {
    const { service, prisma, scope } = managementHarness();
    scope.resolveGroupKeys.mockRejectedValue(
      Object.assign(new Error('NO_MANAGEMENT_SCOPE'), { businessCode: 'NO_MANAGEMENT_SCOPE' }),
    );
    await expect(
      service.createItemType(user(), { name: 'Scope', creditWeight: 1 }),
    ).rejects.toMatchObject({ businessCode: 'NO_MANAGEMENT_SCOPE' });
    expect(prisma.itemInfo.create).not.toHaveBeenCalled();
  });

  it('registers an equipment type with its display metadata and credit weight', async () => {
    const { service, prisma, imageService } = managementHarness();
    prisma.itemInfo.create.mockResolvedValue({
      ItemKey: 7,
      ItemName: 'Oscilloscope',
      ItemDesc: 'Four-channel scope',
      ImageURL: '/uploads/scope.png',
      CreditWeight: 10,
    });

    await expect(
      service.createItemType(user(), {
        name: 'Oscilloscope',
        description: 'Four-channel scope',
        imageUrl: 'https://cdn.example/scope.png',
        creditWeight: 10,
      }),
    ).resolves.toMatchObject({
      id: 7,
      name: 'Oscilloscope',
      creditWeight: 10,
      totalUnits: 0,
      availableUnits: 0,
      tiers: [],
      units: [],
    });

    expect(imageService.toStoredUrl).toHaveBeenCalledWith(
      'https://cdn.example/scope.png',
    );
    expect(prisma.itemInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ItemName: 'Oscilloscope',
          ItemDesc: 'Four-channel scope',
          CreditWeight: 10,
        }),
      }),
    );
  });

  it('registers a T1 batch with unique derived serials in one transaction', async () => {
    const { service, prisma, tx } = managementHarness();
    prisma.itemInfo.findUnique.mockResolvedValue({
      ItemKey: 7,
      ItemName: 'Signal Generator',
    });
    prisma.borrowRule.findFirst.mockResolvedValue({ BorrowRuleKey: 21 });
    prisma.itemIndiv.findMany.mockResolvedValue([
      unitRow({
        ItemID: 'SG-001-1',
        Resource: {
          ...unitRow().Resource,
          ResourceKey: 601,
          BorrowRuleInfo: { RuleName: 'T1' },
        },
      }),
      unitRow({
        ItemID: 'SG-001-2',
        IndivKey: 102,
        Resource: {
          ...unitRow().Resource,
          ResourceKey: 602,
          BorrowRuleInfo: { RuleName: 'T1' },
        },
      }),
    ]);
    // No units of this type yet: numbering starts at 1.
    prisma.itemIndiv.findMany.mockResolvedValueOnce([]);
    tx.resourceInfo.create
      .mockResolvedValueOnce({ ResourceKey: 601 })
      .mockResolvedValueOnce({ ResourceKey: 602 });

    const result = await service.createItemUnits(user(), {
      itemKey: 7,
      manageGroupKey: 8,
      tier: 'T1',
      serialNo: 'SG-001',
      prepDays: 3,
      lendable: true,
      quantity: 2,
    });

    expect(result).toHaveLength(2);
    expect(tx.resourceInfo.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ BorrowRule: 21, BufferTime: 3 }),
      }),
    );
    expect(tx.itemIndiv.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ ItemID: 'SG-001-1' }),
      }),
    );
    expect(tx.itemIndiv.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ ItemID: 'SG-001-2' }),
      }),
    );
  });

  it('registers a T2 unit only when its real serial is supplied', async () => {
    const { service, prisma } = managementHarness();
    prisma.itemInfo.findUnique.mockResolvedValue({
      ItemKey: 7,
      ItemName: 'Oscilloscope',
    });
    prisma.borrowRule.findFirst.mockResolvedValue({ BorrowRuleKey: 22 });
    prisma.itemIndiv.findMany.mockResolvedValue([unitRow()]);
    prisma.$transaction.mockImplementation(async (work) =>
      work({
        resourceInfo: {
          create: jest.fn().mockResolvedValue({ ResourceKey: 501 }),
        },
        itemIndiv: { create: jest.fn() },
    eligibility: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn() },
        conditionLog: { create: jest.fn(), findUnique: jest.fn() },
        itemInfo: { update: jest.fn() },
      } as never),
    );

    await expect(
      service.createItemUnits(user(), {
        itemKey: 7,
        manageGroupKey: 8,
        tier: 'T2',
        serialNo: 'OSC-001',
        quantity: 1,
        prepDays: 0,
        lendable: true,
      }),
    ).resolves.toHaveLength(1);
  });

  it('registers a T3 room as a fixed-location resource with the T3 rule', async () => {
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

    await expect(
      service.createRoom(user(), {
        manageGroupKey: 8,
        name: 'Electronics Lab',
        description: 'Bench laboratory',
        location: 'Engineering building 3',
        creditWeight: 0,
        lendable: true,
      }),
    ).resolves.toMatchObject({
      roomKey: 70,
      name: 'Electronics Lab',
      tier: 'T3',
    });

    expect(tx.resourceInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          BorrowRule: 23,
          ResourceType: 'Room',
          BufferTime: 0,
        }),
      }),
    );
  });

  it.each([
    [
      // T2 only: T1 gets a generated tag, as the team decided (audit #8).
      'missing T2 serial',
      { tier: 'T2', quantity: 1 },
      'SERIAL_REQUIRED_FOR_TIER',
    ],
    [
      'bulk T2 registration',
      { tier: 'T2', serialNo: 'OSC-001', quantity: 2 },
      'BULK_NOT_ALLOWED_FOR_TIER',
    ],
  ])('rejects %s with a typed business error', async (_label, input, code) => {
    const { service, prisma } = managementHarness();
    prisma.itemInfo.findUnique.mockResolvedValue({
      ItemKey: 7,
      ItemName: 'Oscilloscope',
    });
    prisma.borrowRule.findFirst.mockResolvedValue({ BorrowRuleKey: 22 });

    await expect(
      service.createItemUnits(user(), {
        itemKey: 7,
        manageGroupKey: 8,
        prepDays: 0,
        lendable: true,
        ...input,
      } as never),
    ).rejects.toMatchObject({ businessCode: code });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a duplicate serial before creating any resource row', async () => {
    const { service, prisma } = managementHarness();
    prisma.itemInfo.findUnique.mockResolvedValue({
      ItemKey: 7,
      ItemName: 'Oscilloscope',
    });
    prisma.borrowRule.findFirst.mockResolvedValue({ BorrowRuleKey: 22 });
    prisma.itemIndiv.findFirst.mockResolvedValue({ ItemID: 'OSC-001' });

    await expect(
      service.createItemUnits(user(), {
        itemKey: 7,
        manageGroupKey: 8,
        tier: 'T2',
        serialNo: 'OSC-001',
        quantity: 1,
        prepDays: 0,
        lendable: true,
      }),
    ).rejects.toMatchObject({ businessCode: 'SERIAL_ALREADY_IN_USE' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses withdrawing a unit while a borrower is holding it', async () => {
    const { service, prisma, scope } = managementHarness();
    prisma.resourceInfo.findUnique.mockResolvedValue({
      ResourceKey: 501,
      ConditionKey: null,
      UsageLogs: [{ UsageKey: 77, CurrentStatus: 'Lended' }],
    });

    await expect(
      service.setUnitLendable(user(), { resourceKey: 501, lendable: false }),
    ).rejects.toMatchObject({ businessCode: 'RESOURCE_IN_USE' });
    expect(scope.assertResourceInScope).toHaveBeenCalledWith(user(), 501);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('withdraws a free unit and preserves the optional maintenance reason', async () => {
    const { service, prisma, tx } = managementHarness();
    prisma.resourceInfo.findUnique.mockResolvedValue({
      ResourceKey: 501,
      ConditionKey: null,
      UsageLogs: [],
    });
    prisma.itemIndiv.findUnique.mockResolvedValue(
      unitRow({
        Resource: { ...unitRow().Resource, AllowBorrow: false },
      }),
    );

    await service.setUnitLendable(user(), {
      resourceKey: 501,
      lendable: false,
      reason: 'Awaiting calibration',
    });

    expect(tx.resourceInfo.update).toHaveBeenCalledWith({
      where: { ResourceKey: 501 },
      data: { AllowBorrow: false },
    });
    expect(tx.conditionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ResourceKey: 501,
          LoggedBy: 11,
          Condition: 'Normal',
          Notes: 'Awaiting calibration',
        }),
      }),
    );
  });

  it('marks missing equipment unavailable and records its condition', async () => {
    const { service, prisma, tx } = managementHarness();
    prisma.itemIndiv.findUnique.mockResolvedValue(
      unitRow({
        Resource: {
          ...unitRow().Resource,
          ResourceStatus: 'Missing',
          AllowBorrow: false,
          CurrentCondition: { Condition: 'Missing', Notes: 'Lost' },
        },
      }),
    );

    await service.setUnitCondition(user(), {
      resourceKey: 501,
      condition: 'Missing',
      note: 'Lost during field work',
    });

    expect(tx.conditionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          Condition: 'Missing',
          Notes: 'Lost during field work',
        }),
      }),
    );
    expect(tx.resourceInfo.update).toHaveBeenCalledWith({
      where: { ResourceKey: 501 },
      data: expect.objectContaining({
        ConditionKey: 900,
        ResourceStatus: 'Missing',
        AllowBorrow: false,
      }),
    });
  });

  it('returns a typed not-found error when a managed type does not exist', async () => {
    const { service, prisma } = managementHarness();
    prisma.itemInfo.findUnique.mockResolvedValue(null);

    await expect(service.getManagedItemById(user(), 404)).rejects.toMatchObject(
      {
        businessCode: 'ITEM_TYPE_NOT_FOUND',
      },
    );
  });

  /*
  it('keeps the category gap explicit instead of returning fabricated filters', () => {
    const service = new ItemService({} as never);

    expect(() => service.listCategories()).toThrow(
      expect.objectContaining({ businessCode: 'NOT_IMPLEMENTED' }),
    );
  });
  */
});

describe('Module 5 borrower availability and catalogue queries', () => {
  it('reports live availability from the aggregate query', async () => {
    // The counting itself is SQL (item.service getAvailability); this pins the
    // mapping: a date only when nothing is free.
    const queryRaw = jest.fn();
    const service = new ItemService({ $queryRaw: queryRaw } as never);

    queryRaw.mockResolvedValueOnce([
      { found: true, total: 3, available: 1, readyAt: new Date('2026-09-22T00:00:00Z') },
    ]);
    await expect(service.getAvailability(7)).resolves.toEqual({
      availableUnits: 1,
      totalUnits: 3,
      nextAvailableAt: null,
    });

    queryRaw.mockResolvedValueOnce([
      { found: true, total: 2, available: 0, readyAt: new Date('2026-09-22T00:00:00Z') },
    ]);
    await expect(service.getAvailability(7)).resolves.toEqual({
      availableUnits: 0,
      totalUnits: 2,
      nextAvailableAt: '2026-09-22T00:00:00.000Z',
    });
  });

  it('returns ITEM_NOT_FOUND instead of leaking a database null', async () => {
    const prisma = {
      itemInfo: { findUnique: jest.fn().mockResolvedValue(null) },
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ found: false, total: 0, available: 0, readyAt: null }]),
    };
    const service = new ItemService(prisma as never);

    await expect(service.getAvailability(999)).rejects.toMatchObject({
      businessCode: 'ITEM_NOT_FOUND',
    });
    await expect(service.getById({ accountKey: 1 } as never, 999)).rejects.toBeInstanceOf(BusinessError);
  });

  /*
  it('keeps the decommission workflow as an explicit typed partial contract', async () => {
    const service = Object.create(
      InspectionService.prototype,
    ) as InspectionService;
    const scope = {
      assertResourceInScope: jest.fn().mockResolvedValue(undefined),
    };
    (service as unknown as { scope: typeof scope }).scope = scope;

    await expect(
      service.proposeDecommission(user(), {
        resourceKey: 501,
        reason: 'Beyond economical repair',
      }),
    ).rejects.toMatchObject({
      businessCode: 'NOT_IMPLEMENTED',
      details: expect.objectContaining({ missing: expect.any(Array) }),
    });
    expect(scope.assertResourceInScope).toHaveBeenCalledWith(user(), 501);
  });
  */
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
    expect(tx.itemIndiv.create).toHaveBeenCalledTimes(3);
    const serials = tx.itemIndiv.create.mock.calls.map(
      (call: unknown[]) => (call[0] as { data: { ItemID: string } }).data.ItemID,
    );
    expect(new Set(serials).size).toBe(serials.length);
  });

  // This used to assert SERIAL_ALREADY_IN_USE, which is the audit #8 bug
  // itself: numbering restarted at 1, so the second delivery of jumper wires
  // collided with the first and could never be registered.
  it('continues T0 numbering past the units already registered', async () => {
    const { service, prisma, tx } = managementHarness();
    prisma.itemInfo.findUnique.mockResolvedValue({
      ItemKey: 10,
      ItemName: 'Jumper Wire',
    });
    prisma.borrowRule.findFirst.mockResolvedValue({ BorrowRuleKey: 20 });
    prisma.itemIndiv.findMany.mockResolvedValueOnce([
      { ItemID: 'JUMPER-WIRE-10-1' },
      { ItemID: 'JUMPER-WIRE-10-2' },
    ]);
    tx.resourceInfo.create
      .mockResolvedValueOnce({ ResourceKey: 811 })
      .mockResolvedValueOnce({ ResourceKey: 812 });

    await service.createItemUnits(user(), {
      itemKey: 10,
      manageGroupKey: 8,
      tier: 'T0',
      quantity: 2,
      prepDays: 0,
      lendable: true,
    });

    const serials = tx.itemIndiv.create.mock.calls.map(
      (call: unknown[]) => (call[0] as { data: { ItemID: string } }).data.ItemID,
    );
    expect(serials).toEqual(['JUMPER-WIRE-10-3', 'JUMPER-WIRE-10-4']);
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
    // No units of this type yet: numbering starts at 1.
    prisma.itemIndiv.findMany.mockResolvedValueOnce([]);
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

describe('Department isolation — staff scope checks (Audit #17 / FR-AUTH-05)', () => {
  it('rejects createItemUnits from an unauthorized department (FR-AUTH-05)', async () => {
    const { service, scope } = managementHarness();
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
      Items: [],
      _count: { Items: 5 },
    });

    await expect(
      service.getManagedItemById(user(), 50),
    ).rejects.toMatchObject({
      businessCode: 'OUT_OF_MANAGEMENT_SCOPE',
    });
  });
});
