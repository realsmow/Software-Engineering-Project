import type { CatalogItem } from "../mock-data";
import type { StockStatus } from "../mock-data";
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
  tier: Tier;
  creditWeight: number;
  totalUnits: number;
  availableUnits: number;
  stockStatus: StockStatus;
  nextAvailableAt: string | null;
  prepDays: number;
  allowBorrow: boolean;
  owner: { id: number; name: string | null; type: string };
}

export function toCatalogItem(s: ServerItem): CatalogItem {
  return {
    id: String(s.id),
    name: s.name,
    // No category table exists in the schema, so item.listCategories answers
    // NOT_IMPLEMENTED and there is nothing to map here. The catalogue's
    // category facet therefore matches nothing while data comes from the
    // server. Faking a value would make a broken filter look like it works.
    categoryId: "",
    tier: s.tier,
    imageUrl: s.imageUrl ?? undefined,
    creditWeight: s.creditWeight,
    prepDays: s.prepDays,
    totalUnits: s.totalUnits,
    availableUnits: s.availableUnits,
    nextAvailableAt: s.nextAvailableAt ?? undefined,
    allowBorrow: s.allowBorrow,
    // Asset tags live on the individual unit (ItemIndiv.ItemID), not on the
    // type, so a list row has no single code to show. item.listUnits has them
    // for the detail page.
    code: "",
    // Falls back to the group type ("Faculty" / "Club") because seeded groups
    // have no name yet; the dept facet still groups, just coarsely.
    departmentId: s.owner.name ?? s.owner.type,
    stockStatus: s.stockStatus,
    description: s.description ?? undefined,
  };
}
