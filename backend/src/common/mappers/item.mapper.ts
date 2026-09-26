import type { UsageStatus } from '../schemas/status.schema';
import { tryMapTier } from '../schemas/status.schema';
import type {
  ItemDetail,
  ItemSummary,
  RoomSummary,
} from '../../item/item.schema';

/**
 * Row shapes for the catalogue mappers.
 *
 * Declared by hand for the same reason the other mappers do it: the caller
 * decides exactly which columns are selected, and the shape here is what makes
 * a wrong `select` fail at compile time instead of at runtime.
 */
interface ManagementGroupRow {
  ManageGroupKey: number;
  GroupType: 'Club' | 'Faculty';
  Branch: { BranchName: string | null } | null;
  Club: { ClubName: string | null } | null;
}

interface ResourceRow {
  ResourceStatus: 'InStorage' | 'Lended' | 'Missing' | 'Retired';
  AllowBorrow: boolean;
  BufferTime: number;
  /**
   * The unit's tier. A tier *is* a BorrowRule row — see status.schema.ts — so
   * every select feeding these mappers has to reach for it, and a rule outside
   * T0-T3 maps to a null tier rather than an error.
   */
  BorrowRuleInfo: { RuleName: string | null };
  ManagementGroup: ManagementGroupRow;
  CurrentCondition: {
    Condition: 'Normal' | 'MinorDamage' | 'MajorDamage' | 'Broken' | 'Missing';
  } | null;
  /**
   * MUST be filtered to loans still holding the unit (UNAVAILABLE_USAGE_STATES)
   * and limited to one row. Any row at all makes the unit unavailable; the
   * status says whether its due date means anything to a borrower.
   */
  UsageLogs: { DueTime: Date; CurrentStatus: UsageStatus }[];
}

export interface ItemUnitRow {
  IndivKey: number;
  ResourceKey: number;
  ItemID: string;
  ImageURL: string | null;
  Resource: ResourceRow;
}

export interface ItemTypeRow {
  ItemKey: number;
  ItemName: string | null;
  ItemDesc: string | null;
  ImageURL: string | null;
  CreditWeight: number;
  Items: ItemUnitRow[];
}

export interface RoomRow {
  RoomKey: number;
  RoomName: string | null;
  RoomDesc: string | null;
  RoomLocation: string | null;
  ImageURL: string | null;
  CreditWeight: number;
  Capacity: number | null;
  Resource: ResourceRow;
}

export function toOwner(group: ManagementGroupRow) {
  return {
    id: group.ManageGroupKey,
    name: group.Branch?.BranchName ?? group.Club?.ClubName ?? null,
    type: group.GroupType,
  };
}

/**
 * The tier of an equipment *type*, read off its units.
 *
 * ItemInfo has no tier of its own: BorrowRule hangs off ResourceInfo, i.e. off
 * each individual unit. In practice every unit of a type shares one rule, so
 * the first unit that names a real tier answers for the type. A type with no
 * units yet — `item.createType` registers one before any unit exists — has no
 * tier at all, which is why the field is nullable.
 */
function typeTier(units: ItemUnitRow[]) {
  for (const unit of units) {
    const tier = tryMapTier(unit.Resource.BorrowRuleInfo.RuleName);
    if (tier !== null) return tier;
  }
  return null;
}

/**
 * The columns the availability maths reads, and nothing else.
 *
 * Declared separately from ItemUnitRow so `item.getAvailability` — the 10-15s
 * poll, which selects the fewest columns it can get away with — shares these
 * two functions instead of keeping its own copy. Two copies of "when does this
 * come back" is exactly how the list page and the polled badge start
 * disagreeing.
 */
export interface AvailabilityUnitRow {
  Resource: {
    ResourceStatus: 'InStorage' | 'Lended' | 'Missing' | 'Retired';
    AllowBorrow: boolean;
    BufferTime: number;
    UsageLogs: { DueTime: Date; CurrentStatus: UsageStatus }[];
  };
}

/**
 * Free to borrow right now: on the shelf, open for borrowing, and not held by
 * any loan. The last part is what staff inventory already checked; without it
 * a unit set aside for someone, or returned and not yet graded, read as free
 * here while the staff screen and loan.create both said otherwise.
 */
export function isUnitAvailable(unit: AvailabilityUnitRow): boolean {
  return (
    unit.Resource.ResourceStatus === 'InStorage' &&
    unit.Resource.AllowBorrow &&
    unit.Resource.UsageLogs.length === 0
  );
}

/** Could be borrowed eventually — excludes units that are lost, retired, or switched off. */
function isBorrowable(unit: AvailabilityUnitRow): boolean {
  return (
    unit.Resource.ResourceStatus !== 'Missing' &&
    unit.Resource.ResourceStatus !== 'Retired' &&
    unit.Resource.AllowBorrow
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Earliest moment a unit is ready to lend again, or null when one is free now.
 *
 * Proposal 5.5 defines available-from as the earliest return date *plus* the
 * prep days staff need before that unit can go out again (ResourceInfo
 * .BufferTime). The buffer is per unit, so the minimum has to be taken over
 * the adjusted dates, never over the raw due dates: a unit due back tomorrow
 * that needs five prep days is ready later than one due back Friday that needs
 * none, and taking the minimum first would report tomorrow.
 *
 * Returning null while stock exists is deliberate: "available now" and "back
 * on Friday" are different answers, and a date shown next to a positive
 * availability count reads as though the item were unavailable.
 */
export function nextAvailableAt<U extends AvailabilityUnitRow>(
  units: U[],
  isAvailable: (unit: U) => boolean = isUnitAvailable,
): string | null {
  if (units.some(isAvailable)) return null;

  const readyAt = units
    .map(unitReadyAt)
    .filter((at): at is number => at !== null);

  if (readyAt.length === 0) return null;
  return new Date(Math.min(...readyAt)).toISOString();
}

/**
 * Due date plus this unit's prep days, or null when there is no date to give.
 * A unit back and awaiting grading has no honest date: it is free once staff
 * have looked at it, which could be today or never if it is broken.
 */
function unitReadyAt(unit: AvailabilityUnitRow): number | null {
  const loan = unit.Resource.UsageLogs[0];
  if (!loan || loan.CurrentStatus === 'Returned') return null;
  return loan.DueTime.getTime() + unit.Resource.BufferTime * DAY_MS;
}

/**
 * `isAvailable` defaults to "free right now". The catalogue passes a window
 * check instead when the borrower has picked dates, so the count, the stock
 * status and the next-available date all answer for that period together.
 */
export function toItemSummary(
  row: ItemTypeRow,
  isAvailable: (unit: ItemUnitRow) => boolean = isUnitAvailable,
): Omit<ItemSummary, 'eligible'> {
  const units = row.Items;
  const availableUnits = units.filter(isAvailable).length;
  const borrowableUnits = units.filter(isBorrowable).length;
  const first = units[0];

  return {
    id: row.ItemKey,
    // ItemName is nullable in the schema but a nameless row is unusable in a
    // catalogue, so it degrades to its key rather than an empty cell.
    name: row.ItemName ?? `#${row.ItemKey}`,
    description: row.ItemDesc,
    imageUrl: row.ImageURL,

    tier: typeTier(units),
    creditWeight: row.CreditWeight,

    totalUnits: units.length,
    availableUnits,
    stockStatus:
      availableUnits > 0 ? 'ok' : borrowableUnits > 0 ? 'queue' : 'maintenance',

    nextAvailableAt: nextAvailableAt(units, isAvailable),

    prepDays: first?.Resource.BufferTime ?? 0,
    allowBorrow: borrowableUnits > 0,

    owner: first ? toOwner(first.Resource.ManagementGroup) : null,
  };
}

/**
 * `freeInWindow` is the set of resource keys free for a requested period, or
 * undefined when none was asked for. Only then does each unit carry
 * `availableForWindow`, so a client can tell "not asked" from "not free".
 */
export function toItemDetail(
  row: ItemTypeRow,
  freeInWindow?: Set<number>,
): Omit<ItemDetail, 'eligible'> {
  const isAvailable = freeInWindow
    ? freeInWindowPredicate(freeInWindow)
    : isUnitAvailable;

  return {
    ...toItemSummary(row, isAvailable),
    units: row.Items.map((unit) => ({
      id: unit.IndivKey,
      resourceKey: unit.ResourceKey,
      assetTag: unit.ItemID,
      imageUrl: unit.ImageURL,
      status: unit.Resource.ResourceStatus,
      allowBorrow: unit.Resource.AllowBorrow,
      condition: unit.Resource.CurrentCondition?.Condition ?? null,
      // Due date of the loan it is out on; a unit merely set aside is not out.
      dueAt:
        unit.Resource.UsageLogs[0]?.CurrentStatus === 'Lended'
          ? unit.Resource.UsageLogs[0].DueTime.toISOString()
          : null,
      nextAvailableAt: readyAtIso(unit),
      ...(freeInWindow ? { availableForWindow: isAvailable(unit) } : {}),
    })),
  };
}

function readyAtIso(unit: AvailabilityUnitRow): string | null {
  const at = unitReadyAt(unit);
  return at === null ? null : new Date(at).toISOString();
}

/**
 * "Free for this window": lendable at all (a window cannot fix a lost or
 * switched-off unit) and not blocked by a booking or a loan in the period.
 */
export function freeInWindowPredicate(
  freeInWindow: Set<number>,
): (unit: ItemUnitRow) => boolean {
  return (unit) => isBorrowable(unit) && freeInWindow.has(unit.ResourceKey);
}

export function toRoomSummary(row: RoomRow): RoomSummary {
  const resource = row.Resource;

  return {
    id: row.RoomKey,
    name: row.RoomName ?? `#${row.RoomKey}`,
    description: row.RoomDesc,
    location: row.RoomLocation,
    imageUrl: row.ImageURL,

    capacity: row.Capacity,

    tier: tryMapTier(resource.BorrowRuleInfo.RuleName),
    creditWeight: row.CreditWeight,

    status: resource.ResourceStatus,
    allowBorrow: resource.AllowBorrow,
    bookable: resource.AllowBorrow && resource.ResourceStatus === 'InStorage',

    owner: toOwner(resource.ManagementGroup),
  };
}
