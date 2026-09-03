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

export type ResourceStatus = "InStorage" | "Lended" | "Missing";

export interface ManagementGroupRef {
  manageGroupKey: number;
  name: string | null;
  type: string;
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
