import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { POLLING } from "@/constants";
import { queryKeys } from "@/lib/query-client";
import { fetchAllPages } from "@/lib/paging";
import { useTRPCClient } from "@/lib/trpc";
import { MY_REQUESTS_KEY } from "../loans/use-my-requests-api";
import { roomKey, toRoom, type Room, type RoomDay } from "./room.adapter";

/** Every room, bookable or not: a closed room is still worth seeing on the list. */
export function useRooms() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: queryKeys.facilities,
    queryFn: async (): Promise<Room[]> =>
      (await fetchAllPages((page, pageSize) => trpc.item.listRooms.query({ page, pageSize }))).map(
        toRoom,
      ),
  });
}

/** One room by id. `null` when the id matches nothing, so a stale link shows the empty state. */
export function useRoom(id: string | undefined) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...queryKeys.facilities, id ?? ""],
    queryFn: async (): Promise<Room | null> => {
      const key = roomKey(id);
      if (key === null) return null;
      try {
        return toRoom(await trpc.item.getRoomById.query({ id: key }));
      } catch {
        return null;
      }
    },
    enabled: Boolean(id),
  });
}

/**
 * One room's slots for one Bangkok day.
 *
 * Polled like the catalogue counts: somebody else booking the 10:00 chip while
 * this page is open should grey it out here before the borrower taps it.
 */
export function useRoomDay(id: string | undefined, date: string) {
  const trpc = useTRPCClient();
  const key = roomKey(id);

  return useQuery({
    queryKey: queryKeys.facilitySlots(id ?? "", date),
    queryFn: (): Promise<RoomDay> =>
      trpc.item.roomAvailability.query({ roomKey: key as number, date }),
    enabled: key !== null,
    refetchInterval: POLLING.AVAILABILITY,
    staleTime: 0,
  });
}

/**
 * Open slots per room for one day, for the list.
 *
 * ponytail: one roomAvailability call per room. Fine at the tens of rooms a
 * faculty has; past that, add a batch procedure that answers every room's day
 * in one query.
 */
export function useFreeSlots(rooms: Room[], date: string): Map<string, number> {
  const trpc = useTRPCClient();

  const results = useQueries({
    queries: rooms.map((room) => ({
      queryKey: queryKeys.facilitySlots(room.id, date),
      queryFn: (): Promise<RoomDay> =>
        trpc.item.roomAvailability.query({ roomKey: Number(room.id), date }),
      refetchInterval: POLLING.AVAILABILITY,
      staleTime: 0,
    })),
  });

  const free = new Map<string, number>();
  results.forEach((r, i) => {
    if (r.data) free.set(rooms[i].id, r.data.slots.filter((s) => s.available).length);
  });
  return free;
}

/**
 * Book a run of slots.
 *
 * The server answers with `created` and `rejected` rather than throwing when a
 * slot is taken, so a clash is reported through the result. The caller has to
 * read it: a promise that resolved is not a booking that exists.
 */
export function useCreateRoomBooking() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { roomKey: number; date: string; slots: number[]; reason?: string }) =>
      trpc.loan.createRoomBooking.mutate(input),
    onSuccess: () => {
      // The chips this booking took, and the list it will now appear in.
      void queryClient.invalidateQueries({ queryKey: queryKeys.facilities });
      void queryClient.invalidateQueries({ queryKey: MY_REQUESTS_KEY });
    },
  });
}
