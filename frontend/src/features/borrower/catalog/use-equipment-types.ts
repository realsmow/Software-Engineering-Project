import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-client";
import { useTRPCClient } from "@/lib/trpc";
import { toCatalogItem } from "./item.adapter";
import type { CatalogItem } from "../mock-data";

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
const MAX_PAGE_SIZE = 100;
/** Guard against an unbounded loop if a server bug ever reports a wrong total. */
const MAX_PAGES = 20;

export function useEquipmentTypes(filters?: Record<string, unknown>) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: queryKeys.equipmentTypes(filters),
    queryFn: async (): Promise<CatalogItem[]> => {
      const first = await trpc.item.list.query({ page: 1, pageSize: MAX_PAGE_SIZE });
      const rows = [...first.items];

      const pages = Math.min(Math.ceil(first.total / MAX_PAGE_SIZE), MAX_PAGES);
      for (let page = 2; page <= pages; page++) {
        const next = await trpc.item.list.query({ page, pageSize: MAX_PAGE_SIZE });
        rows.push(...next.items);
      }

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
    queryFn: async (): Promise<CatalogItem | null> => {
      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= 0) return null;

      try {
        return toCatalogItem(await trpc.item.getById.query({ id: numericId }));
      } catch {
        return null;
      }
    },
    enabled: Boolean(id),
  });
}
