/**
 * Bookable time slots and capacity bands for T3 rooms.
 * TIME_SLOTS mirrors backend/src/common/booking/room-slots.ts.
 */

export interface TimeSlot {
  /** "07:00" - start of the 30-minute period, and the chip label. */
  start: string;
  /** "07:30" - end of the period. Stored so adjacency is a clock comparison. */
  end: string;
}

/**
 * 30-minute slots, 07:00–18:00. 12:00–13:00 is the lunch break and simply is
 * not on the list - which is why adjacency compares `end` to `start` rather
 * than array positions: 11:00 and 13:00 sit next to each other in this array
 * but are an hour apart on the clock, so a booking must not span them.
 */
export const TIME_SLOTS: TimeSlot[] = [
  { start: "07:00", end: "07:30" },
  { start: "07:30", end: "08:00" },
  { start: "08:00", end: "08:30" },
  { start: "08:30", end: "09:00" },
  { start: "09:00", end: "09:30" },
  { start: "09:30", end: "10:00" },
  { start: "10:00", end: "10:30" },
  { start: "10:30", end: "11:00" },
  { start: "11:00", end: "11:30" },
  { start: "11:30", end: "12:00" },
  { start: "13:00", end: "13:30" },
  { start: "13:30", end: "14:00" },
  { start: "14:00", end: "14:30" },
  { start: "14:30", end: "15:00" },
  { start: "15:00", end: "15:30" },
  { start: "15:30", end: "16:00" },
  { start: "16:00", end: "16:30" },
  { start: "16:30", end: "17:00" },
  { start: "17:00", end: "17:30" },
  { start: "17:30", end: "18:00" },
];

/** Capacity buckets for the filter rail - derived from `capacity`, not stored. */
export type CapacityBand = "s" | "m" | "l";

export const CAPACITY_BANDS: CapacityBand[] = ["s", "m", "l"];

export function capacityBand(capacity: number): CapacityBand {
  if (capacity <= 20) return "s";
  if (capacity <= 50) return "m";
  return "l";
}
