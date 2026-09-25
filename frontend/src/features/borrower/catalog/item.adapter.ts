import type { CatalogItem, StockStatus, UnitRow, UnitState } from "../mock-data";
import type { Tier } from "@/types/domain";

/**
 * The item shape the backend actually sends (`itemSummary` in
 * backend/src/item/item.schema.ts), converted to the `CatalogItem` the
 * catalogue UI was built against.
 *
 * Same reasoning as features/auth/user.adapter.ts: the server speaks in
 * database terms and the UI speaks in display terms, so the difference is
 * absorbed once, here, instead of rippling through the page.
 */
export interface ServerItem {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  /**
   * Null for a type with no units yet, or whose units sit on a BorrowRule
   * outside T0-T3. A tier belongs to a unit, not to the type - see
   * backend/src/common/schemas/status.schema.ts.
   */
  tier: Tier | null;
  creditWeight: number;
  totalUnits: number;
  availableUnits: number;
  stockStatus: StockStatus;
  nextAvailableAt: string | null;
  prepDays: number;
  allowBorrow: boolean;
  /** Whether the caller holds a (group, role) pair a rule on some unit names. */
  eligible: boolean;
  owner: { id: number; name: string | null; type: "Faculty" | "Club" } | null;
}

export function toCatalogItem(s: ServerItem): CatalogItem {
  return {
    id: String(s.id),
    name: s.name,
    // ItemInfo has no category column, so there is nothing to map here. The
    // catalogue's category facet matches nothing while data comes from the
    // server. Faking a value would make a broken filter look like it works.
    // Tier is unaffected: it comes from the unit's BorrowRule.
    categoryId: "",
    tier: s.tier,
    imageUrl: s.imageUrl ?? undefined,
    creditWeight: s.creditWeight,
    prepDays: s.prepDays,
    totalUnits: s.totalUnits,
    availableUnits: s.availableUnits,
    nextAvailableAt: s.nextAvailableAt ?? undefined,
    allowBorrow: s.allowBorrow,
    eligible: s.eligible,
    // Asset tags live on the individual unit (ItemIndiv.ItemID), not on the
    // type, so a list row has no single code to show. item.listUnits has them
    // for the detail page.
    code: "",
    // Keep the stable ManagementGroup key separate from its display name so
    // faculty branches and clubs can share one accurate owner filter.
    owner: s.owner
      ? { id: String(s.owner.id), name: s.owner.name, type: s.owner.type }
      : null,
    stockStatus: s.stockStatus,
    description: s.description ?? undefined,
  };
}

/**
 * One physical unit, as `itemUnit` in backend/src/item/item.schema.ts.
 *
 * `status` and `condition` mirror the Prisma enums the backend re-declares in
 * common/schemas/status.schema.ts, so they are spelled the DB's way here and
 * translated below - not renamed on the way in.
 */
export interface ServerItemUnit {
  id: number;
  /** ResourceInfo.ResourceKey - the identifier accepted by loan.create. */
  resourceKey: number;
  /** ItemIndiv.ItemID - the asset tag printed on the unit. */
  assetTag: string;
  imageUrl: string | null;
  status: "InStorage" | "Lended" | "Missing";
  allowBorrow: boolean;
  condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
  /** Due date of the loan holding this unit, when it is out. */
  dueAt: string | null;
  /** Due date plus this unit's preparation time. */
  nextAvailableAt: string | null;
  /** Whether this serial is free for the requested window from listUnits. */
  availableForWindow?: boolean;
}

/** `item.getById` answers `itemDetail` - the summary plus every unit. */
export interface ServerItemDetail extends ServerItem {
  units: ServerItemUnit[];
}

/** What the detail page renders: the catalogue row plus its real units. */
export interface CatalogItemDetail extends CatalogItem {
  units: UnitRow[];
}

/**
 * Five server states collapsed onto the three the UI has.
 *
 * The borrower is only ever asking "can I take this one today", so everything
 * that answers no falls into `out` (a borrower has it) or `fix` (it is here
 * and not lendable). `Missing` has no third bucket to go to and lands in
 * `fix`, which is the less wrong of the two: nobody is holding it on a loan.
 */
export function toUnitRow(u: ServerItemUnit): UnitRow {
  return {
    resourceKey: u.resourceKey,
    serial: u.assetTag,
    state: toUnitState(u),
    condition: u.condition,
    ...(u.nextAvailableAt ? { nextAvailableAt: u.nextAvailableAt } : {}),
  };
}

export function toUnitState(u: ServerItemUnit): UnitState {
  if (
    !u.allowBorrow ||
    u.status === "Missing" ||
    u.condition === "MajorDamage" ||
    u.condition === "Broken" ||
    u.condition === "Missing"
  ) {
    return "fix";
  }
  if (u.availableForWindow !== undefined) {
    return u.availableForWindow ? "free" : "out";
  }
  if (u.status === "Lended" || u.nextAvailableAt != null) return "out";
  return "free";
}

export function toCatalogItemDetail(s: ServerItemDetail): CatalogItemDetail {
  return { ...toCatalogItem(s), units: s.units.map(toUnitRow) };
}
