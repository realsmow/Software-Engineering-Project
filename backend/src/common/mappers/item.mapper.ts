import { tierFromCreditWeight } from '../schemas/status.schema';
import type { ItemDetail, ItemSummary, RoomSummary } from '../../item/item.schema';

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

/** Free to borrow right now: in storage, and the resource is open for borrowing. */
function isAvailable(unit: ItemUnitRow): boolean {
  return unit.Resource.ResourceStatus === 'InStorage' && unit.Resource.AllowBorrow;
}

/** Could be borrowed eventually — excludes units that are lost or switched off. */
function isBorrowable(unit: ItemUnitRow): boolean {
  return unit.Resource.ResourceStatus !== 'Missing' && unit.Resource.AllowBorrow;
}

/**
 * Earliest moment a unit comes back, or null when one is already free.
 *
 * Returning null while stock exists is deliberate: "available now" and "back
 * on Friday" are different answers, and a date shown next to a positive
 * availability count reads as though the item were unavailable.
 */
function nextAvailableAt(units: ItemUnitRow[]): string | null {
  if (units.some(isAvailable)) return null;

  const dueTimes = units
    .map((unit) => unit.Resource.UsageLogs[0]?.DueTime)
    .filter((due): due is Date => due != null)
    .map((due) => due.getTime());

  if (dueTimes.length === 0) return null;
  return new Date(Math.min(...dueTimes)).toISOString();
}

export function toItemSummary(row: ItemTypeRow): ItemSummary {
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

    tier: tierFromCreditWeight(row.CreditWeight, 'Item'),
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

    // A room is T3 regardless of its credit weight — see tierFromCreditWeight.
    tier: tierFromCreditWeight(row.CreditWeight, 'Room'),
    creditWeight: row.CreditWeight,

    status: resource.ResourceStatus,
    allowBorrow: resource.AllowBorrow,
    bookable: resource.AllowBorrow && resource.ResourceStatus === 'InStorage',

    owner: toOwner(resource.ManagementGroup),
  };
}
