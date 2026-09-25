import type { Tier } from "@/types/domain";

/**
 * Rooms as the server describes them (`roomSummary` in
 * backend/src/item/item.schema.ts), and the shape the room pages render.
 *
 * Thinner than the mock this replaced, on purpose. The mock had a door-plate
 * code, a building id and a room type; RoomInfo has none of those columns, so
 * the pages filter on what does exist (name, location, capacity) rather than
 * inventing a mapping. Free slots are not a column either: they come from
 * `item.roomAvailability`, one room and one day at a time.
 */
export interface ServerRoom {
  id: number;
  name: string;
  description: string | null;
  /** Free text such as "อาคาร 2 ชั้น 3". The closest thing to a building. */
  location: string | null;
  imageUrl: string | null;
  /** Seats, or null when nobody has recorded it. Not zero. */
  capacity: number | null;
  tier: Tier | null;
  creditWeight: number;
  status: "InStorage" | "Lended" | "Missing";
  allowBorrow: boolean;
  /** Open for booking right now: switched on and actually there. */
  bookable: boolean;
  owner: { id: number; name: string | null; type: "Club" | "Faculty" } | null;
}

/** One half-hour chip (`roomSlotOutput`). */
export interface RoomSlot {
  /** Position in the day's slot list, and what `createRoomBooking` takes back. */
  index: number;
  /** "07:00", the chip label, on the counter's wall clock. */
  start: string;
  end: string;
  startTime: string;
  endTime: string;
  /** False when a booking covers any part of it, or it has already passed. */
  available: boolean;
}

/** A room's bookable day (`roomAvailabilityOutput`). */
export interface RoomDay {
  roomKey: number;
  date: string;
  slots: RoomSlot[];
  /** Echoed by the server so the chip limit cannot drift from the rule. */
  maxSlotsPerBooking: number;
  slotMinutes: number;
}

export interface Room {
  /** String because it arrives from a route param; the server keys by int. */
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  capacity: number | null;
  imageUrl: string | null;
  bookable: boolean;
}

export function toRoom(s: ServerRoom): Room {
  return {
    id: String(s.id),
    name: s.name,
    description: s.description,
    location: s.location,
    capacity: s.capacity,
    imageUrl: s.imageUrl,
    bookable: s.bookable,
  };
}

/** Route params are strings; anything that is not a positive integer is a bad link. */
export function roomKey(id: string | undefined): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}
