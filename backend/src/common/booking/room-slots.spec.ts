import {
  DEFAULT_ROOM_HOURS,
  MAX_ROOM_BOOKING_SLOTS,
  assertValidRoomHours,
  dayWindow,
  markSlots,
  roomSlots,
  slotWindow,
  slotsAdjacent,
  slotsToWindow,
  toRoomHours,
  type RoomHours,
} from './room-slots';
import { BusinessError } from '../errors/business-error';

/**
 * The slot strip, which is the only thing a borrower sees of a room's day.
 *
 * Two mistakes are worth the whole file: putting the day's boundaries in UTC
 * (which moves every chip seven hours), and treating a break as if it were not
 * there (which lets one booking run through an hour the room is shut).
 *
 * FR-EQP-04 made the hours a per-room value instead of one fixed grid, so most
 * tests below run against `DEFAULT_ROOM_HOURS` (the grid every room used
 * before that) and a separate section runs the same functions against a room
 * with different hours, to prove nothing here is secretly still hard-coded.
 */

const DAY = '2026-09-16';

/** The index of a chip by its label, so the tests read like the UI. */
const at = (hours: RoomHours, start: string) =>
  roomSlots(hours).findIndex((slot) => slot.start === start);
const atDefault = (start: string) => at(DEFAULT_ROOM_HOURS, start);

describe('roomSlots (default hours)', () => {
  it('covers 07:00-12:00 and 13:00-18:00 in half-hours', () => {
    const slots = roomSlots(DEFAULT_ROOM_HOURS);
    expect(slots).toHaveLength(20);
    expect(slots[0]).toEqual({ start: '07:00', end: '07:30' });
    expect(slots[9]).toEqual({ start: '11:30', end: '12:00' });
    expect(slots[10]).toEqual({ start: '13:00', end: '13:30' });
    expect(slots.at(-1)).toEqual({ start: '17:30', end: '18:00' });
  });

  it('leaves the break out entirely', () => {
    const slots = roomSlots(DEFAULT_ROOM_HOURS);
    expect(slots.some((slot) => slot.start === '12:00')).toBe(false);
    expect(slots.some((slot) => slot.start === '12:30')).toBe(false);
  });

  it('defaults to DEFAULT_ROOM_HOURS when called with no argument', () => {
    expect(roomSlots()).toEqual(roomSlots(DEFAULT_ROOM_HOURS));
  });
});

describe('slotWindow', () => {
  it('reads the labels as Bangkok time, not UTC', () => {
    // 07:00 at the counter is midnight UTC. Getting this wrong is the bug
    // that makes the first chip of the day look like it is already over.
    expect(
      slotWindow(
        DEFAULT_ROOM_HOURS,
        DAY,
        atDefault('07:00'),
      ).startTime.toISOString(),
    ).toBe('2026-09-16T00:00:00.000Z');
    expect(
      slotWindow(
        DEFAULT_ROOM_HOURS,
        DAY,
        atDefault('13:00'),
      ).startTime.toISOString(),
    ).toBe('2026-09-16T06:00:00.000Z');
  });

  it('refuses an index the day does not have', () => {
    expect(() =>
      slotWindow(DEFAULT_ROOM_HOURS, DAY, roomSlots(DEFAULT_ROOM_HOURS).length),
    ).toThrow(BusinessError);
  });
});

describe('dayWindow', () => {
  it('spans opening to closing, in UTC', () => {
    const { from, to } = dayWindow(DEFAULT_ROOM_HOURS, DAY);
    expect(from.toISOString()).toBe('2026-09-16T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-09-16T11:00:00.000Z');
  });
});

describe('slotsAdjacent', () => {
  it('joins consecutive half-hours', () => {
    expect(
      slotsAdjacent(DEFAULT_ROOM_HOURS, atDefault('09:00'), atDefault('09:30')),
    ).toBe(true);
  });

  it('does not join across the break, though the indices are consecutive', () => {
    expect(atDefault('13:00') - atDefault('11:30')).toBe(1);
    expect(
      slotsAdjacent(DEFAULT_ROOM_HOURS, atDefault('11:30'), atDefault('13:00')),
    ).toBe(false);
  });
});

describe('slotsToWindow', () => {
  it('turns a run of chips into one window', () => {
    const { startTime, endTime } = slotsToWindow(DEFAULT_ROOM_HOURS, DAY, [
      atDefault('09:00'),
      atDefault('09:30'),
      atDefault('10:00'),
    ]);
    expect(startTime.toISOString()).toBe('2026-09-16T02:00:00.000Z');
    expect(endTime.toISOString()).toBe('2026-09-16T03:30:00.000Z');
  });

  it('does not care what order they were tapped in', () => {
    const tapped = slotsToWindow(DEFAULT_ROOM_HOURS, DAY, [
      atDefault('10:00'),
      atDefault('09:00'),
      atDefault('09:30'),
    ]);
    const ordered = slotsToWindow(DEFAULT_ROOM_HOURS, DAY, [
      atDefault('09:00'),
      atDefault('09:30'),
      atDefault('10:00'),
    ]);
    expect(tapped).toEqual(ordered);
  });

  it('counts a chip tapped twice once', () => {
    const { endTime } = slotsToWindow(DEFAULT_ROOM_HOURS, DAY, [
      atDefault('09:00'),
      atDefault('09:00'),
    ]);
    expect(endTime.toISOString()).toBe('2026-09-16T02:30:00.000Z');
  });

  it('refuses a gap', () => {
    expect(() =>
      slotsToWindow(DEFAULT_ROOM_HOURS, DAY, [
        atDefault('09:00'),
        atDefault('10:00'),
      ]),
    ).toThrow(/ROOM_SLOTS_NOT_CONTIGUOUS/);
  });

  it('refuses a run that only the break joins', () => {
    expect(() =>
      slotsToWindow(DEFAULT_ROOM_HOURS, DAY, [
        atDefault('11:30'),
        atDefault('13:00'),
      ]),
    ).toThrow(/ROOM_SLOTS_NOT_CONTIGUOUS/);
  });

  it('refuses more than three hours', () => {
    const tooMany = Array.from(
      { length: MAX_ROOM_BOOKING_SLOTS + 1 },
      (_, i) => atDefault('07:00') + i,
    );
    expect(() => slotsToWindow(DEFAULT_ROOM_HOURS, DAY, tooMany)).toThrow(
      /ROOM_SLOT_LIMIT_EXCEEDED/,
    );
  });

  it('allows exactly three hours', () => {
    const full = Array.from(
      { length: MAX_ROOM_BOOKING_SLOTS },
      (_, i) => atDefault('07:00') + i,
    );
    expect(
      slotsToWindow(DEFAULT_ROOM_HOURS, DAY, full).endTime.toISOString(),
    ).toBe('2026-09-16T03:00:00.000Z');
  });

  it('refuses an index off the end of the day', () => {
    expect(() =>
      slotsToWindow(DEFAULT_ROOM_HOURS, DAY, [
        roomSlots(DEFAULT_ROOM_HOURS).length,
      ]),
    ).toThrow(/ROOM_SLOT_OUT_OF_RANGE/);
  });

  it('refuses an empty selection', () => {
    expect(() => slotsToWindow(DEFAULT_ROOM_HOURS, DAY, [])).toThrow(
      BusinessError,
    );
  });
});

describe('markSlots', () => {
  const booked = (start: string, end: string) => ({
    startTime: new Date(start),
    endTime: new Date(end),
  });

  it('marks everything free when nothing is booked', () => {
    expect(
      markSlots(DEFAULT_ROOM_HOURS, DAY, []).every((slot) => slot.available),
    ).toBe(true);
  });

  it('greys out the slots a booking covers and no others', () => {
    // 09:00-10:00 Bangkok.
    const slots = markSlots(DEFAULT_ROOM_HOURS, DAY, [
      booked('2026-09-16T02:00:00.000Z', '2026-09-16T03:00:00.000Z'),
    ]);
    expect(slots[atDefault('08:30')].available).toBe(true);
    expect(slots[atDefault('09:00')].available).toBe(false);
    expect(slots[atDefault('09:30')].available).toBe(false);
    expect(slots[atDefault('10:00')].available).toBe(true);
  });

  it('greys out both slots a booking straddles', () => {
    // 09:15-09:45 lines up with no boundary, and the room is free in neither
    // half-hour it touches.
    const slots = markSlots(DEFAULT_ROOM_HOURS, DAY, [
      booked('2026-09-16T02:15:00.000Z', '2026-09-16T02:45:00.000Z'),
    ]);
    expect(slots[atDefault('09:00')].available).toBe(false);
    expect(slots[atDefault('09:30')].available).toBe(false);
  });

  it('does not grey out a slot a booking merely ends at', () => {
    const slots = markSlots(DEFAULT_ROOM_HOURS, DAY, [
      booked('2026-09-16T01:30:00.000Z', '2026-09-16T02:00:00.000Z'),
    ]);
    expect(slots[atDefault('09:00')].available).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FR-EQP-04: a room with its own hours
// ---------------------------------------------------------------------------

describe('a room with custom hours', () => {
  /** 09:00-17:00, no break — a room open straight through lunch. */
  const NO_BREAK: RoomHours = {
    openMinutes: 9 * 60,
    closeMinutes: 17 * 60,
    breakStartMinutes: null,
    breakEndMinutes: null,
  };

  it('builds one unbroken run of slots when there is no break', () => {
    const slots = roomSlots(NO_BREAK);
    expect(slots).toHaveLength(16);
    expect(slots[0]).toEqual({ start: '09:00', end: '09:30' });
    expect(slots.at(-1)).toEqual({ start: '16:30', end: '17:00' });
    // The old lunch hour is bookable now — this room has no break.
    expect(slots.some((s) => s.start === '12:00')).toBe(true);
  });

  it('lets a booking run straight through where the default grid breaks', () => {
    const { startTime, endTime } = slotsToWindow(NO_BREAK, DAY, [
      at(NO_BREAK, '11:30'),
      at(NO_BREAK, '12:00'),
      at(NO_BREAK, '12:30'),
    ]);
    expect(startTime.toISOString()).toBe('2026-09-16T04:30:00.000Z');
    expect(endTime.toISOString()).toBe('2026-09-16T06:00:00.000Z');
  });

  it("does not accept a slot index built from a different room's hours", () => {
    // Index 20 does not exist on this 16-slot room, even though it is a valid
    // index on DEFAULT_ROOM_HOURS.
    expect(() => slotWindow(NO_BREAK, DAY, 20)).toThrow(BusinessError);
  });

  it('toRoomHours reads the four RoomInfo columns', () => {
    expect(
      toRoomHours({
        OpenTime: 540,
        CloseTime: 1020,
        BreakStart: null,
        BreakEnd: null,
      }),
    ).toEqual(NO_BREAK);
  });
});

describe('assertValidRoomHours', () => {
  it('accepts the default grid', () => {
    expect(() => assertValidRoomHours(DEFAULT_ROOM_HOURS)).not.toThrow();
  });

  it('accepts hours with no break', () => {
    expect(() =>
      assertValidRoomHours({
        openMinutes: 540,
        closeMinutes: 1020,
        breakStartMinutes: null,
        breakEndMinutes: null,
      }),
    ).not.toThrow();
  });

  it('refuses close before open', () => {
    expect(() =>
      assertValidRoomHours({
        openMinutes: 600,
        closeMinutes: 480,
        breakStartMinutes: null,
        breakEndMinutes: null,
      }),
    ).toThrow(/INVALID_ROOM_HOURS/);
  });

  it('refuses times off the 30-minute grid', () => {
    expect(() =>
      assertValidRoomHours({
        openMinutes: 545,
        closeMinutes: 1020,
        breakStartMinutes: null,
        breakEndMinutes: null,
      }),
    ).toThrow(/INVALID_ROOM_HOURS/);
  });

  it('refuses a break with only one end given', () => {
    expect(() =>
      assertValidRoomHours({
        openMinutes: 420,
        closeMinutes: 1080,
        breakStartMinutes: 720,
        breakEndMinutes: null,
      }),
    ).toThrow(/INVALID_ROOM_HOURS/);
  });

  it('refuses a break outside the open period', () => {
    expect(() =>
      assertValidRoomHours({
        openMinutes: 420,
        closeMinutes: 1080,
        breakStartMinutes: 360,
        breakEndMinutes: 780,
      }),
    ).toThrow(/INVALID_ROOM_HOURS/);
  });

  it('refuses a break that starts after it ends', () => {
    expect(() =>
      assertValidRoomHours({
        openMinutes: 420,
        closeMinutes: 1080,
        breakStartMinutes: 780,
        breakEndMinutes: 720,
      }),
    ).toThrow(/INVALID_ROOM_HOURS/);
  });
});
