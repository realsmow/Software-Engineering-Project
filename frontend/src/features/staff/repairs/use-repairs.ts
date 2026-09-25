import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import { fetchAllPages } from "@/lib/paging";
import type { ConditionType } from "@/features/staff/queue/queue.types";
import type {
  ManagedItemDetail,
  ManagedItemType,
  ManagedRoom,
} from "@/features/staff/inventory/inventory.types";
import type {
  InspectionHistoryEntry,
  Repair,
  RoomCheckResult,
  RoomCheckRound,
} from "./repairs.types";

/**
 * The repair workshop's data layer (R02 "การติดตามการซ่อมบำรุง").
 *
 * Not polled. A repair moves when a staff member moves it, and the list is
 * short enough that a stale row costs nothing; the counter queue polls because
 * borrowers put work into it, which is not true here.
 *
 * The router is now typed from the real backend (api-types.d.ts), so these
 * calls need no local casts - `repairs.types.ts` keeps its own interfaces
 * only because the page groups fields differently than the wire shape.
 */
const REPAIRS_KEY = ["staff", "repairs"] as const;

/**
 * The workshop list.
 *
 * `openOnly` is the server's own default and the only view that means "work to
 * do"; the closed rows are here so a unit's repair record can be read back,
 * which is the other half of R02.
 */
export function useRepairs(openOnly: boolean) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...REPAIRS_KEY, "list", openOnly],
    queryFn: async (): Promise<Repair[]> =>
      fetchAllPages((page, pageSize) =>
        trpc.inspection.listRepairs.query({ page, pageSize, openOnly }),
      ),
  });
}

/**
 * Refetch the workshop and everything a repair moves.
 *
 * Starting and finishing a repair both flip `AllowBorrow` on the unit, so the
 * inventory list and the borrower catalogue are stale the moment either one
 * returns.
 */
function useRefreshRepairs() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: REPAIRS_KEY });
    void queryClient.invalidateQueries({ queryKey: ["staff", "inventory"] });
    void queryClient.invalidateQueries({ queryKey: ["equipment-types"] });
  };
}

/**
 * Send a unit to repair.
 *
 * The server writes a ConditionLog of its own when the unit has never had one,
 * so this works on a unit whose damage was recorded outside the inspection desk
 * as well as on one that was just graded B2/B3.
 */
export function useStartRepair() {
  const trpc = useTRPCClient();
  const refresh = useRefreshRepairs();

  return useMutation({
    mutationFn: async (input: {
      resourceKey: number;
      note?: string;
    }): Promise<Repair> => trpc.inspection.startRepair.mutate(input),
    onSuccess: refresh,
  });
}

/**
 * Close a repair with the condition the unit came out in.
 *
 * The condition is the decision, not a label: anything the server counts as
 * usable puts the unit back on the shelf, and anything worse leaves it out.
 * Refused with ALREADY_DECIDED if somebody else closed it first.
 */
export function useFinishRepair() {
  const trpc = useTRPCClient();
  const refresh = useRefreshRepairs();

  return useMutation({
    mutationFn: async (input: {
      repairKey: number;
      condition: ConditionType;
      note?: string;
    }): Promise<Repair> => trpc.inspection.finishRepair.mutate(input),
    onSuccess: refresh,
  });
}

/**
 * Record the result of a room walk-round (T3).
 *
 * Refetches the room list because a non-Normal result closes the room to
 * bookings, and refuses outright on anything that is not a Room.
 */
/**
 * The room checks still waiting to be done.
 *
 * Every page is pulled rather than paged: a department has rooms in the tens,
 * and the list is a work queue somebody reads top to bottom.
 */
export function useRoomRounds(openOnly: boolean) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...REPAIRS_KEY, "rounds", openOnly],
    queryFn: async (): Promise<RoomCheckRound[]> =>
      fetchAllPages((page, pageSize) =>
        trpc.inspection.listRoomRounds.query({ page, pageSize, openOnly }),
      ),
  });
}

export function useRecordRoomCheck() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      resourceKey: number;
      condition: ConditionType;
      note?: string;
    }): Promise<RoomCheckResult> => trpc.inspection.recordRoomCheck.mutate(input),
    onSuccess: () => {
      // REPAIRS_KEY is the prefix the rounds list sits under, so answering a
      // check moves it out of the open list without a second invalidation.
      void queryClient.invalidateQueries({ queryKey: REPAIRS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["staff", "inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}

/**
 * Every grade this unit has ever been given.
 *
 * Keyed to the unit, not the loan, which is what makes a unit that keeps coming
 * back damaged visible. Fetched only when somebody opens the history.
 */
export function useUnitInspectionHistory(resourceKey: number | null) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...REPAIRS_KEY, "history", resourceKey],
    queryFn: async (): Promise<InspectionHistoryEntry[]> =>
      resourceKey === null
        ? []
        : trpc.inspection.listForResource.query({ resourceKey, limit: 20 }),
    enabled: resourceKey !== null,
  });
}

/**
 * What a repair can be opened against: the department's equipment types and its
 * rooms.
 *
 * Both are read from the `item` domain because `startRepair` takes a
 * ResourceKey and a room is a Resource like any other. Types come back without
 * their units - picking a type then fetches them, which keeps this from pulling
 * every unit the department owns to fill a picker nobody may open.
 */
export function useRepairTargets() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...REPAIRS_KEY, "targets"],
    queryFn: async (): Promise<{
      types: ManagedItemType[];
      rooms: ManagedRoom[];
    }> => {
      const [types, rooms] = await Promise.all([
        fetchAllPages((page, pageSize) =>
          trpc.item.listManaged.query({ page, pageSize }),
        ),
        fetchAllPages((page, pageSize) =>
          trpc.item.listManagedRooms.query({ page, pageSize }),
        ),
      ]);
      return { types, rooms };
    },
  });
}

/** The units of one type, for the picker. */
export function useRepairTargetUnits(itemKey: number | null) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...REPAIRS_KEY, "targetUnits", itemKey],
    queryFn: async (): Promise<ManagedItemDetail | null> =>
      itemKey === null ? null : trpc.item.getManagedById.query({ itemKey }),
    enabled: itemKey !== null,
  });
}
