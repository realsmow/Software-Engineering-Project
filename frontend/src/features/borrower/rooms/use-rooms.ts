import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-client";
import { ROOMS, type Room } from "../mock-data";

/**
 * useRooms - bookable rooms and spaces for the borrower's room list.
 *
 * No API is wired yet: the queryFn returns typed mock data so the page can
 * render. When the backend lands, swap it for an apiClient call to
 * GET /facilities (the key already lives in query-client).
 */
export function useRooms() {
  return useQuery({
    queryKey: queryKeys.facilities,
    queryFn: async (): Promise<Room[]> => ROOMS,
  });
}

/**
 * useRoom - one room by id, for the booking page.
 * Resolves to `null` when the id matches nothing (removed room, bad link).
 */
export function useRoom(id: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.facilities, id ?? ""],
    queryFn: async (): Promise<Room | null> => ROOMS.find((r) => r.id === id) ?? null,
    enabled: Boolean(id),
  });
}
