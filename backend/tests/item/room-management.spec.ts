import { PrismaService } from '../../src/prisma.service';
import type { ResourceInfo } from '../../src/generated/prisma/client';
import { ItemService } from '../../src/item/item.service';
import { StaffScopeService } from '../../src/common/authority/staff-scope.service';
import {
  listManagedRoomsInput,
  paginatedManagedRooms,
  roomSummary,
  roomOutput,
} from '../../src/item/item.schema';
import {
  historyFixture,
  inHistoryFixture,
  requireIsolatedDatabase,
  transactionClient,
} from '../fixtures/borrower-history';
import type { TrpcUser } from '../../src/trpc/context';
import { ItemManagementService } from '../../src/item/item.management.service';
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

// Real service/adapter assertions share this module's suite; setup is scoped.
describe('Persisted business records', () => {
  describe('FR-AUTH-05 / FR-EQP-01: staff room reads and borrower room detail', () => {
    let prisma: PrismaService;
    beforeAll(async () => {
      requireIsolatedDatabase();
      prisma = new PrismaService();
      await prisma.$connect();
    });
    afterAll(async () => prisma?.$disconnect());

    function service(client: PrismaService) {
      return new ItemManagementService(
        client,
        new StaffScopeService(client),
        { toPublicUrl: (url: string | null) => url } as never,
        { record: jest.fn() } as never,
        {} as never,
      );
    }

    it.each([true, false])(
      'filters managed rooms by lendable=%s and location within the caller scope',
      async (lendable) => {
        await inHistoryFixture(prisma, async (tx) => {
          const own = await historyFixture(tx),
            foreign = await historyFixture(tx);
          const rule = await tx.borrowRule.create({ data: { RuleName: 'T3' } });
          const rooms: ResourceInfo[] = [];
          for (const [f, allowed] of [
            [own, true],
            [own, false],
            [foreign, lendable],
          ] as const) {
            rooms.push(
              await tx.resourceInfo.create({
                data: {
                  ManagedBy: f.group.ManageGroupKey,
                  BorrowRule: rule.BorrowRuleKey,
                  BufferTime: 0,
                  ResourceType: 'Room',
                  ResourceStatus: 'InStorage',
                  AllowBorrow: allowed,
                  Room: {
                    create: {
                      RoomName: 'QA room',
                      RoomLocation: 'QA building',
                      CreditWeight: 1,
                    },
                  },
                },
              }),
            );
          }
          const output = paginatedManagedRooms
            .strict()
            .parse(
              await service(transactionClient(tx)).listManagedRooms(
                own.decider,
                listManagedRoomsInput.parse({ q: 'QA BUILDING', lendable }),
              ),
            );
          expect(output.total).toBe(1);
          expect(output.items[0]).toMatchObject({
            resourceKey: rooms[lendable ? 0 : 1].ResourceKey,
            capacity: null,
            tier: 'T3',
            lendable,
          });
        });
      },
    );

    it('returns a real room with unknown capacity and makes a retired room unavailable through its old ID', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await historyFixture(tx);
        const rule = await tx.borrowRule.create({ data: { RuleName: 'T3' } });
        const room = await tx.roomInfo.create({
          data: {
            RoomName: 'QA detail room',
            CreditWeight: 1,
            Resource: {
              create: {
                ManagedBy: f.group.ManageGroupKey,
                BorrowRule: rule.BorrowRuleKey,
                BufferTime: 0,
                ResourceType: 'Room',
                ResourceStatus: 'InStorage',
                AllowBorrow: true,
              },
            },
          },
        });
        const catalog = new ItemService(transactionClient(tx));
        expect(
          roomSummary.strict().parse(await catalog.getRoomById(room.RoomKey)),
        ).toMatchObject({
          id: room.RoomKey,
          name: 'QA detail room',
          capacity: null,
          bookable: true,
          tier: 'T3',
        });
        await tx.resourceInfo.update({
          where: { ResourceKey: room.ResourceKey },
          data: { ResourceStatus: 'Retired', AllowBorrow: false },
        });
        await expect(catalog.getRoomById(room.RoomKey)).rejects.toMatchObject({
          businessCode: 'ROOM_NOT_FOUND',
        });
      });
    });
  });
});
