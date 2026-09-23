import { BusinessError } from '../errors/business-error';
import { localTimeToUtc } from '../schemas/datetime.schema';

/**
 * The bookable half-hours of a room's day (T3).
 *
 * Rooms are not booked by picking two instants the way equipment is. The
 * borrower is shown a strip of chips — 07:00, 07:30, … — and taps the ones
 * they want, so the unit the whole feature is expressed in is the slot, and
 * the window that reaches `Reservations` is derived from a run of them.
 *
 * Deriving it in one place matters because both halves of the feature have to
 * agree exactly: `roomAvailability` says which chips are greyed out, and the
 * booking then re-checks the same chips server-side. If those two disagreed by
 * a single slot, the UI would offer a chip that the mutation refuses.
 *
 * The times here are the counter's wall clock, in Bangkok. Every value that
 * leaves this file is UTC — see `localTimeToUtc`.
 */

/** Matches the frontend's `LIMITS.ROOM_SLOT_MINUTES`. */
export const ROOM_SLOT_MINUTES = 30;

/**
 * Matches the frontend's `LIMITS.MAX_ROOM_BOOKING_SLOTS` — 3 hours.
 *
 * A cap on one booking, not on the day: the borrower may hold slots in the
 * morning and more in the afternoon, subject to the separate T3 concurrency
 * limit. What it stops is one person taking the room from opening to closing.
 */
export const MAX_ROOM_BOOKING_SLOTS = 6;

/**
 * Matches the frontend's `BUSINESS.MAX_T3_ACTIVE_BOOKINGS`: one room held at a
 * time, pending or approved, until its window has passed.
 *
 * The frontend closed every "book" button past this, and nothing on the
 * server agreed, so anyone sending the request directly could hold every room
 * in the faculty. The check now lives in LoanRequestService.createOne, inside
 * the booking's own transaction, so it covers loan.create as well as
 * createRoomBooking and two requests sent together cannot both pass.
 */
export const MAX_ACTIVE_ROOM_BOOKINGS = 1;

/**
 * When the counter is open, in local time, as half-open `[from, to)` periods.
 *
 * 12:00–13:00 is missing because it is the lunch break, and that gap is the
 * reason slots are not simply "index × 30 minutes from 07:00": a booking may
 * not run through it, so 11:30 and 13:00 are neighbours in the list and an
 * hour apart on the clock.
 */
const OPEN_PERIODS: ReadonlyArray<readonly [string, string]> = [
  ['07:00', '12:00'],
  ['13:00', '18:00'],
];

export interface RoomSlot {
  /** `"07:00"` — start of the period, and the chip's label. */
  start: string;
  /** `"07:30"` — end of the period. */
  end: string;
}

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

function toHhmm(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * The day's slots, in order.
 *
 * Built from `OPEN_PERIODS` rather than written out, so changing the opening
 * hours is a two-line edit instead of a twenty-line list that someone has to
 * keep consistent with the frontend's copy.
 */
export const ROOM_SLOTS: readonly RoomSlot[] = OPEN_PERIODS.flatMap(
  ([from, to]) => {
    const slots: RoomSlot[] = [];
    for (
      let at = toMinutes(from);
      at + ROOM_SLOT_MINUTES <= toMinutes(to);
      at += ROOM_SLOT_MINUTES
    ) {
      slots.push({ start: toHhmm(at), end: toHhmm(at + ROOM_SLOT_MINUTES) });
    }
    return slots;
  },
);

/** True when slot `a` ends exactly as slot `b` starts — lunch is not adjacency. */
export function slotsAdjacent(a: number, b: number): boolean {
  const earlier = ROOM_SLOTS[Math.min(a, b)];
  const later = ROOM_SLOTS[Math.max(a, b)];
  if (!earlier || !later) return false;
  return earlier.end === later.start;
}

/**
 * A run of chosen slots -> the one window to store on the reservation.
 *
 * Refuses anything that is not a single unbroken run. Three separate rules are
 * being enforced and each has its own answer, because the frontend renders a
 * different message for each:
 *
 *   - `ROOM_SLOT_OUT_OF_RANGE` — an index that is not a slot at all
 *   - `ROOM_SLOT_LIMIT_EXCEEDED` — more than three hours in one booking
 *   - `ROOM_SLOTS_NOT_CONTIGUOUS` — a gap, including one that is only the
 *     lunch break: 11:30–12:00 and 13:00–13:30 are two bookings, not one
 *     three-hour hold on a room nobody can use in between
 *
 * The result is half-open, matching `clashingWindowFilter`: a booking ending
 * at 10:00 does not collide with one starting at 10:00.
 */
export function slotsToWindow(
  dayKey: string,
  slotIndices: readonly number[],
): { startTime: Date; endTime: Date } {
  if (slotIndices.length === 0) {
    throw new BusinessError('ROOM_SLOTS_NOT_CONTIGUOUS', { slots: [] });
  }
  if (slotIndices.length > MAX_ROOM_BOOKING_SLOTS) {
    throw new BusinessError('ROOM_SLOT_LIMIT_EXCEEDED', {
      picked: slotIndices.length,
      max: MAX_ROOM_BOOKING_SLOTS,
    });
  }

  // Sorted and de-duplicated first: the chips are tapped in whatever order the
  // borrower likes, and two taps of the same chip must not read as two slots.
  const ordered = [...new Set(slotIndices)].sort((a, b) => a - b);

  for (const index of ordered) {
    if (!ROOM_SLOTS[index]) {
      throw new BusinessError('ROOM_SLOT_OUT_OF_RANGE', {
        slot: index,
        slotCount: ROOM_SLOTS.length,
      });
    }
  }
  for (let i = 1; i < ordered.length; i++) {
    if (!slotsAdjacent(ordered[i - 1], ordered[i])) {
      throw new BusinessError('ROOM_SLOTS_NOT_CONTIGUOUS', { slots: ordered });
    }
  }

  return {
    startTime: localTimeToUtc(dayKey, ROOM_SLOTS[ordered[0]].start),
    endTime: localTimeToUtc(dayKey, ROOM_SLOTS[ordered.at(-1)!].end),
  };
}

/** The instants one slot occupies on a given day. */
export function slotWindow(
  dayKey: string,
  slotIndex: number,
): { startTime: Date; endTime: Date } {
  const slot = ROOM_SLOTS[slotIndex];
  if (!slot) {
    throw new BusinessError('ROOM_SLOT_OUT_OF_RANGE', {
      slot: slotIndex,
      slotCount: ROOM_SLOTS.length,
    });
  }
  return {
    startTime: localTimeToUtc(dayKey, slot.start),
    endTime: localTimeToUtc(dayKey, slot.end),
  };
}

/** The whole day, used to fetch the bookings that could touch any slot. */
export function dayWindow(dayKey: string): { from: Date; to: Date } {
  return {
    from: localTimeToUtc(dayKey, ROOM_SLOTS[0].start),
    to: localTimeToUtc(dayKey, ROOM_SLOTS.at(-1)!.end),
  };
}

/** A booking, reduced to what deciding "is this slot taken" needs. */
export interface BookedWindow {
  startTime: Date;
  endTime: Date;
}

/**
 * Marks each of the day's slots free or taken, given the day's bookings.
 *
 * Overlap rather than equality: a reservation is stored as one window over a
 * run of slots, and nothing constrains it to start on a slot boundary — a
 * staff-made or legacy booking of 09:15–09:45 has to grey out 09:00 and 09:30
 * both, because the room is not free in either.
 *
 * Whether a *past* slot counts as bookable is not decided here. This is a
 * statement about the room, and today's 07:00 is equally unavailable whether
 * someone booked it or it is simply four hours ago; the caller adds that.
 */
export function markSlots(
  dayKey: string,
  booked: readonly BookedWindow[],
): Array<RoomSlot & { index: number; available: boolean }> {
  return ROOM_SLOTS.map((slot, index) => {
    const { startTime, endTime } = slotWindow(dayKey, index);
    const taken = booked.some(
      (window) => window.startTime < endTime && window.endTime > startTime,
    );
    return { ...slot, index, available: !taken };
  });
}
