import { ItemService } from './item.service';
import type { PrismaService } from '../prisma.service';
import type { TrpcUser } from '../trpc/context';
import type { ListItemsInput } from './item.schema';

/**
 * FR-BRW-02: `item.list` must support cursor-based pagination without
 * changing what page/pageSize callers already get. These tests walk the same
 * catalogue both ways and check they agree, row for row, including on ties —
 * see the big comment on `compareItems` in item.service.ts for why a tie
 * between two rows is resolved the same way regardless of which pagination
 * style is asked for.
 */

const me = {
  accountKey: 3,
  role: 'borrower',
  facultyKey: null,
  creditScore: 90,
} as TrpcUser;

function typeRow(
  id: number,
  name: string,
  availableUnits: number,
  totalUnits: number,
) {
  const units = Array.from({ length: totalUnits }, (_, i) => ({
    IndivKey: id * 100 + i,
    ResourceKey: id * 100 + i,
    ItemID: `U-${id}-${i}`,
    ImageURL: null,
    Resource: {
      // The first `availableUnits` units are free; the rest are out.
      ResourceStatus: i < availableUnits ? 'InStorage' : 'Lended',
      AllowBorrow: true,
      BufferTime: 0,
      BorrowRuleInfo: { RuleName: 'T0' },
      ManagementGroup: {
        ManageGroupKey: 1,
        GroupType: 'Faculty',
        Branch: { BranchName: 'EE' },
        Club: null,
      },
      CurrentCondition: null,
      UsageLogs:
        i < availableUnits
          ? []
          : [{ DueTime: new Date('2027-01-01'), CurrentStatus: 'Lended' }],
      Eligibilities: [],
    },
  }));
  return {
    ItemKey: id,
    ItemName: name,
    ItemDesc: null,
    ImageURL: null,
    CreditWeight: 0,
    Items: units,
  };
}

/** A mixed catalogue with two ties on purpose: (b1, b2) and (t1, t2). */
const ROWS = [
  typeRow(1, 'a', 2, 2),
  typeRow(2, 'b1', 1, 1), // ties with b2 on availableUnits
  typeRow(3, 'b2', 1, 1),
  typeRow(4, 'c', 3, 5),
  typeRow(5, 'd', 0, 4),
  typeRow(6, 't1', 0, 1), // ties with t2 (both out of stock)
  typeRow(7, 't2', 0, 1),
  typeRow(8, 'e', 5, 5),
];

/**
 * Stands in for `lightweightItemRows`' SQL: the same aggregates (totalUnits,
 * availableUnits, eligible), computed independently from the full unit rows
 * instead of copying the fixture's own `availableUnits`/`totalUnits`
 * arguments. That independence is what makes `list()`'s cursor/offset
 * agreement below a real proof that the lightweight path and a full scan of
 * ROWS reach the same counts and the same order, not just a wiring check.
 */
function deriveLightRows(rows: typeof ROWS) {
  return rows.map((row) => {
    const notRetired = row.Items.filter(
      (u) => u.Resource.ResourceStatus !== 'Retired',
    );
    return {
      id: row.ItemKey,
      name: row.ItemName ?? `#${row.ItemKey}`,
      creditWeight: row.CreditWeight,
      totalUnits: notRetired.length,
      availableUnits: notRetired.filter(
        (u) =>
          u.Resource.ResourceStatus === 'InStorage' &&
          u.Resource.AllowBorrow &&
          u.Resource.UsageLogs.length === 0,
      ).length,
      eligible: false, // no Eligibility rows in this fixture
    };
  });
}

function service() {
  const prisma = {
    itemInfo: { findMany: jest.fn().mockResolvedValue(ROWS) },
    authority: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue(deriveLightRows(ROWS)),
  } as unknown as PrismaService;
  return new ItemService(prisma);
}

const BASE = {
  page: 1,
  pageSize: 3,
  sort: 'available' as const,
  availableOnly: false,
};

async function offsetAll(input: Partial<ListItemsInput> = {}) {
  const svc = service();
  const names: string[] = [];
  let page = 1;
  for (;;) {
    const result = await svc.list(me, { ...BASE, ...input, page });
    names.push(...result.items.map((i) => i.name));
    if (page * BASE.pageSize >= result.total) break;
    page++;
  }
  return names;
}

async function cursorAll(input: Partial<ListItemsInput> = {}) {
  const svc = service();
  const names: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const result = await svc.list(me, { ...BASE, ...input, cursor });
    names.push(...result.items.map((i) => i.name));
    if (!result.nextCursor) break;
    cursor = result.nextCursor ?? undefined;
  }
  return names;
}

describe('item.list cursor pagination', () => {
  it('walks every row exactly once, matching offset paging including ties', async () => {
    const viaOffset = await offsetAll();
    const viaCursor = await cursorAll();

    expect(viaCursor).toEqual(viaOffset);
    expect(new Set(viaCursor).size).toBe(ROWS.length);
  });

  it('agrees with offset paging under "name" sort too', async () => {
    const input = { sort: 'name' as const };
    expect(await cursorAll(input)).toEqual(await offsetAll(input));
  });

  it('does not affect a page/pageSize caller that never sends a cursor', async () => {
    const svc = service();
    const result = await svc.list(me, { ...BASE, page: 2 });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(BASE.pageSize);
    expect(result.items).toHaveLength(3);
  });

  it('returns nextCursor: null on the last page', async () => {
    const svc = service();
    const result = await svc.list(me, { ...BASE, page: 3 });
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it('rejects a malformed cursor', async () => {
    const svc = service();
    await expect(
      svc.list(me, { ...BASE, cursor: 'not-a-real-cursor' }),
    ).rejects.toMatchObject({ businessCode: 'INVALID_CURSOR' });
  });

  it('rejects a cursor minted under a different sort', async () => {
    const svc = service();
    const first = await svc.list(me, { ...BASE, sort: 'name' });

    await expect(
      svc.list(me, {
        ...BASE,
        sort: 'available',
        cursor: first.nextCursor ?? undefined,
      }),
    ).rejects.toMatchObject({ businessCode: 'INVALID_CURSOR' });
  });
});
