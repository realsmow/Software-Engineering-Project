import type { Tier } from "@/types/domain";
import type { ConditionType, Paginated } from "@/features/staff/queue/queue.types";

/**
 * Managed equipment, mirroring the staff half of
 * backend/src/item/item.schema.ts.
 *
 * Distinct from the borrower catalogue on purpose. `item.list` answers "what
 * may I borrow"; `item.listManaged` answers "what does my department own",
 * which includes units nobody may borrow right now - broken, withdrawn, out on
 * loan - and is scoped per row to the caller's Authority.
 */

export type ResourceStatus = "InStorage" | "Lended" | "Missing" | "Retired";

/**
 * The department or club that owns a resource (ResourceInfo.ManagedBy).
 *
 * `id` rather than `manageGroupKey`: the server's `managementGroupRef` spells
 * it `id`, and this file said `manageGroupKey` until a live response was read
 * beside it. It is also what `item.listManagementGroups` answers, so the
 * owner shown on a unit and the option picked in a create form are one shape.
 */
export interface ManagementGroupRef {
  id: number;
  name: string | null;
  type: "Club" | "Faculty";
}

/** One equipment type, summarised across its units. */
export interface ManagedItemType {
  id: number;
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  /** ItemInfo.CreditWeight - what a damage penalty is sized from. */
  creditWeight: number;
  /**
   * Distinct tiers among this type's units.
   *
   * An array because nothing stops two units of one type sitting on different
   * BorrowRules. More than one element is a data problem worth showing rather
   * than hiding behind a "first tier wins".
   */
  tiers: Tier[];
  totalUnits: number;
  availableUnits: number;
  /** Baht, FR-EQP-01. Null when staff have not set one. */
  price: number | null;
  /** `suggestTierFromPrice(price)` on the server - advisory only. */
  suggestedTier: Tier | null;
}

export type PaginatedManagedItems = Paginated<ManagedItemType>;

/** One physical unit. */
export interface ManagedUnit {
  resourceKey: number;
  indivKey: number;
  itemKey: number;
  /** The serial printed on the sticker. */
  serialNo: string;
  imageUrl: string | null;
  tier: Tier | null;
  status: ResourceStatus;
  /** False while under maintenance or withdrawn. */
  lendable: boolean;
  prepDays: number;
  condition: ConditionType | null;
  conditionNote: string | null;
  conditionLoggedAt: string | null;
  managementGroup: ManagementGroupRef;
  /** Set while the unit is out; null when it is on the shelf. */
  currentDueAt: string | null;
}

export interface ManagedItemDetail extends ManagedItemType {
  units: ManagedUnit[];
}

/** One bookable room, mirroring `roomOutput` on the server. */
export interface ManagedRoom {
  resourceKey: number;
  roomKey: number;
  name: string | null;
  description: string | null;
  location: string | null;
  imageUrl: string | null;
  creditWeight: number;
  /** Null means nobody has recorded it, not that it seats nobody. */
  capacity: number | null;
  tier: Tier | null;
  status: ResourceStatus;
  lendable: boolean;
  condition: ConditionType | null;
  managementGroup: ManagementGroupRef;
  /** Minutes past local midnight, FR-EQP-04, on a 30-minute grid. */
  openMinutes: number;
  closeMinutes: number;
  /** Both null (no break) or both set - never one without the other. */
  breakStartMinutes: number | null;
  breakEndMinutes: number | null;
}

/** A BorrowRule row that maps to T0-T3, for the tier picker. */
export interface TierOption {
  borrowRuleKey: number;
  tier: Tier;
  name: string | null;
}

/**
 * Client-side mirror of the server's `suggestTierFromPrice` (FR-EQP-01), so
 * the "New equipment type" form can show the hint before the first save
 * round-trips it back. Advisory only - the server's own value on the saved
 * type is what actually gets shown afterwards.
 */
export function suggestTierFromPrice(price: number | null | undefined): Tier | null {
  if (price === null || price === undefined || Number.isNaN(price)) return null;
  if (price < 100) return "T0";
  if (price <= 1000) return "T1";
  return "T2";
}

/** Who filed or decided a retirement request. */
export interface RetirementStaffRef {
  accountKey: number;
  userId: string;
  name: string;
}

/**
 * A retirement request (FR-EQP-08), mirroring `retirementRequestOutput` on
 * the server. Shared with the supervisor's retirement queue, which answers
 * the same shape.
 */
export interface RetirementRequest {
  requestKey: number;
  resourceKey: number;
  kind: "equipment" | "room";
  resourceName: string | null;
  serialNo: string | null;
  reason: string;
  status: "Pending" | "Approved" | "Rejected" | "Canceled";
  requestedBy: RetirementStaffRef;
  requestedAt: string;
  decidedBy: RetirementStaffRef | null;
  decidedAt: string | null;
  decisionNote: string | null;
}
