import { ItemManagementService } from './item.management.service';
import type { PrismaService } from '../prisma.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { ImageService } from '../image/image.service';
import type { TrpcUser } from '../trpc/context';

/**
 * A unit added to a type staff have already opened must be borrowable by the
 * same people as its siblings. Rules hang off each unit, not the type, so
 * before this the new unit arrived with none and was closed to everyone while
 * the editor went on showing the type's rules as if they covered it.
 */
const staff = { accountKey: 4, role: 'staff', facultyKey: null, creditScore: 100 } as TrpcUser;

function harness(inherited: { GroupKey: number; RoleKey: number }[]) {
  let nextKey = 100;
  const tx = {
    eligibility: {
      findMany: jest.fn().mockResolvedValue(inherited),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    resourceInfo: {
      create: jest.fn(() => Promise.resolve({ ResourceKey: nextKey++ })),
    },
    itemIndiv: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    itemInfo: { findUnique: jest.fn().mockResolvedValue({ ItemKey: 9, ItemName: 'LCR meter' }) },
    borrowRule: { findFirst: jest.fn().mockResolvedValue({ BorrowRuleKey: 1 }) },
    itemIndiv: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const scope = { assertGroupInScope: jest.fn() } as unknown as StaffScopeService;
  const images = { toStoredUrl: (url?: string) => url ?? null } as unknown as ImageService;
  return { service: new ItemManagementService(prisma, scope, images), tx };
}

const input = {
  itemKey: 9,
  manageGroupKey: 3,
  tier: 'T0' as const,
  quantity: 2,
  prepDays: 0,
  lendable: true,
};

it("gives new units the rules their siblings in this department already have", async () => {
  const t = harness([
    { GroupKey: 3, RoleKey: 1 },
    { GroupKey: 3, RoleKey: 2 },
  ]);
  await t.service.createItemUnits(staff, input);

  const rows = t.tx.eligibility.createMany.mock.calls[0][0].data;
  expect(rows).toHaveLength(4);
  expect(rows).toEqual(
    expect.arrayContaining([
      { ResourceKey: 100, GroupKey: 3, RoleKey: 1 },
      { ResourceKey: 101, GroupKey: 3, RoleKey: 2 },
    ]),
  );
});

it('reads only this type in this department, never another department\'s rules', async () => {
  const t = harness([]);
  await t.service.createItemUnits(staff, input);

  expect(t.tx.eligibility.findMany.mock.calls[0][0].where).toEqual({
    Resource: { ManagedBy: 3, Item: { is: { ItemKey: 9 } } },
  });
});

it('leaves a type nobody has opened closed', async () => {
  const t = harness([]);
  await t.service.createItemUnits(staff, input);
  expect(t.tx.eligibility.createMany).not.toHaveBeenCalled();
});
