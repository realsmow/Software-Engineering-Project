import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import { fetchAllPages } from "@/lib/paging";
import type { ManagedItemDetail, ManagedItemType, ManagedUnit } from "./inventory.types";

/**
 * The department's own equipment.
 *
 * Every query here is scoped server-side to what the caller has Authority
 * over, so nothing needs to pass a department: asking for "all managed items"
 * already means "all the ones I may manage".
 */
const INVENTORY_KEY = ["staff", "inventory"] as const;

export function useManagedItems() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...INVENTORY_KEY, "types"],
    queryFn: async (): Promise<ManagedItemType[]> =>
      fetchAllPages((page, pageSize) => trpc.item.listManaged.query({ page, pageSize })),
  });
}

/** One type with all its units. Fetched only when a row is opened. */
export function useManagedItem(itemKey: number | null) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...INVENTORY_KEY, "type", itemKey],
    queryFn: async (): Promise<ManagedItemDetail | null> =>
      itemKey === null ? null : trpc.item.getManagedById.query({ itemKey }),
    enabled: itemKey !== null,
  });
}

/**
 * Refetch inventory and the borrower-facing catalogue together.
 *
 * Taking a unit out of service changes what a borrower can see and request, so
 * leaving the catalogue cached would let someone add a withdrawn unit to a
 * basket until their next reload.
 */
function useRefreshInventory() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["equipment-types"] });
  };
}

/**
 * Maintenance switch.
 *
 * Refused by the server while a borrower is holding the unit, which is the
 * right place for that rule: the unit's state is the server's to know.
 */
export function useSetUnitLendable() {
  const trpc = useTRPCClient();
  const refresh = useRefreshInventory();

  return useMutation({
    mutationFn: (input: {
      resourceKey: number;
      lendable: boolean;
      reason?: string;
    }): Promise<ManagedUnit> => trpc.item.setUnitLendable.mutate(input),
    onSuccess: refresh,
  });
}

// item.setUnitCondition is deliberately not wrapped yet. It records damage
// found on the shelf, with no loan and therefore nobody to charge, which is a
// different action from withdrawing a unit and needs its own control rather
// than a second button squeezed into this row.
