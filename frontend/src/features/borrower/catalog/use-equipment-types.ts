import { useQuery } from "@tanstack/react-query";
import { CACHE } from "@/constants";
import { queryKeys } from "@/lib/query-client";
import { useTRPCClient } from "@/lib/trpc";
import { fetchAllPages } from "@/lib/paging";
import {
  toCatalogItem,
  toCatalogItemDetail,
  toUnitRow,
  type CatalogItemDetail,
} from "./item.adapter";
import type { CatalogItem, UnitRow } from "../mock-data";

/**
 * useEquipmentTypes - equipment catalogue list for the borrower view.
 *
 * The catalogue filters, sorts and counts across the whole result set on the
 * client, so it needs every item, not the first page. The server caps pageSize
 * at 100, so this walks the pages instead of asking for one huge one - asking
 * for 200 is simply rejected with a 400.
 *
 * If the catalogue ever grows past a few hundred items this should move to
 * server-side filtering, since the facet counts in the rail are the only
 * reason the whole set is needed.
 */

export function useEquipmentTypes(filters?: Record<string, unknown>) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: queryKeys.equipmentTypes(filters),
    queryFn: async (): Promise<CatalogItem[]> => {
      const rows = await fetchAllPages((page, pageSize) =>
        trpc.item.list.query({ page, pageSize }),
      );
      return rows.map(toCatalogItem);
    },
  });
}

/**
 * useEquipmentType - one catalogue item by id, for the detail page.
 *
 * Resolves to `null` when the id matches nothing, so a stale link renders the
 * empty state instead of surfacing an error. The server keys items by integer,
 * while routes carry strings, hence the parse.
 */
export function useEquipmentType(id: string | undefined) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: queryKeys.equipmentType(id ?? ""),
    queryFn: async (): Promise<CatalogItemDetail | null> => {
      const numericId = itemKey(id);
      if (numericId === null) return null;

      try {
        // `item.getById` answers itemDetail — the summary *and* every unit —
        // so the units table below costs no second request.
        return toCatalogItemDetail(await trpc.item.getById.query({ id: numericId }));
      } catch {
        return null;
      }
    },
    enabled: Boolean(id),
  });
}

/**
 * useEquipmentAvailability - live stock for one item, refreshed while the
 * detail page is open.
 *
 * Separate from useEquipmentType because the two have different lifetimes: the
 * name, tier and unit list of an item change about never, while how many are
 * free changes every time somebody walks up to the counter. Refetching the
 * whole detail on a timer would re-render the page to change one number.
 *
 * `item.getAvailability` is built for this — three numbers, no unit list.
 */
export function useEquipmentAvailability(id: string | undefined) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: queryKeys.equipmentAvailability(id ?? ""),
    queryFn: async () => {
      const numericId = itemKey(id);
      if (numericId === null) return null;
      return trpc.item.getAvailability.query({ id: numericId });
    },
    enabled: Boolean(id),
    refetchInterval: CACHE.AVAILABILITY_POLL_MS,
    // A stale count is worse than a brief flicker: it decides whether the
    // "add to request" button is enabled.
    staleTime: 0,
  });
}

/**
 * useEquipmentUnits - the serials of one item, for the request page's T2
 * picker.
 *
 * The catalogue list (`item.list`) carries no units, so a T2 line has to ask
 * for them by id. The detail page does not use this — it already has them.
 */
export function useEquipmentUnits(id: string | undefined) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: queryKeys.equipmentUnits(id ?? ""),
    queryFn: async (): Promise<UnitRow[]> => {
      const numericId = itemKey(id);
      if (numericId === null) return [];
      return (await trpc.item.listUnits.query({ id: numericId })).map(toUnitRow);
    },
    enabled: Boolean(id),
  });
}

/**
 * Route params are strings and the server keys items by integer. Anything that
 * is not a positive integer is a bad link, not a request worth sending.
 */
function itemKey(id: string | undefined): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}
