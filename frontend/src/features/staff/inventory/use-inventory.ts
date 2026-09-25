import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import { fetchAllPages } from "@/lib/paging";
import { queryKeys } from "@/lib/query-client";
import type { ConditionType } from "@/features/staff/queue/queue.types";
import type { Tier } from "@/types/domain";
import type {
  ManagedItemDetail,
  ManagedItemType,
  ManagedRoom,
  ManagedUnit,
  ManagementGroupRef,
  ResourceStatus,
  RetirementRequest,
  TierOption,
} from "./inventory.types";

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
    // Rooms are catalogue rows too, and registering or renaming one changes
    // what the borrower's facility list shows.
    void queryClient.invalidateQueries({ queryKey: queryKeys.facilities });
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

/**
 * Record what a unit is actually like, outside any loan.
 *
 * Not the same act as withdrawing one, which is why it is a separate control:
 * this grades the thing and charges nobody, while `setUnitLendable` decides
 * whether it may go out. Damage found during a return goes through
 * `inspection.create` instead, because there the borrower can be charged.
 */
export function useSetUnitCondition() {
  const trpc = useTRPCClient();
  const refresh = useRefreshInventory();

  return useMutation({
    mutationFn: (input: {
      resourceKey: number;
      condition: ConditionType;
      note?: string;
    }): Promise<ManagedUnit> => trpc.item.setUnitCondition.mutate(input),
    onSuccess: refresh,
  });
}

/**
 * Edit one catalogue type.
 *
 * Only the changed fields are sent; every one is optional server-side. Used so
 * far to attach a photo, which is the one property of a type the counter can
 * set without a full editing screen.
 */
export function useUpdateItemType() {
  const trpc = useTRPCClient();
  const refresh = useRefreshInventory();

  return useMutation({
    mutationFn: (input: {
      itemKey: number;
      name?: string;
      description?: string;
      imageUrl?: string;
      creditWeight?: number;
      /** `null` clears a price set by mistake; omit to leave it alone. */
      price?: number | null;
    }) => trpc.item.updateType.mutate(input),
    onSuccess: refresh,
  });
}

/**
 * Register a catalogue entry.
 *
 * A type on its own is not stock: it has no units, and therefore no tier,
 * until `item.createUnit` runs against it. The form says so rather than
 * letting staff think they have registered equipment.
 */
export function useCreateItemType() {
  const trpc = useTRPCClient();
  const refresh = useRefreshInventory();

  return useMutation({
    mutationFn: (input: {
      name: string;
      description?: string;
      imageUrl?: string;
      creditWeight: number;
      /** Baht, FR-EQP-01. Feeds the advisory `suggestedTier`. */
      price?: number;
    }): Promise<ManagedItemDetail> => trpc.item.createType.mutate(input),
    onSuccess: refresh,
  });
}

/** Refuses with HAS_HISTORY unless every unit of the type is already gone. */
export function useDeleteItemType() {
  const trpc = useTRPCClient();
  const refresh = useRefreshInventory();

  return useMutation({
    mutationFn: (input: { itemKey: number }): Promise<{ itemKey: number }> =>
      trpc.item.deleteType.mutate(input),
    onSuccess: refresh,
  });
}

/**
 * Register physical units of a type. Answers an ARRAY, not one unit.
 *
 * `quantity` registers a batch in one transaction and every row it wrote comes
 * back, so the counter can print the whole run of stickers at once. The serial
 * is suffixed per unit, which is why two boxes from the same batch are still
 * tellable apart at the desk.
 */
export function useCreateItemUnits() {
  const trpc = useTRPCClient();
  const refresh = useRefreshInventory();

  return useMutation({
    mutationFn: (input: {
      itemKey: number;
      manageGroupKey: number;
      tier: Tier;
      serialNo?: string;
      imageUrl?: string;
      prepDays?: number;
      lendable?: boolean;
      quantity?: number;
    }): Promise<ManagedUnit[]> => trpc.item.createUnit.mutate(input),
    onSuccess: refresh,
  });
}

/** Correct one unit: its serial, its tier, its prep days, its photo. */
export function useUpdateUnit() {
  const trpc = useTRPCClient();
  const refresh = useRefreshInventory();

  return useMutation({
    mutationFn: (input: {
      resourceKey: number;
      serialNo?: string;
      imageUrl?: string;
      tier?: Tier;
      prepDays?: number;
    }): Promise<ManagedUnit> => trpc.item.updateUnit.mutate(input),
    onSuccess: refresh,
  });
}

/**
 * Units of one type, filtered server-side.
 *
 * Separate from `useManagedItem`, which answers the type and its units in one
 * round trip for the inventory card. This one exists for callers that hold an
 * itemKey and want a narrowed set - the handover desk asking which units of
 * this type are on the shelf and lendable right now.
 */
export function useManagedUnits(
  itemKey: number | null,
  filters: { status?: ResourceStatus; lendable?: boolean } = {},
) {
  const trpc = useTRPCClient();
  const { status, lendable } = filters;

  return useQuery({
    queryKey: [...INVENTORY_KEY, "units", itemKey, status ?? null, lendable ?? null],
    queryFn: async (): Promise<ManagedUnit[]> =>
      itemKey === null
        ? []
        : trpc.item.listManagedUnits.query({
            itemKey,
            ...(status ? { status } : {}),
            ...(lendable === undefined ? {} : { lendable }),
          }),
    enabled: itemKey !== null,
  });
}

/** Refuses with HAS_HISTORY if the unit has any reservation, usage log, or image. */
export function useDeleteUnit() {
  const trpc = useTRPCClient();
  const refresh = useRefreshInventory();

  return useMutation({
    mutationFn: (input: { resourceKey: number }): Promise<{ resourceKey: number }> =>
      trpc.item.deleteUnit.mutate(input),
    onSuccess: refresh,
  });
}

/**
 * File a retirement request (FR-EQP-08) for a unit or room.
 *
 * Not a delete: the resource keeps its row and history, and a supervisor has
 * to approve before it actually leaves the pool. Refused with
 * RETIREMENT_ALREADY_PENDING while one request is already waiting, and with
 * RETIREMENT_BLOCKED_BY_ACTIVITY while the resource is out or has an
 * upcoming booking.
 */
export function useRequestRetirement() {
  const trpc = useTRPCClient();
  const refresh = useRefreshInventory();

  return useMutation({
    mutationFn: (input: { resourceKey: number; reason: string }): Promise<RetirementRequest> =>
      trpc.item.requestRetirement.mutate(input),
    onSuccess: refresh,
  });
}

/** Withdraws a still-pending retirement request the caller filed themselves. */
export function useCancelRetirement() {
  const trpc = useTRPCClient();
  const refresh = useRefreshInventory();

  return useMutation({
    mutationFn: (input: { requestKey: number }): Promise<RetirementRequest> =>
      trpc.item.cancelRetirement.mutate(input),
    onSuccess: refresh,
  });
}

/**
 * Rooms the department owns (T3).
 *
 * Whole set rather than a page: a department has tens of rooms, not
 * thousands, and the screen filters them by name as you type.
 */
export function useManagedRooms() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...INVENTORY_KEY, "rooms"],
    queryFn: async (): Promise<ManagedRoom[]> =>
      fetchAllPages((page, pageSize) => trpc.item.listManagedRooms.query({ page, pageSize })),
  });
}

/**
 * Register a room.
 *
 * `capacity` is left out when nobody has measured it. Recording the room now
 * and the seat count later beats typing a placeholder that nothing afterwards
 * can tell from a real figure.
 */
export function useCreateRoom() {
  const trpc = useTRPCClient();
  const refresh = useRefreshInventory();

  return useMutation({
    mutationFn: (input: {
      manageGroupKey: number;
      name: string;
      description?: string;
      location?: string;
      imageUrl?: string;
      creditWeight?: number;
      capacity?: number;
      lendable?: boolean;
      /** Minutes past midnight, 30-minute grid. Omit both for the 07:00-18:00 default. */
      openMinutes?: number;
      closeMinutes?: number;
      /** Omit both for the default 12:00-13:00 break; both null means no break. */
      breakStartMinutes?: number | null;
      breakEndMinutes?: number | null;
    }): Promise<ManagedRoom> => trpc.item.createRoom.mutate(input),
    onSuccess: refresh,
  });
}

/** Refuses with HAS_HISTORY if the room has any reservation, usage log, or image. */
export function useDeleteRoom() {
  const trpc = useTRPCClient();
  const refresh = useRefreshInventory();

  return useMutation({
    mutationFn: (input: { resourceKey: number }): Promise<{ resourceKey: number }> =>
      trpc.item.deleteRoom.mutate(input),
    onSuccess: refresh,
  });
}

/**
 * Edit a room.
 *
 * `capacity: null` clears a seat count, an omitted `capacity` leaves it alone.
 * The two have to stay distinguishable: "we measured it and it was wrong" is a
 * real edit, and without the explicit null a bad number could never be taken
 * back out.
 */
export function useUpdateRoom() {
  const trpc = useTRPCClient();
  const refresh = useRefreshInventory();

  return useMutation({
    mutationFn: (input: {
      resourceKey: number;
      name?: string;
      description?: string;
      location?: string;
      imageUrl?: string;
      creditWeight?: number;
      capacity?: number | null;
      openMinutes?: number;
      closeMinutes?: number;
      breakStartMinutes?: number | null;
      breakEndMinutes?: number | null;
    }): Promise<ManagedRoom> => trpc.item.updateRoom.mutate(input),
    onSuccess: refresh,
  });
}

/**
 * The tier picker's options, read from BorrowRule rather than hard-coded.
 *
 * A department may add rules of its own; the server returns only the four that
 * map to T0-T3, and registering against a key that is not configured is
 * refused outright, so the list has to come from there.
 */
export function useTierOptions() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...INVENTORY_KEY, "tiers"],
    queryFn: async (): Promise<TierOption[]> => trpc.item.listTiers.query(),
    staleTime: Infinity,
  });
}

/**
 * Departments and clubs the caller may register equipment into.
 *
 * Queried here rather than borrowed from the permissions screen's copy: that
 * folder belongs to another slice, and a create form that cannot be submitted
 * because a neighbouring feature renamed a hook is a worse trade than one
 * small duplicate query.
 */
export function useManagementGroupOptions() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...INVENTORY_KEY, "groups"],
    queryFn: async (): Promise<ManagementGroupRef[]> =>
      trpc.item.listManagementGroups.query(),
    staleTime: Infinity,
  });
}
