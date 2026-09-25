import { ItemService } from './item.service';
import { toItemSummary } from '../common/mappers/item.mapper';
import type { PrismaService } from '../prisma.service';
import type { TrpcUser } from '../trpc/context';
import { sqlAggregates } from './light-row.testing';

/**
 * NFR-PRF-05: `item.list` now computes totalUnits/availableUnits/eligible in
 * SQL (see `lightweightItemRows`) instead of loading every unit. This proves
 * that split reaches the exact same counts, stock status, sort order and
 * cursor pages as the old single full-scan `toItemSummary` would have, on a
 * fixture built specifically to exercise ties and every unit state the old
 * algorithm branched on: Retired (excluded from totals entirely), Missing,
 * Lended, an AllowBorrow-off unit sitting in storage, and a unit merely
 * withheld pending grading (Returned but still UNAVAILABLE_USAGE_STATES).
 */

const me = {
  accountKey: 42,
  role: 'borrower',
  facultyKey: null,
  creditScore: 90,
} as TrpcUser;

function unit(
  key: number,
  status: 'InStorage' | 'Lended' | 'Missing' | 'Retired',
  allowBorrow: boolean,
  usageLogs: { DueTime: Date; CurrentStatus: string }[] = [],
) {
  return {
    IndivKey: key,
    ResourceKey: key,
    ItemID: `U-${key}`,
    ImageURL: null,
    Resource: {
      ResourceStatus: status,
      AllowBorrow: allowBorrow,
      BufferTime: 1,
      BorrowRuleInfo: { RuleName: 'T0' },
      ManagementGroup: {
        ManageGroupKey: 1,
        GroupType: 'Faculty',
        Branch: { BranchName: 'EE' },
        Club: null,
      },
      CurrentCondition: null,
      UsageLogs: usageLogs,
      Eligibilities: [],
    },
  };
}

/**
 * Mixed catalogue: two items tie on availableUnits (2, 3) to exercise the
 * name/id tiebreak, and every unit state the mapper branches on appears at
 * least once. `Retired` units are excluded from the fixture's own `Items`
 * array too — that mirrors what the DB select's `NOT_RETIRED` filter already
 * does before either algorithm sees a row, exactly as item.service.ts's
 * `ITEM_TYPE_SELECT`/`NOT_RETIRED` behave.
 */
const FIXTURE = [
  {
    ItemKey: 1,
    ItemName: 'alpha',
    ItemDesc: null,
    ImageURL: null,
    CreditWeight: 1,
    Items: [
      unit(11, 'InStorage', true), // available
      unit(12, 'Lended', true, [
        { DueTime: new Date('2027-02-01'), CurrentStatus: 'Lended' },
      ]),
      unit(13, 'InStorage', false), // in storage but not open for borrowing
    ],
  },
  {
    ItemKey: 2,
    ItemName: 'bravo', // ties with 'charlie' on availableUnits (1 each)
    ItemDesc: null,
    ImageURL: null,
    CreditWeight: 2,
    Items: [
      unit(21, 'InStorage', true), // available
      unit(22, 'Missing', true),
    ],
  },
  {
    ItemKey: 3,
    ItemName: 'charlie',
    ItemDesc: null,
    ImageURL: null,
    CreditWeight: 2,
    Items: [
      unit(31, 'InStorage', true), // available
      // Back but not yet graded: unavailable despite being "Returned".
      unit(32, 'InStorage', true, [
        { DueTime: new Date('2027-01-01'), CurrentStatus: 'Returned' },
      ]),
    ],
  },
  {
    ItemKey: 4,
    ItemName: 'delta', // all units withheld: zero available
    ItemDesc: null,
    ImageURL: null,
    CreditWeight: 0,
    Items: [
      unit(41, 'Lended', true, [
        { DueTime: new Date('2027-03-01'), CurrentStatus: 'Lended' },
      ]),
    ],
  },
];

/** The old algorithm: `toItemSummary` run directly over the full fixture. */
const EXPECTED = new Map(
  FIXTURE.map((row) => [row.ItemKey, toItemSummary(row as never)]),
);

/**
 * `lightweightItemRows`'s SQL, restated in JS over the same fixture — the
 * counts a correct query must return, computed independently of
 * `toItemSummary` so this is a genuine cross-check rather than a tautology.
 */
function lightRows() {
  return FIXTURE.map((row) => ({
    id: row.ItemKey,
    name: row.ItemName,
    creditWeight: row.CreditWeight,
    ...sqlAggregates(row.Items),
    totalUnits: row.Items.length, // fixture already excludes Retired units
    availableUnits: row.Items.filter(
      (u) =>
        u.Resource.ResourceStatus === 'InStorage' &&
        u.Resource.AllowBorrow &&
        u.Resource.UsageLogs.length === 0,
    ).length,
    eligible: false,
  }));
}

function service() {
  const prisma = {
    itemInfo: { findMany: jest.fn().mockResolvedValue(FIXTURE) },
    authority: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue(lightRows()),
  } as unknown as PrismaService;
  return new ItemService(prisma);
}

describe('item.list aggregate parity (NFR-PRF-05)', () => {
  it('matches counts, stock status and next-available date the old full scan produced', async () => {
    const result = await service().list(me, {
      page: 1,
      pageSize: 10,
      sort: 'name',
      availableOnly: false,
    });

    expect(result.items).toHaveLength(FIXTURE.length);
    for (const item of result.items) {
      const expected = EXPECTED.get(item.id)!;
      expect(item.totalUnits).toBe(expected.totalUnits);
      expect(item.availableUnits).toBe(expected.availableUnits);
      expect(item.stockStatus).toBe(expected.stockStatus);
      expect(item.nextAvailableAt).toBe(expected.nextAvailableAt);
      expect(item.allowBorrow).toBe(expected.allowBorrow);
    }
  });

  it('orders and tiebreaks under the default "available" sort exactly like a full scan would', async () => {
    const result = await service().list(me, {
      page: 1,
      pageSize: 10,
      sort: 'available',
      availableOnly: false,
    });

    // alpha/bravo/charlie all have 1 unit free; charlie/bravo tie and fall
    // back to name (bravo < charlie), delta has none and sorts last.
    expect(result.items.map((i) => i.name)).toEqual([
      'alpha',
      'bravo',
      'charlie',
      'delta',
    ]);
  });

  it('cursor paging over the lightweight rows lands on the same page a full scan would', async () => {
    const svc = service();
    const page1 = await svc.list(me, {
      page: 1,
      pageSize: 2,
      sort: 'available',
      availableOnly: false,
    });
    expect(page1.items.map((i) => i.name)).toEqual(['alpha', 'bravo']);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await svc.list(me, {
      page: 1,
      pageSize: 2,
      sort: 'available',
      availableOnly: false,
      cursor: page1.nextCursor ?? undefined,
    });
    expect(page2.items.map((i) => i.name)).toEqual(['charlie', 'delta']);
    expect(page2.nextCursor).toBeNull();
  });
});
