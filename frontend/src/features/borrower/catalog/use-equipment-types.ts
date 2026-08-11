import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-client";
import { CATALOG_ITEMS, type CatalogItem } from "../mock-data";

/**
 * useEquipmentTypes — equipment catalog list for the borrower view.
 *
 * No API is wired yet (brief note #5): the queryFn returns typed mock data from
 * `features/borrower/mock-data.ts` so the catalog page can render. When the
 * backend lands, swap the queryFn for an apiClient call to GET /equipment-types
 * (keys already live in query-client) — filtering/sorting stays client-side
 * until the endpoint supports query params.
 */
export function useEquipmentTypes(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.equipmentTypes(filters),
    queryFn: async (): Promise<CatalogItem[]> => CATALOG_ITEMS,
  });
}

/**
 * useEquipmentType — one catalog item by id, for the detail page.
 * Resolves to `null` when the id matches nothing (deleted item, bad link).
 * Swap the queryFn for GET /equipment-types/:id when the backend lands.
 */
export function useEquipmentType(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.equipmentType(id ?? ""),
    queryFn: async (): Promise<CatalogItem | null> =>
      CATALOG_ITEMS.find((it) => it.id === id) ?? null,
    enabled: Boolean(id),
  });
}
