import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { UNAVAILABLE_USAGE_STATES } from '../common/usage/usage-states';
import {
  heldPairs,
  matchingRules,
  type GroupRole,
} from '../common/authority/eligibility.service';
import type { TrpcUser } from '../trpc/context';
import { BusinessError } from '../common/errors/business-error';
import {
  freeInWindowPredicate,
  toItemDetail,
  toItemSummary,
  toOwner,
  toRoomSummary,
  type ItemTypeRow,
} from '../common/mappers/item.mapper';
import { tryMapTier } from '../common/schemas/status.schema';
import {
  HOLDING_APPROVE_STATES,
  resourcesFreeInWindow,
} from '../common/booking/booking-window';
import {
  MAX_ROOM_BOOKING_SLOTS,
  ROOM_SLOT_MINUTES,
  dayWindow,
  markSlots,
  slotWindow,
  toRoomHours,
} from '../common/booking/room-slots';
import { toIso } from '../common/schemas/datetime.schema';
import { toPage, toSkipTake } from '../common/schemas/pagination.schema';
import type {
  ItemSummary,
  ListItemsInput,
  ListUnitsInput,
  ListRoomsInput,
  RoomAvailabilityInput,
} from './item.schema';

/**
 * Selects the loan currently holding a unit, and nothing else.
 *
 * `take: 1` with the status filter is load-bearing — the mapper reads the due
 * date from the first row, so widening this select silently starts reporting
 * due dates from loans that closed months ago.
 */
/**
 * FR-EQP-08: a retired resource disappears from the borrower catalogue
 * entirely - not merely marked unavailable, which would still count it in
 * `totalUnits`. Its row and history stay; only the borrower-facing queries in
 * this file apply this filter. Staff still see it via `item.listManagedUnits`.
 */
const NOT_RETIRED: Prisma.ResourceInfoWhereInput = {
  NOT: { ResourceStatus: 'Retired' },
};

const CURRENT_LOAN_SELECT = {
  // Every loan that keeps the unit off the shelf, not only one that is out:
  // a unit set aside for someone, or back and not yet graded, is no more
  // available than one in a borrower's bag. Staff inventory already counted
  // that way, and the borrower's catalogue did not, so the two screens showed
  // different numbers for the same shelf (audit #2). Still closed loans are
  // excluded, so no long-finished due date can leak through.
  where: { CurrentStatus: { in: UNAVAILABLE_USAGE_STATES } },
  orderBy: { DueTime: 'asc' },
  take: 1,
  select: { DueTime: true, CurrentStatus: true },
} as const;

/**
 * Full per-unit detail for one equipment type — everything `toItemDetail` /
 * `toItemSummary` read. Shared by `getById` and by `list`'s page hydration
 * (below) so the two never drift on what a unit carries.
 */
const ITEM_TYPE_SELECT = {
  ItemKey: true,
  ItemName: true,
  ItemDesc: true,
  ImageURL: true,
  CreditWeight: true,
  Items: {
    where: { Resource: NOT_RETIRED },
    select: {
      IndivKey: true,
      ResourceKey: true,
      ItemID: true,
      ImageURL: true,
      Resource: {
        select: {
          ResourceStatus: true,
          AllowBorrow: true,
          BufferTime: true,
          BorrowRuleInfo: { select: { RuleName: true } },
          ManagementGroup: {
            select: {
              ManageGroupKey: true,
              GroupType: true,
              Branch: { select: { BranchName: true } },
              Club: { select: { ClubName: true } },
            },
          },
          CurrentCondition: { select: { Condition: true } },
          UsageLogs: CURRENT_LOAN_SELECT,
          Eligibilities: { select: { GroupKey: true, RoleKey: true } },
        },
      },
    },
  },
} satisfies Prisma.ItemInfoSelect;

/** How long catalogue counts are shared between callers (see lightweightItemRows). */
const LIGHT_CACHE_MS = 5_000;

/** The aggregate row `lightweightItemRows` computes per equipment type. */
interface LightItemRow {
  id: number;
  name: string;
  creditWeight: number;
  totalUnits: number;
  availableUnits: number;
  borrowableUnits: number;
  /** Earliest due date plus prep days among units out on loan. */
  readyAt: Date | null;
  tier: string | null;
  eligible: boolean;
}

/**
 * States in which a unit is out with a date to come back (unitReadyAt): every
 * blocking state except Returned, which waits on grading and has no date.
 */
function onLoanStates() {
  return Prisma.join(
    UNAVAILABLE_USAGE_STATES.filter((s) => s !== 'Returned').map(
      (s) => Prisma.sql`${s}::"CurrentStatus"`,
    ),
  );
}

/**
 * Escapes the characters ILIKE treats specially, so a free-text search term
 * is matched literally — the same thing Prisma's `contains` does for us when
 * the filtering happens in the query builder instead of hand-written SQL.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

@Injectable()
export class ItemService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Catalogue search.
   *
   * WHY THIS DOES NOT PAGINATE IN SQL
   *
   * The default sort is "most available first", and availability is a count of
   * units matching a condition (in storage AND open for borrowing). Prisma can
   * order by an *unfiltered* relation count but not a filtered one, so there is
   * no `orderBy` that expresses it. Sorting the current page only would be
   * quietly wrong — page 2 would not continue page 1.
   *
   * So the filtering happens in SQL (which is what actually narrows the set),
   * and the ordering and slicing happen here. The rows are equipment *types*,
   * not units and not loans — a faculty has hundreds, not millions — and each
   * carries only its units' status flags.
   *
   * Revisit if ItemInfo grows past a few thousand rows. Storing availability
   * instead was considered and dropped: it is a cache of something these
   * queries already answer correctly, and a stale column is worse than a slow
   * one.
   */
  async list(user: TrpcUser, input: ListItemsInput) {
    const window = parseWindow(input);
    const held = await heldPairs(this.prisma, user.accountKey);

    // The windowed search still needs every matching unit's resource key and
    // buffer to ask resourcesFreeInWindow, and its due dates to know when a
    // busy unit frees up — there is no SQL that answers "free for this
    // period" for us, so this path keeps the old full fetch. It is the rarer
    // query (a borrower has picked dates already); the default, dateless
    // listing below is the one NFR-PRF-05 measures.
    if (window) {
      return this.listWithWindow(input, window, held);
    }

    const light = await this.lightweightItemRows(input, held);
    const summaries = input.availableOnly
      ? light.filter((s) => s.eligible)
      : light;
    sortItems(summaries, input.sort);

    const start = input.cursor
      ? findAfterCursor(summaries, decodeCursor(input.cursor, input.sort))
      : toSkipTake(input).skip;

    const pageLight = summaries.slice(start, start + input.pageSize);
    const pageItems = await this.hydratePage(pageLight);

    const last = pageItems[pageItems.length - 1];
    const nextCursor =
      last && start + pageItems.length < summaries.length
        ? encodeCursor(last, input.sort)
        : null;

    return { ...toPage(pageItems, summaries.length, input), nextCursor };
  }

  /**
   * The old, full-scan `list()` body, kept for the one case that still needs
   * it: a search over a specific date window. See the comment in `list`.
   */
  private async listWithWindow(
    input: ListItemsInput,
    window: { startTime: Date; endTime: Date },
    held: GroupRole[],
  ) {
    const rows = await this.prisma.itemInfo.findMany({
      where: this.itemWhere(input),
      select: ITEM_TYPE_SELECT,
    });

    const free = await resourcesFreeInWindow(
      this.prisma,
      rows.flatMap((row) =>
        row.Items.map((unit) => ({
          ResourceKey: unit.ResourceKey,
          BufferTime: unit.Resource.BufferTime,
        })),
      ),
      window.startTime,
      window.endTime,
    );

    let summaries = rows.map((row) => ({
      ...toItemSummary(row, freeInWindowPredicate(free)),
      eligible: mayBorrowAny(row.Items, held),
    }));
    // "Available only" over a window means available for that period, which
    // SQL cannot answer; itemWhere leaves the filter to here in that case.
    if (input.availableOnly) {
      summaries = summaries.filter((s) => s.availableUnits > 0 && s.eligible);
    }
    sortItems(summaries, input.sort);

    const start = input.cursor
      ? findAfterCursor(summaries, decodeCursor(input.cursor, input.sort))
      : toSkipTake(input).skip;

    const pageItems = summaries.slice(start, start + input.pageSize);
    const last = pageItems[pageItems.length - 1];
    const nextCursor =
      last && start + pageItems.length < summaries.length
        ? encodeCursor(last, input.sort)
        : null;

    return { ...toPage(pageItems, summaries.length, input), nextCursor };
  }

  /**
   * Every matching type's counts, computed in the database instead of by
   * loading every unit — the fix for NFR-PRF-05. One row per `ItemInfo`,
   * carrying only what sorting, cursoring and the availableOnly/eligibility
   * filters need. `list`'s page slice is re-fetched afterwards through
   * `hydratePage`, which reuses the exact mapper the old full scan used, so
   * what a borrower sees on the page is byte-for-byte the same as before —
   * only the *unreturned* rows stop paying for a full relation load.
   */
  /**
   * The catalogue counts, shared for a few seconds across callers that ask the
   * same question (same filters, same group memberships).
   *
   * NFR-PRF-03: counting every unit per request saturated the database at 200
   * users on the 10,000-unit dataset, while the numbers barely move between
   * requests. Borrowers already see availability through a 10-15s poll, so a
   * 5s-old count is within what the page promises.
   * ponytail: in-process cache, fine for the one backend instance deployed
   * (docs/deploy.md); move it to Redis if the backend is ever replicated.
   */
  private readonly lightCache = new Map<
    string,
    { at: number; rows: Promise<LightItemRow[]> }
  >();

  private async lightweightItemRows(
    input: ListItemsInput,
    held: GroupRole[],
  ): Promise<LightItemRow[]> {
    // Only what changes the SQL; paging, sort and availableOnly apply after.
    const {
      page: _page,
      pageSize: _pageSize,
      cursor: _cursor,
      sort: _sort,
      availableOnly: _availableOnly,
      ...filters
    } = input;
    const key = JSON.stringify([
      filters,
      held.map((h) => `${h.GroupKey}:${h.RoleKey}`).sort(),
    ]);
    const now = Date.now();
    const hit = this.lightCache.get(key);
    if (hit && now - hit.at < LIGHT_CACHE_MS) return (await hit.rows).slice();

    if (this.lightCache.size > 500) this.lightCache.clear();
    const rows = this.queryLightweightItemRows(input, held);
    this.lightCache.set(key, { at: now, rows });
    // A failed query must not be served to the next caller for 5s.
    rows.catch(() => this.lightCache.delete(key));
    return (await rows).slice();
  }

  private async queryLightweightItemRows(
    input: ListItemsInput,
    held: GroupRole[],
  ): Promise<LightItemRow[]> {
    const conditions: Prisma.Sql[] = [];

    if (input.q) {
      const q = `%${escapeLike(input.q)}%`;
      conditions.push(Prisma.sql`(
        i."ItemName" ILIKE ${q}
        OR i."ItemDesc" ILIKE ${q}
        OR EXISTS (
          SELECT 1 FROM "ItemIndiv" qi
          WHERE qi."ItemKey" = i."ItemKey" AND qi."ItemID" ILIKE ${q}
        )
      )`);
    }

    if (input.tier) {
      const tier = escapeLike(input.tier);
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "ItemIndiv" ti
        JOIN "ResourceInfo" tr ON tr."ResourceKey" = ti."ResourceKey"
        JOIN "BorrowRule" tb ON tb."BorrowRuleKey" = tr."BorrowRule"
        WHERE ti."ItemKey" = i."ItemKey" AND tb."RuleName" ILIKE ${tier}
      )`);
    }

    if (input.ownerGroupKey) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "ItemIndiv" oi
        JOIN "ResourceInfo" orr ON orr."ResourceKey" = oi."ResourceKey"
        WHERE oi."ItemKey" = i."ItemKey" AND orr."ManagedBy" = ${input.ownerGroupKey}
      )`);
    }

    if (input.availableOnly) {
      // No window here — `list` sends a window through `listWithWindow`
      // instead, same split as the old `itemWhere`.
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "ItemIndiv" ai
        JOIN "ResourceInfo" ar ON ar."ResourceKey" = ai."ResourceKey"
        WHERE ai."ItemKey" = i."ItemKey"
          AND ar."ResourceStatus" = 'InStorage'
          AND ar."AllowBorrow"
      )`);
    }

    const where =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.sql``;

    // Exact (group, role) matches only — matchingRules' own rule, translated
    // to SQL. held is a handful of rows at most (one borrower's memberships),
    // so an OR of equality pairs stays cheap and needs no array parameters.
    const eligibleExpr =
      held.length === 0
        ? Prisma.sql`false`
        : Prisma.sql`EXISTS (
            SELECT 1 FROM "Eligibility" e
            WHERE e."ResourceKey" = r."ResourceKey"
              AND (${Prisma.join(
                held.map(
                  (h) =>
                    Prisma.sql`(e."GroupKey" = ${h.GroupKey} AND e."RoleKey" = ${h.RoleKey})`,
                ),
                ' OR ',
              )})
          )`;

    const unavailableStates = Prisma.join(
      UNAVAILABLE_USAGE_STATES.map((s) => Prisma.sql`${s}::"CurrentStatus"`),
    );
    const loanStates = onLoanStates();

    return this.prisma.$queryRaw<LightItemRow[]>(Prisma.sql`
      SELECT
        i."ItemKey" AS id,
        COALESCE(i."ItemName", '#' || i."ItemKey") AS name,
        i."CreditWeight" AS "creditWeight",
        COALESCE(u."totalUnits", 0)::int AS "totalUnits",
        COALESCE(u."availableUnits", 0)::int AS "availableUnits",
        COALESCE(u."borrowableUnits", 0)::int AS "borrowableUnits",
        n."readyAt" AS "readyAt",
        t."RuleName" AS tier,
        COALESCE(u.eligible, false) AS eligible
      FROM "ItemInfo" i
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE r."ResourceStatus" != 'Retired'::"ResourceStatus") AS "totalUnits",
          COUNT(*) FILTER (
            WHERE r."ResourceStatus" = 'InStorage'::"ResourceStatus"
              AND r."AllowBorrow"
              AND NOT EXISTS (
                SELECT 1 FROM "UsageLog" ul
                WHERE ul."ResourceKey" = r."ResourceKey"
                  AND ul."CurrentStatus" IN (${unavailableStates})
              )
          ) AS "availableUnits",
          COUNT(*) FILTER (
            WHERE r."ResourceStatus" NOT IN ('Missing'::"ResourceStatus", 'Retired'::"ResourceStatus")
              AND r."AllowBorrow"
          ) AS "borrowableUnits",
          BOOL_OR(
            r."ResourceStatus" != 'Retired'::"ResourceStatus" AND ${eligibleExpr}
          ) AS eligible
        FROM "ItemIndiv" ii
        JOIN "ResourceInfo" r ON r."ResourceKey" = ii."ResourceKey"
        WHERE ii."ItemKey" = i."ItemKey"
      ) u ON true
      LEFT JOIN LATERAL (
        -- unitReadyAt: a unit on loan frees up at its due date plus prep days;
        -- one back and awaiting grading has no date, so Returned is left out.
        -- Driven from the few active loans (status index), not the history.
        SELECT MIN(ul."DueTime" + r."BufferTime" * interval '1 day') AS "readyAt"
        FROM "UsageLog" ul
        JOIN "ResourceInfo" r ON r."ResourceKey" = ul."ResourceKey"
        JOIN "ItemIndiv" ii ON ii."ResourceKey" = ul."ResourceKey"
        WHERE ul."CurrentStatus" IN (${loanStates})
          AND ii."ItemKey" = i."ItemKey"
          AND r."ResourceStatus" != 'Retired'::"ResourceStatus"
      ) n ON true
      LEFT JOIN LATERAL (
        -- typeTier: the first unit whose rule names a tier.
        SELECT br."RuleName"
        FROM "ItemIndiv" ii
        JOIN "ResourceInfo" r ON r."ResourceKey" = ii."ResourceKey"
        JOIN "BorrowRule" br ON br."BorrowRuleKey" = r."BorrowRule"
        WHERE ii."ItemKey" = i."ItemKey"
          AND r."ResourceStatus" != 'Retired'::"ResourceStatus"
          AND UPPER(TRIM(br."RuleName")) IN ('T0', 'T1', 'T2', 'T3')
        ORDER BY ii."IndivKey"
        LIMIT 1
      ) t ON true
      ${where}
    `);
  }

  /**
   * The page's summaries from the aggregate rows, plus each type's own columns
   * and its first unit (owner, prep days). NFR-PRF-05: loading every unit here
   * cost a query over all 10,000 units' loans just to count them again.
   */
  private async hydratePage(page: LightItemRow[]): Promise<ItemSummary[]> {
    if (page.length === 0) return [];
    const rows = await this.prisma.itemInfo.findMany({
      where: { ItemKey: { in: page.map((p) => p.id) } },
      select: {
        ItemKey: true,
        ItemDesc: true,
        ImageURL: true,
        Items: {
          where: { Resource: NOT_RETIRED },
          orderBy: { IndivKey: 'asc' },
          take: 1,
          select: {
            Resource: {
              select: {
                BufferTime: true,
                ManagementGroup:
                  ITEM_TYPE_SELECT.Items.select.Resource.select.ManagementGroup,
              },
            },
          },
        },
      },
    });
    const byKey = new Map(rows.map((row) => [row.ItemKey, row]));
    return page.flatMap((p) => {
      const row = byKey.get(p.id);
      if (!row) return [];
      const first = row.Items[0]?.Resource;
      return [
        {
          id: p.id,
          name: p.name,
          description: row.ItemDesc,
          imageUrl: row.ImageURL,
          tier: tryMapTier(p.tier),
          creditWeight: p.creditWeight,
          totalUnits: p.totalUnits,
          availableUnits: p.availableUnits,
          stockStatus:
            p.availableUnits > 0
              ? 'ok'
              : p.borrowableUnits > 0
                ? 'queue'
                : 'maintenance',
          nextAvailableAt:
            p.availableUnits > 0 || !p.readyAt
              ? null
              : new Date(p.readyAt).toISOString(),
          prepDays: first?.BufferTime ?? 0,
          allowBorrow: p.borrowableUnits > 0,
          owner: first ? toOwner(first.ManagementGroup) : null,
          eligible: p.eligible,
        },
      ];
    });
  }

  async getById(user: TrpcUser, itemKey: number, window?: ListUnitsInput) {
    const row = await this.prisma.itemInfo.findUnique({
      where: { ItemKey: itemKey },
      select: {
        ...ITEM_TYPE_SELECT,
        Items: { ...ITEM_TYPE_SELECT.Items, orderBy: { ItemID: 'asc' } },
      },
    });

    if (!row) throw new BusinessError('ITEM_NOT_FOUND', { id: itemKey });

    const eligible = mayBorrowAny(
      row.Items,
      await heldPairs(this.prisma, user.accountKey),
    );
    const period = window ? parseWindow(window) : null;
    if (!period) return { ...toItemDetail(row), eligible };

    const free = await resourcesFreeInWindow(
      this.prisma,
      row.Items.map((unit) => ({
        ResourceKey: unit.ResourceKey,
        BufferTime: unit.Resource.BufferTime,
      })),
      period.startTime,
      period.endTime,
    );
    return { ...toItemDetail(row, free), eligible };
  }

  /**
   * The polled endpoint (10-15s per open item page). Selects the three status
   * flags the count needs and nothing else — no names, no images, no group.
   */
  async getAvailability(itemKey: number) {
    // Same rules as isUnitAvailable / unitReadyAt, counted in SQL: this is the
    // 10-15s poll (NFR-PRF-04), and loading every unit's loan made it scale
    // with the size of the type.
    const states = Prisma.join(
      UNAVAILABLE_USAGE_STATES.map((s) => Prisma.sql`${s}::"CurrentStatus"`),
    );
    const [row] = await this.prisma.$queryRaw<
      {
        found: boolean;
        total: number;
        available: number;
        readyAt: Date | null;
      }[]
    >(Prisma.sql`
      SELECT
        EXISTS (SELECT 1 FROM "ItemInfo" WHERE "ItemKey" = ${itemKey}) AS found,
        COUNT(*)::int AS total,
        (COUNT(*) FILTER (
          WHERE r."ResourceStatus" = 'InStorage'::"ResourceStatus"
            AND r."AllowBorrow"
            AND NOT EXISTS (
              SELECT 1 FROM "UsageLog" ul
              WHERE ul."ResourceKey" = r."ResourceKey"
                AND ul."CurrentStatus" IN (${states})
            )
        ))::int AS available,
        (
          SELECT MIN(ul."DueTime" + r2."BufferTime" * interval '1 day')
          FROM "UsageLog" ul
          JOIN "ResourceInfo" r2 ON r2."ResourceKey" = ul."ResourceKey"
          JOIN "ItemIndiv" ii2 ON ii2."ResourceKey" = ul."ResourceKey"
          WHERE ul."CurrentStatus" IN (${onLoanStates()})
            AND ii2."ItemKey" = ${itemKey}
            AND r2."ResourceStatus" != 'Retired'::"ResourceStatus"
        ) AS "readyAt"
      FROM "ItemIndiv" ii
      JOIN "ResourceInfo" r ON r."ResourceKey" = ii."ResourceKey"
      WHERE ii."ItemKey" = ${itemKey}
        AND r."ResourceStatus" != 'Retired'::"ResourceStatus"
    `);

    if (!row?.found) throw new BusinessError('ITEM_NOT_FOUND', { id: itemKey });

    return {
      availableUnits: row.available,
      totalUnits: row.total,
      nextAvailableAt:
        row.available > 0 || !row.readyAt
          ? null
          : new Date(row.readyAt).toISOString(),
    };
  }

  /** The units of one type — the same list `getById` returns, without the type. */
  async listUnits(user: TrpcUser, input: ListUnitsInput) {
    return (await this.getById(user, input.id, input)).units;
  }

  /**
   * Rooms.
   *
   * Unlike items this does paginate in SQL: every column the sort keys touch
   * (name, location, credit weight) lives directly on RoomInfo, and a room has
   * exactly one resource rather than a variable number of units, so there is
   * nothing to count.
   */
  async listRooms(input: ListRoomsInput) {
    const where = this.roomWhere(input);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.roomInfo.findMany({
        where,
        orderBy: this.roomOrderBy(input.sort),
        ...toSkipTake(input),
        select: {
          RoomKey: true,
          RoomName: true,
          RoomDesc: true,
          RoomLocation: true,
          Capacity: true,
          ImageURL: true,
          CreditWeight: true,
          Resource: {
            select: {
              ResourceStatus: true,
              AllowBorrow: true,
              BufferTime: true,
              BorrowRuleInfo: { select: { RuleName: true } },
              ManagementGroup: {
                select: {
                  ManageGroupKey: true,
                  GroupType: true,
                  Branch: { select: { BranchName: true } },
                  Club: { select: { ClubName: true } },
                },
              },
              CurrentCondition: { select: { Condition: true } },
              UsageLogs: CURRENT_LOAN_SELECT,
            },
          },
        },
      }),
      this.prisma.roomInfo.count({ where }),
    ]);

    return toPage(
      rows.map((row) => toRoomSummary(row)),
      total,
      input,
    );
  }

  async getRoomById(roomKey: number) {
    const row = await this.prisma.roomInfo.findUnique({
      where: { RoomKey: roomKey },
      select: {
        RoomKey: true,
        RoomName: true,
        RoomDesc: true,
        RoomLocation: true,
        Capacity: true,
        ImageURL: true,
        CreditWeight: true,
        Resource: {
          select: {
            ResourceStatus: true,
            AllowBorrow: true,
            BufferTime: true,
            BorrowRuleInfo: { select: { RuleName: true } },
            ManagementGroup: {
              select: {
                ManageGroupKey: true,
                GroupType: true,
                Branch: { select: { BranchName: true } },
                Club: { select: { ClubName: true } },
              },
            },
            CurrentCondition: { select: { Condition: true } },
            UsageLogs: CURRENT_LOAN_SELECT,
          },
        },
      },
    });

    // A retired room reads the same as one that never existed to a borrower -
    // it stays in the database for reports, but it is not something to book.
    if (!row || row.Resource.ResourceStatus === 'Retired') {
      throw new BusinessError('ROOM_NOT_FOUND', { id: roomKey });
    }
    return toRoomSummary(row);
  }

  /**
   * Which half-hours of one day the room is free (§5.5, T3).
   *
   * **Derived, never stored.** There is no slot table and there should not be
   * one: a slot is a way of looking at `Reservations`, and a second table
   * holding the same facts is a table that can disagree with the bookings it
   * describes — a chip shown free over a booking that exists, or the reverse.
   * The cost of deriving is one indexed range scan per day viewed, which is
   * what `@@index([ResourceKey, StartTime, EndTime])` on Reservations is for.
   *
   * `Pending` counts as taken, exactly as it does for equipment
   * (HOLDING_APPROVE_STATES): two people may not queue for the same room over
   * the same half-hour, because whoever is approved second would find it
   * already promised.
   *
   * A slot that has already passed is marked unavailable too. It is not a
   * booking, but the answer to "may I book this" is the same, and leaving it
   * to the client means every client has to know the counter's timezone to
   * work out which chips are behind them.
   */
  async roomAvailability(input: RoomAvailabilityInput) {
    const room = await this.prisma.roomInfo.findUnique({
      where: { RoomKey: input.roomKey },
      select: {
        RoomKey: true,
        OpenTime: true,
        CloseTime: true,
        BreakStart: true,
        BreakEnd: true,
        Resource: { select: { ResourceKey: true, ResourceStatus: true } },
      },
    });
    if (!room || room.Resource.ResourceStatus === 'Retired') {
      throw new BusinessError('ROOM_NOT_FOUND', { id: input.roomKey });
    }
    const hours = toRoomHours(room);

    const { from, to } = dayWindow(hours, input.date);
    const booked = await this.prisma.reservations.findMany({
      where: {
        ResourceKey: room.Resource.ResourceKey,
        ApproveStatus: { in: [...HOLDING_APPROVE_STATES] },
        // Half-open, matching clashingWindowFilter: a booking that ends as the
        // day's first slot begins does not touch it.
        StartTime: { lt: to },
        EndTime: { gt: from },
      },
      select: { StartTime: true, EndTime: true },
    });

    const now = new Date();
    const slots = markSlots(
      hours,
      input.date,
      booked.map((row) => ({ startTime: row.StartTime, endTime: row.EndTime })),
    ).map((slot) => {
      const window = slotWindow(hours, input.date, slot.index);
      return {
        index: slot.index,
        start: slot.start,
        end: slot.end,
        startTime: toIso(window.startTime),
        endTime: toIso(window.endTime),
        available: slot.available && window.startTime > now,
      };
    });

    return {
      roomKey: input.roomKey,
      date: input.date,
      slots,
      maxSlotsPerBooking: MAX_ROOM_BOOKING_SLOTS,
      slotMinutes: ROOM_SLOT_MINUTES,
    };
  }

  // =========================================================================
  // Internals
  // =========================================================================

  /**
   * Every condition is pushed onto AND rather than merged into one object,
   * because several of them constrain the same `Items` relation. Written as
   * sibling keys, the last one would silently win.
   */
  private itemWhere(input: ListItemsInput): Prisma.ItemInfoWhereInput {
    const and: Prisma.ItemInfoWhereInput[] = [];

    if (input.q) {
      and.push({
        OR: [
          { ItemName: { contains: input.q, mode: 'insensitive' } },
          { ItemDesc: { contains: input.q, mode: 'insensitive' } },
          // Students often search by the asset tag printed on the item.
          {
            Items: {
              some: { ItemID: { contains: input.q, mode: 'insensitive' } },
            },
          },
        ],
      });
    }

    if (input.tier) {
      // A tier is a BorrowRule row (status.schema.ts), and BorrowRule hangs off
      // each unit — so a type matches the filter when any of its units does.
      and.push({
        Items: {
          some: {
            Resource: {
              BorrowRuleInfo: {
                RuleName: { equals: input.tier, mode: 'insensitive' },
              },
            },
          },
        },
      });
    }

    if (input.ownerGroupKey) {
      and.push({
        Items: { some: { Resource: { ManagedBy: input.ownerGroupKey } } },
      });
    }

    if (input.availableOnly && !input.startTime) {
      and.push({
        Items: {
          some: {
            Resource: { ResourceStatus: 'InStorage', AllowBorrow: true },
          },
        },
      });
    }

    return and.length > 0 ? { AND: and } : {};
  }

  private roomWhere(input: ListRoomsInput): Prisma.RoomInfoWhereInput {
    // A retired room is not a search result at any filter combination.
    const and: Prisma.RoomInfoWhereInput[] = [{ Resource: NOT_RETIRED }];

    if (input.q) {
      and.push({
        OR: [
          { RoomName: { contains: input.q, mode: 'insensitive' } },
          { RoomDesc: { contains: input.q, mode: 'insensitive' } },
          { RoomLocation: { contains: input.q, mode: 'insensitive' } },
        ],
      });
    }

    if (input.ownerGroupKey) {
      and.push({ Resource: { ManagedBy: input.ownerGroupKey } });
    }

    if (input.bookableOnly) {
      and.push({
        Resource: { AllowBorrow: true, ResourceStatus: 'InStorage' },
      });
    }

    return and.length > 0 ? { AND: and } : {};
  }

  private roomOrderBy(
    sort: ListRoomsInput['sort'],
  ): Prisma.RoomInfoOrderByWithRelationInput {
    switch (sort) {
      case 'location':
        return { RoomLocation: 'asc' };
      case 'creditWeight':
        return { CreditWeight: 'asc' };
      case 'name':
        return { RoomName: 'asc' };
    }
  }
}

/** Re-exported so the row type stays visible where the selects are written. */
export type { ItemTypeRow };

/** The fields any sort key or the pagination cursor can read. */
type SortableItem = Pick<
  ItemSummary,
  'id' | 'name' | 'availableUnits' | 'totalUnits' | 'creditWeight'
>;

/** Thai collation, so ก sorts before ข rather than by code point. */
function byName(a: SortableItem, b: SortableItem): number {
  return a.name.localeCompare(b.name, 'th');
}

/**
 * The catalogue's ordering for one sort key, `id` last.
 *
 * Every key falls back to name and then to `id`, so two rows never compare
 * equal. That determinism is what makes cursor pagination (below) exact: the
 * cursor names a row by the same tuple this function compares on, so
 * "everything after the cursor" has one unambiguous meaning regardless of
 * what order the database happened to hand rows back in.
 */
function compareItems(
  a: SortableItem,
  b: SortableItem,
  sort: ListItemsInput['sort'],
): number {
  switch (sort) {
    case 'available':
      // Anything in stock outranks everything out of stock, then by depth of
      // stock — one unit free beats ten due back tomorrow.
      return (
        Number(b.availableUnits > 0) - Number(a.availableUnits > 0) ||
        b.availableUnits - a.availableUnits ||
        byName(a, b) ||
        a.id - b.id
      );
    case 'popular':
      return b.totalUnits - a.totalUnits || byName(a, b) || a.id - b.id;
    case 'creditWeight':
      return a.creditWeight - b.creditWeight || byName(a, b) || a.id - b.id;
    case 'name':
      return byName(a, b) || a.id - b.id;
  }
}

/**
 * Sorts the catalogue in place.
 *
 * A free function rather than a method so it can be tested without a database
 * — this is where the default catalogue ordering is decided, and it is the
 * kind of comparator that is easy to get subtly wrong.
 */
export function sortItems<T extends SortableItem>(
  items: T[],
  sort: ListItemsInput['sort'],
): void {
  items.sort((a, b) => compareItems(a, b, sort));
}

/**
 * FR-BRW-02 cursor for `item.list`.
 *
 * The default sort ("available") is computed in memory over the whole
 * catalogue — see the big comment on `ItemService.list` — so there is no
 * database column to build a Prisma keyset query on. Instead the cursor
 * carries the exact tuple `compareItems` would need to place the last row
 * returned: sort name (so a cursor from a different sort is refused rather
 * than silently reinterpreted) plus every field any sort key reads, plus the
 * row's own id as the final tiebreak. Given that, `findAfterCursor` below
 * finds "everything after this row" by re-running the same comparator,
 * whatever order the database happened to hand rows back in — that is what
 * makes it stable across calls rather than a disguised page offset.
 *
 * Opaque and base64url so it drops into a URL unescaped; a client should not
 * parse it.
 */
interface ListCursor extends SortableItem {
  sort: ListItemsInput['sort'];
}

function encodeCursor(
  item: SortableItem,
  sort: ListItemsInput['sort'],
): string {
  const payload: ListCursor = {
    sort,
    id: item.id,
    name: item.name,
    availableUnits: item.availableUnits,
    totalUnits: item.totalUnits,
    creditWeight: item.creditWeight,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(
  cursor: string,
  sort: ListItemsInput['sort'],
): ListCursor {
  try {
    const raw: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    if (
      typeof raw !== 'object' ||
      raw === null ||
      typeof (raw as ListCursor).id !== 'number' ||
      typeof (raw as ListCursor).name !== 'string' ||
      typeof (raw as ListCursor).availableUnits !== 'number' ||
      typeof (raw as ListCursor).totalUnits !== 'number' ||
      typeof (raw as ListCursor).creditWeight !== 'number' ||
      (raw as ListCursor).sort !== sort
    ) {
      // Also catches a cursor minted under a different `sort` — resuming
      // against a different order would silently skip or repeat rows.
      throw new Error('shape mismatch');
    }
    return raw as ListCursor;
  } catch {
    throw new BusinessError('INVALID_CURSOR');
  }
}

/** The index of the first row that sorts after `cursor`, or past the end. */
function findAfterCursor<T extends SortableItem>(
  items: T[],
  cursor: ListCursor,
): number {
  const index = items.findIndex(
    (item) => compareItems(item, cursor, cursor.sort) > 0,
  );
  return index === -1 ? items.length : index;
}

/**
 * A requested period, or null when none was given. Both ends or neither, and
 * the end after the start, with the same code loan.create answers for a bad
 * window so the two surfaces refuse the same input the same way.
 */
function parseWindow(input: {
  startTime?: string;
  endTime?: string;
}): { startTime: Date; endTime: Date } | null {
  if (!input.startTime && !input.endTime) return null;
  if (!input.startTime || !input.endTime) {
    throw new BusinessError('INVALID_BORROW_WINDOW', {
      reason: 'BOTH_ENDS_REQUIRED',
    });
  }
  const startTime = new Date(input.startTime);
  const endTime = new Date(input.endTime);
  if (endTime <= startTime) {
    throw new BusinessError('INVALID_BORROW_WINDOW', {
      reason: 'END_BEFORE_START',
    });
  }
  return { startTime, endTime };
}

/** Any unit of this type whose rules name a (group, role) pair the caller holds. */
function mayBorrowAny(
  units: { Resource: { Eligibilities: GroupRole[] } }[],
  held: GroupRole[],
): boolean {
  return units.some(
    (unit) => matchingRules(unit.Resource.Eligibilities, held).length > 0,
  );
}
