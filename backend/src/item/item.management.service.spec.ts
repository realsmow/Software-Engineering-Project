import { ItemManagementService } from './item.management.service';
import { eligibilityTargetInput, setEligibilityInput } from './item.schema';
import { StaffScopeService } from '../common/authority/staff-scope.service';
import type { PrismaService } from '../prisma.service';
import type { TrpcUser } from '../trpc/context';

/**
 * Eligibility rules for rooms.
 *
 * Borrowing is fail-closed (EligibilityService refuses a resource with no
 * rules), and a room made by `item.createRoom` starts with none, so this path
 * is the only thing that makes a new room bookable at all. The scope check is
 * the real StaffScopeService over a fake table, not a mock of it: the point is
 * that a staff member cannot open another department's room.
 */

function user(overrides: Partial<TrpcUser> = {}): TrpcUser {
  return {
    accountKey: 4,
    role: 'staff',
    facultyKey: null,
    creditScore: 100,
    ...overrides,
  };
}

const MY_GROUP = 3;
const OTHER_GROUP = 5;

// RoomKey and ResourceKey differ on purpose, so a mix-up between the two shows.
const MY_ROOM = { RoomKey: 1, ResourceKey: 38, ManagedBy: MY_GROUP };
const OTHER_ROOM = { RoomKey: 7, ResourceKey: 90, ManagedBy: OTHER_GROUP };
const ROOMS = [MY_ROOM, OTHER_ROOM];

const GROUP_NAMES: Record<number, string> = {
  [MY_GROUP]: 'Electrical Engineering',
  [OTHER_GROUP]: 'Chemistry',
};
const ROLE_NAMES: Record<number, string> = { 1: 'Student', 2: 'Lecturer' };

interface Row {
  ResourceKey: number;
  GroupKey: number;
  RoleKey: number;
}

function harness(options: { rows?: Row[]; unitsOfType?: number[] } = {}) {
  let table: Row[] = [...(options.rows ?? [])];
  const inKeys = (where: { ResourceKey: { in: number[] } }) =>
    where.ResourceKey.in;

  const eligibility = {
    findMany: jest.fn(
      ({ where }: { where: { ResourceKey: { in: number[] } } }) =>
        Promise.resolve(
          table
            .filter((row) => inKeys(where).includes(row.ResourceKey))
            .map((row) => ({
              GroupKey: row.GroupKey,
              RoleKey: row.RoleKey,
              Role: { AuthorityName: ROLE_NAMES[row.RoleKey] },
              Group: {
                Branch: { BranchName: GROUP_NAMES[row.GroupKey] },
                Club: null,
              },
            })),
        ),
    ),
    deleteMany: jest.fn(
      ({ where }: { where: { ResourceKey: { in: number[] } } }) => {
        const before = table.length;
        table = table.filter((row) => !inKeys(where).includes(row.ResourceKey));
        return Promise.resolve({ count: before - table.length });
      },
    ),
    createMany: jest.fn(({ data }: { data: Row[] }) => {
      table.push(...data);
      return Promise.resolve({ count: data.length });
    }),
  };

  const prisma = {
    authority: {
      findMany: jest.fn().mockResolvedValue([{ ManageGroupKey: MY_GROUP }]),
    },
    roomInfo: {
      findUnique: jest.fn(({ where }: { where: { RoomKey: number } }) => {
        const room = ROOMS.find((r) => r.RoomKey === where.RoomKey);
        return Promise.resolve(room ? { ResourceKey: room.ResourceKey } : null);
      }),
    },
    resourceInfo: {
      findUnique: jest.fn(({ where }: { where: { ResourceKey: number } }) => {
        const room = ROOMS.find((r) => r.ResourceKey === where.ResourceKey);
        return Promise.resolve(room ? { ManagedBy: room.ManagedBy } : null);
      }),
    },
    itemIndiv: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (options.unitsOfType ?? []).map((ResourceKey) => ({ ResourceKey })),
        ),
    },
    itemInfo: { findUnique: jest.fn() },
    eligibility,
    $transaction: jest.fn(
      (work: (tx: { eligibility: typeof eligibility }) => unknown) =>
        work({ eligibility }),
    ),
  };

  const scope = new StaffScopeService(prisma as unknown as PrismaService);
  const service = new ItemManagementService(
    prisma as never,
    scope,
    {} as never,
  );

  return { service, prisma, eligibility, rows: () => table };
}

const STUDENTS = { groupKey: MY_GROUP, authorityRoleKey: 1 };
const LECTURERS = { groupKey: MY_GROUP, authorityRoleKey: 2 };

describe('room eligibility', () => {
  it('writes the rules onto the room resource and reads them back', async () => {
    const { service, rows } = harness();

    const saved = await service.setEligibility(user(), {
      roomKey: MY_ROOM.RoomKey,
      rules: [STUDENTS, LECTURERS],
    });

    // Keyed on the ResourceKey EligibilityService checks, not the RoomKey.
    expect(rows()).toEqual([
      { ResourceKey: 38, GroupKey: MY_GROUP, RoleKey: 1 },
      { ResourceKey: 38, GroupKey: MY_GROUP, RoleKey: 2 },
    ]);
    const expected = [
      {
        groupKey: MY_GROUP,
        groupName: 'Electrical Engineering',
        authorityRoleKey: 1,
        authorityRoleName: 'Student',
        appliesToUnits: 1,
      },
      {
        groupKey: MY_GROUP,
        groupName: 'Electrical Engineering',
        authorityRoleKey: 2,
        authorityRoleName: 'Lecturer',
        appliesToUnits: 1,
      },
    ];
    expect(saved).toEqual(expected);
    await expect(
      service.listEligibility(user(), { roomKey: MY_ROOM.RoomKey }),
    ).resolves.toEqual(expected);
  });

  it('replaces the whole set for that room and leaves other resources alone', async () => {
    const { service, rows } = harness({
      rows: [
        { ResourceKey: 38, GroupKey: MY_GROUP, RoleKey: 1 },
        { ResourceKey: 90, GroupKey: OTHER_GROUP, RoleKey: 1 },
      ],
    });

    await service.setEligibility(user(), {
      roomKey: MY_ROOM.RoomKey,
      rules: [LECTURERS],
    });

    expect(rows()).toEqual([
      { ResourceKey: 90, GroupKey: OTHER_GROUP, RoleKey: 1 },
      { ResourceKey: 38, GroupKey: MY_GROUP, RoleKey: 2 },
    ]);
  });

  it('closes the room to everyone when sent an empty array', async () => {
    const { service, eligibility, rows } = harness({
      rows: [
        { ResourceKey: 38, GroupKey: MY_GROUP, RoleKey: 1 },
        { ResourceKey: 38, GroupKey: MY_GROUP, RoleKey: 2 },
      ],
    });

    await expect(
      service.setEligibility(user(), { roomKey: MY_ROOM.RoomKey, rules: [] }),
    ).resolves.toEqual([]);

    expect(rows()).toEqual([]);
    expect(eligibility.createMany).not.toHaveBeenCalled();
    await expect(
      service.listEligibility(user(), { roomKey: MY_ROOM.RoomKey }),
    ).resolves.toEqual([]);
  });

  it('refuses to write rules for another department room, touching nothing', async () => {
    const other = { ResourceKey: 90, GroupKey: OTHER_GROUP, RoleKey: 1 };
    const { service, eligibility, rows } = harness({ rows: [other] });

    await expect(
      service.setEligibility(user(), {
        roomKey: OTHER_ROOM.RoomKey,
        rules: [STUDENTS],
      }),
    ).rejects.toMatchObject({ businessCode: 'OUT_OF_MANAGEMENT_SCOPE' });

    expect(eligibility.deleteMany).not.toHaveBeenCalled();
    expect(eligibility.createMany).not.toHaveBeenCalled();
    expect(rows()).toEqual([other]);
  });

  it('refuses to read rules for another department room', async () => {
    const { service, eligibility } = harness({
      rows: [{ ResourceKey: 90, GroupKey: OTHER_GROUP, RoleKey: 1 }],
    });

    await expect(
      service.listEligibility(user(), { roomKey: OTHER_ROOM.RoomKey }),
    ).rejects.toMatchObject({ businessCode: 'OUT_OF_MANAGEMENT_SCOPE' });
    expect(eligibility.findMany).not.toHaveBeenCalled();
  });

  it('lets an admin set rules on any department room', async () => {
    const { service, rows } = harness();

    await service.setEligibility(user({ role: 'admin' }), {
      roomKey: OTHER_ROOM.RoomKey,
      rules: [{ groupKey: OTHER_GROUP, authorityRoleKey: 1 }],
    });

    expect(rows()).toEqual([
      { ResourceKey: 90, GroupKey: OTHER_GROUP, RoleKey: 1 },
    ]);
  });

  it('reports an unknown room as ROOM_NOT_FOUND', async () => {
    const { service } = harness();

    await expect(
      service.listEligibility(user(), { roomKey: 999 }),
    ).rejects.toMatchObject({
      businessCode: 'ROOM_NOT_FOUND',
      details: { roomKey: 999 },
    });
  });

  it('still fans an item type rule out across its in-scope units', async () => {
    const { service, prisma, rows } = harness({ unitsOfType: [501, 502] });

    const saved = await service.setEligibility(user(), {
      itemKey: 4,
      rules: [STUDENTS],
    });

    expect(rows()).toEqual([
      { ResourceKey: 501, GroupKey: MY_GROUP, RoleKey: 1 },
      { ResourceKey: 502, GroupKey: MY_GROUP, RoleKey: 1 },
    ]);
    expect(saved).toEqual([
      expect.objectContaining({ authorityRoleKey: 1, appliesToUnits: 2 }),
    ]);
    expect(prisma.roomInfo.findUnique).not.toHaveBeenCalled();
  });
});

describe('eligibility input', () => {
  it('takes an item type or a room', () => {
    expect(eligibilityTargetInput.safeParse({ itemKey: 4 }).success).toBe(true);
    expect(eligibilityTargetInput.safeParse({ roomKey: 1 }).success).toBe(true);
    expect(
      setEligibilityInput.safeParse({ roomKey: 1, rules: [STUDENTS] }).success,
    ).toBe(true);
  });

  it('refuses both at once rather than silently picking one', () => {
    expect(
      eligibilityTargetInput.safeParse({ itemKey: 4, roomKey: 1 }).success,
    ).toBe(false);
    expect(
      setEligibilityInput.safeParse({ itemKey: 4, roomKey: 1, rules: [] })
        .success,
    ).toBe(false);
  });

  it('refuses neither', () => {
    expect(eligibilityTargetInput.safeParse({}).success).toBe(false);
    expect(setEligibilityInput.safeParse({ rules: [] }).success).toBe(false);
  });
});
