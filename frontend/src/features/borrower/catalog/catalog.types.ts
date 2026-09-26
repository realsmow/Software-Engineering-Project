/**
 * Borrower catalogue view types: the CatalogItem shape the catalog/detail/
 * request pages render, and the equipment unit shape backing them.
 */
import type { EquipmentType, Tier } from "@/types/domain";

/**
 * Catalog row = the domain EquipmentType plus the columns the catalog table
 * shows. `code` (asset tag) and `owner` are not on EquipmentType yet;
 * they live here as a view type so the shared domain contract stays untouched
 * until the backend schema is final.
 */
export interface CatalogItem extends Omit<EquipmentType, "tier"> {
  /**
   * The signed-in borrower may borrow this at all, by the rule loan.create
   * applies. False means every request for it would be refused NOT_ELIGIBLE.
   */
  eligible: boolean;
  /**
   * Null when the server cannot determine one: a type with no units yet, or
   * units sitting on a BorrowRule outside T0-T3. A tier decides who approves a
   * request, so it is carried as unknown rather than defaulted - guessing T0
   * would auto-approve something nobody has classified.
   */
  tier: Tier | null;
  /** Asset tag printed on the item, e.g. "EE-MM-001". */
  code: string;
  /** Stable ManagementGroup identity supplied by the catalogue backend. */
  owner: {
    id: string;
    name: string | null;
    type: "Faculty" | "Club";
  } | null;
  stockStatus: StockStatus;
  /**
   * Free-text blurb shown on the detail page: what it is, key specs, and any
   * handling note. Thai-only like `name` - this is DB content, not UI copy.
   * Optional so an item added without one simply hides the section.
   */
  description?: string;
}

/** Stock state shown in the filter rail - availability is a separate number. */
export type StockStatus = "ok" | "queue" | "maintenance";

export const STOCK_STATUSES: StockStatus[] = ["ok", "queue", "maintenance"];

/* ==================== Equipment units (serials) ==================== */

export type UnitState = "free" | "fix" | "out";
export type UnitCondition = "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing";

export interface UnitRow {
  /** ResourceInfo key when this row came from the backend. */
  resourceKey?: number;
  /** Serial printed on the unit, e.g. "EE-OSC-014-01". */
  serial: string;
  state: UnitState;
  /** Latest condition recorded by staff; null when the unit has never been assessed. */
  condition: UnitCondition | null;
  /** Backend-computed return date plus this unit's preparation time. */
  nextAvailableAt?: string;
}
