import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { BusinessError, notImplemented } from '../common/errors/business-error';
import {
  isUnitAvailable,
  nextAvailableAt,
  toItemDetail,
  toItemSummary,
  toRoomSummary,
  type ItemTypeRow,
} from '../common/mappers/item.mapper';
import { toPage, toSkipTake } from '../common/schemas/pagination.schema';
import type {
  ItemSummary,
  ListItemsInput,
  ListRoomsInput,
} from './item.schema';

/**
 * Selects the loan currently holding a unit, and nothing else.
 *
 * `take: 1` with the status filter is load-bearing — the mapper reads the due
 * date from the first row, so widening this select silently starts reporting
 * due dates from loans that closed months ago.
 */
const CURRENT_LOAN_SELECT = {
  where: { CurrentStatus: 'Lended' },
  orderBy: { DueTime: 'asc' },
  take: 1,
  select: { DueTime: true },
} as const;

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
   * Revisit when either becomes true: ItemInfo grows past a few thousand rows,
   * or the planned `computeAvailability` cron lands and availability becomes a
   * stored column, at which point this is an ordinary indexed ORDER BY.
   */
  async list(input: ListItemsInput) {
    const rows = await this.prisma.itemInfo.findMany({
      where: this.itemWhere(input),
      select: {
        ItemKey: true,
        ItemName: true,
        ItemDesc: true,
        ImageURL: true,
        CreditWeight: true,
        Items: {
          select: {
            IndivKey: true,
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
              },
            },
          },
        },
      },
    });

    const summaries = rows.map((row) => toItemSummary(row));
    sortItems(summaries, input.sort);

    const { skip, take } = toSkipTake(input);
    return toPage(summaries.slice(skip, skip + take), summaries.length, input);
  }

  async getById(itemKey: number) {
    const row = await this.prisma.itemInfo.findUnique({
      where: { ItemKey: itemKey },
      select: {
        ItemKey: true,
        ItemName: true,
        ItemDesc: true,
        ImageURL: true,
        CreditWeight: true,
        Items: {
          orderBy: { ItemID: 'asc' },
          select: {
            IndivKey: true,
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
              },
            },
          },
        },
      },
    });

    if (!row) throw new BusinessError('ITEM_NOT_FOUND', { id: itemKey });
    return toItemDetail(row);
  }

  /**
   * The polled endpoint (10-15s per open item page). Selects the three status
   * flags the count needs and nothing else — no names, no images, no group.
   */
  async getAvailability(itemKey: number) {
    const row = await this.prisma.itemInfo.findUnique({
      where: { ItemKey: itemKey },
      select: {
        Items: {
          select: {
            Resource: {
              select: {
                ResourceStatus: true,
                AllowBorrow: true,
                // available-from is the return date plus prep days (proposal
                // 5.5), so even the leanest select has to carry BufferTime.
                BufferTime: true,
                UsageLogs: CURRENT_LOAN_SELECT,
              },
            },
          },
        },
      },
    });

    if (!row) throw new BusinessError('ITEM_NOT_FOUND', { id: itemKey });

    // Both numbers come from the same helpers the catalogue mapper uses, so
    // the polled badge and the list page cannot drift apart.
    return {
      availableUnits: row.Items.filter(isUnitAvailable).length,
      totalUnits: row.Items.length,
      nextAvailableAt: nextAvailableAt(row.Items),
    };
  }

  /** The units of one type — the same list `getById` returns, without the type. */
  async listUnits(itemKey: number) {
    return (await this.getById(itemKey)).units;
  }

  /**
   * Not implemented — nothing in the schema groups equipment into categories.
   *
   * Kept as a declared procedure rather than left out, so the catalogue's
   * category filter has a contract to be written against the day the table
   * exists.
   */
  listCategories(): never {
    return notImplemented(
      ['Category table (name), plus ItemInfo.CategoryKey'],
      "The frontend groups the catalogue into instrument / tool / board, but ItemInfo has no category column. Tier is unaffected — it comes from the unit's BorrowRule.",
    );
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

    if (!row) throw new BusinessError('ROOM_NOT_FOUND', { id: roomKey });
    return toRoomSummary(row);
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

    if (input.availableOnly) {
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
    const and: Prisma.RoomInfoWhereInput[] = [];

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

/** Thai collation, so ก sorts before ข rather than by code point. */
function byName(a: ItemSummary, b: ItemSummary): number {
  return a.name.localeCompare(b.name, 'th');
}

/**
 * Sorts the catalogue in place.
 *
 * A free function rather than a method so it can be tested without a database
 * — this is where the default catalogue ordering is decided, and it is the
 * kind of comparator that is easy to get subtly wrong.
 *
 * Every key falls back to name, so equal rows come out in a stable, meaningful
 * order instead of whatever the database happened to return.
 */
export function sortItems(
  items: ItemSummary[],
  sort: ListItemsInput['sort'],
): void {
  switch (sort) {
    case 'available':
      // Anything in stock outranks everything out of stock, then by depth of
      // stock — one unit free beats ten due back tomorrow.
      items.sort(
        (a, b) =>
          Number(b.availableUnits > 0) - Number(a.availableUnits > 0) ||
          b.availableUnits - a.availableUnits ||
          byName(a, b),
      );
      break;
    case 'popular':
      items.sort((a, b) => b.totalUnits - a.totalUnits || byName(a, b));
      break;
    case 'creditWeight':
      items.sort((a, b) => a.creditWeight - b.creditWeight || byName(a, b));
      break;
    case 'name':
      items.sort(byName);
      break;
  }
}
