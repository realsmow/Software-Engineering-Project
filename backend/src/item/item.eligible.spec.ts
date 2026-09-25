import { ItemService } from './item.service';
import { matchingRules } from '../common/authority/eligibility.service';
import type { PrismaService } from '../prisma.service';
import type { TrpcUser } from '../trpc/context';

/**
 * The catalogue used to list a type as "5 available" while every request for
 * it was refused NOT_ELIGIBLE. It now says, per caller, whether they may
 * borrow it at all, by the same comparison loan.create makes.
 */
const me = {
  accountKey: 3,
  role: 'borrower',
  facultyKey: null,
  creditScore: 90,
} as TrpcUser;

describe('matchingRules', () => {
  const held = [{ GroupKey: 3, RoleKey: 1 }];

  it('matches an exact (group, role) pair', () => {
    expect(matchingRules([{ GroupKey: 3, RoleKey: 1 }], held)).toHaveLength(1);
  });

  it('does not match the right group with the wrong role, or the reverse', () => {
    expect(
      matchingRules(
        [
          { GroupKey: 3, RoleKey: 2 },
          { GroupKey: 5, RoleKey: 1 },
        ],
        held,
      ),
    ).toEqual([]);
  });

  it('matches nothing when a resource has no rules at all', () => {
    expect(matchingRules([], held)).toEqual([]);
  });
});

function unit(key: number, rules: { GroupKey: number; RoleKey: number }[]) {
  return {
    IndivKey: key,
    ResourceKey: key,
    ItemID: `U-${key}`,
    ImageURL: null,
    Resource: {
      ResourceStatus: 'InStorage',
      AllowBorrow: true,
      BufferTime: 0,
      BorrowRuleInfo: { RuleName: 'T0' },
      ManagementGroup: {
        ManageGroupKey: 3,
        GroupType: 'Faculty',
        Branch: { BranchName: 'EE' },
        Club: null,
      },
      CurrentCondition: { Condition: 'Normal' },
      UsageLogs: [],
      Eligibilities: rules,
    },
  };
}

const TYPE_ROWS = [
  {
    ItemKey: 1,
    ItemName: 'Open to me',
    ItemDesc: null,
    ImageURL: null,
    CreditWeight: 0,
    Items: [unit(10, [{ GroupKey: 3, RoleKey: 1 }])],
  },
  {
    ItemKey: 2,
    ItemName: 'No rules',
    ItemDesc: null,
    ImageURL: null,
    CreditWeight: 0,
    Items: [unit(20, [])],
  },
  {
    ItemKey: 3,
    ItemName: 'Another department',
    ItemDesc: null,
    ImageURL: null,
    CreditWeight: 0,
    Items: [unit(30, [{ GroupKey: 9, RoleKey: 1 }])],
  },
];

/** Held pair (3, 1) — matches the mocked account's Authority row below. */
const HELD = [{ GroupKey: 3, RoleKey: 1 }];

/** `lightweightItemRows`'s SQL, stood in with the same logic run in JS. */
function lightRows() {
  return TYPE_ROWS.map((row) => ({
    id: row.ItemKey,
    name: row.ItemName,
    creditWeight: row.CreditWeight,
    totalUnits: row.Items.length,
    availableUnits: row.Items.filter(
      (u) =>
        u.Resource.ResourceStatus === 'InStorage' &&
        u.Resource.AllowBorrow &&
        u.Resource.UsageLogs.length === 0,
    ).length,
    eligible: row.Items.some((u) =>
      u.Resource.Eligibilities.some((el) =>
        HELD.some(
          (h) => h.GroupKey === el.GroupKey && h.RoleKey === el.RoleKey,
        ),
      ),
    ),
  }));
}

function service() {
  const prisma = {
    itemInfo: { findMany: jest.fn().mockResolvedValue(TYPE_ROWS) },
    authority: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ ManageGroupKey: 3, AuthorityRoleKey: 1 }]),
    },
    $queryRaw: jest.fn().mockResolvedValue(lightRows()),
  } as unknown as PrismaService;
  return new ItemService(prisma);
}

const page = { page: 1, pageSize: 10, sort: 'name' as const };

it('marks each type by whether the caller may borrow it', async () => {
  const result = await service().list(me, { ...page, availableOnly: false });
  const byName = Object.fromEntries(
    result.items.map((i) => [i.name, i.eligible]),
  );
  expect(byName).toEqual({
    'Open to me': true,
    'No rules': false,
    'Another department': false,
  });
});

it('leaves out what the caller cannot borrow when asked for available only', async () => {
  const result = await service().list(me, { ...page, availableOnly: true });
  expect(result.items.map((i) => i.name)).toEqual(['Open to me']);
});
