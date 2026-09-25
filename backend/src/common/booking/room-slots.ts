import { BusinessError } from '../errors/business-error';
import { localTimeToUtc, toLocalDayKey } from '../schemas/datetime.schema';

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
 *
 * FR-EQP-04: opening hours are per room (RoomInfo.OpenTime/CloseTime/
 * BreakStart/BreakEnd, minutes past local midnight), not a fixed grid. Every
 * function below therefore takes the room's own `RoomHours` rather than
 * reading a module-level constant, so a room with different hours computes
 * its own strip without touching any other room's.
 */

/** Matches the frontend's `LIMITS.ROOM_SLOT_MINUTES`. Global — not per room. */
export const ROOM_SLOT_MINUTES = 30;

/**
 * Matches the frontend's `LIMITS.MAX_ROOM_BOOKING_SLOTS` — 3 hours.
 *
 * A cap on one booking, not on the day: the borrower may hold slots in the
 * morning and more in the afternoon, subject to the separate T3 concurrency
 * limit. What it stops is one person taking the room from opening to closing.
 * Global, like the slot length — decided to stay fixed even though hours now
 * vary per room.
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
 * A room's opening hours, minutes past local midnight — the same unit
 * RoomInfo.OpenTime/CloseTime/BreakStart/BreakEnd are stored in.
 *
 * `breakStartMinutes`/`breakEndMinutes` are both present or both null: a room
 * with no break is open `[openMinutes, closeMinutes)` in one run; one with a
 * break is open in two, exactly like the old fixed grid's 07:00-12:00 and
 * 13:00-18:00.
 */
export interface RoomHours {
  openMinutes: number;
  closeMinutes: number;
  breakStartMinutes: number | null;
  breakEndMinutes: number | null;
}

/**
 * The grid every room used before per-room hours existed: 07:00-12:00 and
 * 13:00-18:00. Also the column defaults in the room_opening_hours migration,
 * so a room nobody has edited computes exactly this.
 */
export const DEFAULT_ROOM_HOURS: RoomHours = {
  openMinutes: 7 * 60,
  closeMinutes: 18 * 60,
  breakStartMinutes: 12 * 60,
  breakEndMinutes: 13 * 60,
};

/** RoomInfo's own columns -> the shape every function here takes. */
export function toRoomHours(room: {
  OpenTime: number;
  CloseTime: number;
  BreakStart: number | null;
  BreakEnd: number | null;
}): RoomHours {
  return {
    openMinutes: room.OpenTime,
    closeMinutes: room.CloseTime,
    breakStartMinutes: room.BreakStart,
    breakEndMinutes: room.BreakEnd,
  };
}

export interface RoomSlot {
  /** `"07:00"` — start of the period, and the chip's label. */
  start: string;
  /** `"07:30"` — end of the period. */
  end: string;
}

function toHhmm(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** The open periods of the day, as half-open `[from, to)` minute ranges. */
function openPeriods(
  hours: RoomHours,
): ReadonlyArray<readonly [number, number]> {
  if (hours.breakStartMinutes === null || hours.breakEndMinutes === null) {
    return [[hours.openMinutes, hours.closeMinutes]];
  }
  return [
    [hours.openMinutes, hours.breakStartMinutes],
    [hours.breakEndMinutes, hours.closeMinutes],
  ];
}

/**
 * Refuses opening hours that are not on the 30-minute grid, backwards, or
 * carrying half a break.
 *
 * Called from item.management.service.ts before a room's hours are written,
 * so a bad pair never reaches the database — the migration's CHECK constraint
 * is the last line of defence, not the first.
 */
export function assertValidRoomHours(hours: RoomHours): void {
  const onGrid = (m: number) => m % ROOM_SLOT_MINUTES === 0;
  if (
    hours.openMinutes < 0 ||
    hours.openMinutes >= 24 * 60 ||
    hours.closeMinutes <= hours.openMinutes ||
    hours.closeMinutes > 24 * 60 ||
    !onGrid(hours.openMinutes) ||
    !onGrid(hours.closeMinutes)
  ) {
    throw new BusinessError('INVALID_ROOM_HOURS', {
      reason: 'OPEN_CLOSE',
      ...hours,
    });
  }

  const hasBreak = hours.breakStartMinutes !== null;
  if (hasBreak !== (hours.breakEndMinutes !== null)) {
    throw new BusinessError('INVALID_ROOM_HOURS', {
      reason: 'BREAK_INCOMPLETE',
      ...hours,
    });
  }
  if (hasBreak) {
    const start = hours.breakStartMinutes!;
    const end = hours.breakEndMinutes!;
    if (
      !onGrid(start) ||
      !onGrid(end) ||
      start < hours.openMinutes ||
      end > hours.closeMinutes ||
      start >= end
    ) {
      throw new BusinessError('INVALID_ROOM_HOURS', {
        reason: 'BREAK_OUT_OF_RANGE',
        ...hours,
      });
    }
  }
}

/**
 * The day's slots, in order, for one room's hours.
 *
 * Built from `openPeriods` rather than written out, so a room's hours are a
 * data value rather than a place every consumer re-derives the grid by hand.
 */
export function roomSlots(hours: RoomHours = DEFAULT_ROOM_HOURS): RoomSlot[] {
  return openPeriods(hours).flatMap(([from, to]) => {
    const slots: RoomSlot[] = [];
    for (let at = from; at + ROOM_SLOT_MINUTES <= to; at += ROOM_SLOT_MINUTES) {
      slots.push({ start: toHhmm(at), end: toHhmm(at + ROOM_SLOT_MINUTES) });
    }
    return slots;
  });
}

/** True when slot `a` ends exactly as slot `b` starts — a break is not adjacency. */
export function slotsAdjacent(hours: RoomHours, a: number, b: number): boolean {
  const slots = roomSlots(hours);
  const earlier = slots[Math.min(a, b)];
  const later = slots[Math.max(a, b)];
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
 *   - `ROOM_SLOTS_NOT_CONTIGUOUS` — a gap, including one that is only a break
 *     in the room's hours: two slots either side of it are neighbours in the
 *     list and not adjacent on the clock
 *
 * The result is half-open, matching `clashingWindowFilter`: a booking ending
 * at 10:00 does not collide with one starting at 10:00.
 */
export function slotsToWindow(
  hours: RoomHours,
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

  const slots = roomSlots(hours);

  // Sorted and de-duplicated first: the chips are tapped in whatever order the
  // borrower likes, and two taps of the same chip must not read as two slots.
  const ordered = [...new Set(slotIndices)].sort((a, b) => a - b);

  for (const index of ordered) {
    if (!slots[index]) {
      throw new BusinessError('ROOM_SLOT_OUT_OF_RANGE', {
        slot: index,
        slotCount: slots.length,
      });
    }
  }
  for (let i = 1; i < ordered.length; i++) {
    if (!slotsAdjacent(hours, ordered[i - 1], ordered[i])) {
      throw new BusinessError('ROOM_SLOTS_NOT_CONTIGUOUS', { slots: ordered });
    }
  }

  return {
    startTime: localTimeToUtc(dayKey, slots[ordered[0]].start),
    endTime: localTimeToUtc(dayKey, slots[ordered.at(-1)!].end),
  };
}

/** The instants one slot occupies on a given day. */
export function slotWindow(
  hours: RoomHours,
  dayKey: string,
  slotIndex: number,
): { startTime: Date; endTime: Date } {
  const slot = roomSlots(hours)[slotIndex];
  if (!slot) {
    throw new BusinessError('ROOM_SLOT_OUT_OF_RANGE', {
      slot: slotIndex,
      slotCount: roomSlots(hours).length,
    });
  }
  return {
    startTime: localTimeToUtc(dayKey, slot.start),
    endTime: localTimeToUtc(dayKey, slot.end),
  };
}

/** The whole day, used to fetch the bookings that could touch any slot. */
export function dayWindow(
  hours: RoomHours,
  dayKey: string,
): { from: Date; to: Date } {
  const slots = roomSlots(hours);
  return {
    from: localTimeToUtc(dayKey, slots[0].start),
    to: localTimeToUtc(dayKey, slots.at(-1)!.end),
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
  hours: RoomHours,
  dayKey: string,
  booked: readonly BookedWindow[],
): Array<RoomSlot & { index: number; available: boolean }> {
  return roomSlots(hours).map((slot, index) => {
    const { startTime, endTime } = slotWindow(hours, dayKey, index);
    const taken = booked.some(
      (window) => window.startTime < endTime && window.endTime > startTime,
    );
    return { ...slot, index, available: !taken };
  });
}

/**
 * A window someone sent as two instants, checked against the room's slot
 * grid.
 *
 * `loan.create` takes instants, and a room is a resource like any other, so
 * without this a room could be booked 13:10-13:40, 22:00-01:00, for seven
 * slots, or five days out: the grid, the three-hour cap and the same-day rule
 * lived only on the booking screen. This maps the window back onto the slots
 * and runs it through `slotsToWindow`, so both entry points share one rule.
 */
export function assertRoomWindow(
  hours: RoomHours,
  startTime: Date,
  endTime: Date,
  now = new Date(),
): void {
  const dayKey = toLocalDayKey(startTime);
  if (dayKey !== toLocalDayKey(now)) {
    throw new BusinessError('ROOM_BOOKING_SAME_DAY_ONLY', { date: dayKey });
  }
  const slots = roomSlots(hours);
  const first = slots.findIndex(
    (s) => localTimeToUtc(dayKey, s.start).getTime() === startTime.getTime(),
  );
  const last = slots.findIndex(
    (s) => localTimeToUtc(dayKey, s.end).getTime() === endTime.getTime(),
  );
  if (first === -1 || last === -1 || last < first) {
    throw new BusinessError('ROOM_SLOT_OUT_OF_RANGE', {
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });
  }
  slotsToWindow(
    hours,
    dayKey,
    Array.from({ length: last - first + 1 }, (_, i) => first + i),
  );
}
