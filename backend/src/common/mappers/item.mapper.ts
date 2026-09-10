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
  ResourceStatus: 'InStorage' | 'Lended' | 'Missing';
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
   * MUST be filtered to the loan currently holding this unit (CurrentStatus
   * 'Lended') and limited to one row. The mapper reads `dueAt` from the first
   * entry, so an unfiltered select would report a long-closed loan's due date.
   */
  UsageLogs: { DueTime: Date }[];
}

export interface ItemUnitRow {
  IndivKey: number;
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
  Resource: ResourceRow;
}

function toOwner(group: ManagementGroupRow) {
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
    ResourceStatus: 'InStorage' | 'Lended' | 'Missing';
    AllowBorrow: boolean;
    BufferTime: number;
    UsageLogs: { DueTime: Date }[];
  };
}

/** Free to borrow right now: in storage, and the resource is open for borrowing. */
export function isUnitAvailable(unit: AvailabilityUnitRow): boolean {
  return (
    unit.Resource.ResourceStatus === 'InStorage' && unit.Resource.AllowBorrow
  );
}

/** Could be borrowed eventually — excludes units that are lost or switched off. */
function isBorrowable(unit: ItemUnitRow): boolean {
  return (
    unit.Resource.ResourceStatus !== 'Missing' && unit.Resource.AllowBorrow
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
export function nextAvailableAt(units: AvailabilityUnitRow[]): string | null {
  if (units.some(isUnitAvailable)) return null;

  const readyAt = units
    .map((unit) => {
      const due = unit.Resource.UsageLogs[0]?.DueTime;
      return due == null
        ? null
        : due.getTime() + unit.Resource.BufferTime * DAY_MS;
    })
    .filter((at): at is number => at !== null);

  if (readyAt.length === 0) return null;
  return new Date(Math.min(...readyAt)).toISOString();
}

export function toItemSummary(row: ItemTypeRow): ItemSummary {
  const units = row.Items;
  const availableUnits = units.filter(isUnitAvailable).length;
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

    nextAvailableAt: nextAvailableAt(units),

    prepDays: first?.Resource.BufferTime ?? 0,
    allowBorrow: borrowableUnits > 0,

    owner: first ? toOwner(first.Resource.ManagementGroup) : null,
  };
}

export function toItemDetail(row: ItemTypeRow): ItemDetail {
  return {
    ...toItemSummary(row),
    units: row.Items.map((unit) => ({
      id: unit.IndivKey,
      assetTag: unit.ItemID,
      imageUrl: unit.ImageURL,
      status: unit.Resource.ResourceStatus,
      allowBorrow: unit.Resource.AllowBorrow,
      condition: unit.Resource.CurrentCondition?.Condition ?? null,
      dueAt: unit.Resource.UsageLogs[0]?.DueTime.toISOString() ?? null,
    })),
  };
}

export function toRoomSummary(row: RoomRow): RoomSummary {
  const resource = row.Resource;

  return {
    id: row.RoomKey,
    name: row.RoomName ?? `#${row.RoomKey}`,
    description: row.RoomDesc,
    location: row.RoomLocation,
    imageUrl: row.ImageURL,

    tier: tryMapTier(resource.BorrowRuleInfo.RuleName),
    creditWeight: row.CreditWeight,

    status: resource.ResourceStatus,
    allowBorrow: resource.AllowBorrow,
    bookable: resource.AllowBorrow && resource.ResourceStatus === 'InStorage',

    owner: toOwner(resource.ManagementGroup),
  };
}
