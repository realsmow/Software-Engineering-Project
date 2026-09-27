import type { TrpcUser } from '../../src/trpc/context';
import { ItemManagementService } from '../../src/item/item.management.service';
import { roomOutput } from '../../src/item/item.schema';
import { withOutputContracts } from '../fixtures/output-contracts';

function objectContaining(value: Record<string, unknown>): unknown {
  return expect.objectContaining(value);
}

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
    eligibility: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
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
    $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
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
    service: withOutputContracts(
      new ItemManagementService(
        prisma as never,
        scope as never,
        imageService as never,
        audit as never,
        {} as never,
      ),
      { createRoom: roomOutput },
    ),
    prisma,
    tx,
    scope,
    imageService,
    audit,
  };
}

describe('Dynamic room eligibility after item.createRoom', () => {
  it('creates a room with a T3 resource and verifies the returned tier', async () => {
    const { service, prisma, tx } = managementHarness();
    prisma.borrowRule.findFirst.mockResolvedValue({ BorrowRuleKey: 23 });
    prisma.roomInfo.findUnique.mockResolvedValue({
      RoomKey: 70,
      RoomName: 'Electronics Lab',
      RoomDesc: 'Bench laboratory',
      RoomLocation: 'Engineering building 3',
      Capacity: 24,
      ImageURL: null,
      CreditWeight: 0,
      OpenTime: 420,
      CloseTime: 1080,
      BreakStart: null,
      BreakEnd: null,
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
      Capacity: 24,
      ImageURL: null,
      CreditWeight: 0,
      OpenTime: 420,
      CloseTime: 1080,
      BreakStart: null,
      BreakEnd: null,
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
      objectContaining({
        data: objectContaining({
          AllowBorrow: true,
          ResourceType: 'Room',
          BorrowRule: 23,
          BufferTime: 0,
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
      Capacity: 24,
      ImageURL: null,
      CreditWeight: 0,
      OpenTime: 420,
      CloseTime: 1080,
      BreakStart: null,
      BreakEnd: null,
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
      objectContaining({
        data: objectContaining({ AllowBorrow: false }),
      }),
    );
  });
});
