import {
  MAX_ROOM_BOOKING_SLOTS,
  ROOM_SLOTS,
  dayWindow,
  markSlots,
  slotWindow,
  slotsAdjacent,
  slotsToWindow,
} from './room-slots';
import { BusinessError } from '../errors/business-error';

/**
 * The slot strip, which is the only thing a borrower sees of a room's day.
 *
 * Two mistakes are worth the whole file: putting the day's boundaries in UTC
 * (which moves every chip seven hours), and treating the lunch break as if it
 * were not there (which lets one booking run through an hour the room is shut).
 */

const DAY = '2026-09-16';

/** The index of a chip by its label, so the tests read like the UI. */
const at = (start: string) =>
  ROOM_SLOTS.findIndex((slot) => slot.start === start);

describe('ROOM_SLOTS', () => {
  it('covers 07:00-12:00 and 13:00-18:00 in half-hours', () => {
    expect(ROOM_SLOTS).toHaveLength(20);
    expect(ROOM_SLOTS[0]).toEqual({ start: '07:00', end: '07:30' });
    expect(ROOM_SLOTS[9]).toEqual({ start: '11:30', end: '12:00' });
    expect(ROOM_SLOTS[10]).toEqual({ start: '13:00', end: '13:30' });
    expect(ROOM_SLOTS.at(-1)).toEqual({ start: '17:30', end: '18:00' });
  });

  it('leaves the lunch hour out entirely', () => {
    expect(ROOM_SLOTS.some((slot) => slot.start === '12:00')).toBe(false);
    expect(ROOM_SLOTS.some((slot) => slot.start === '12:30')).toBe(false);
  });
});

describe('slotWindow', () => {
  it('reads the labels as Bangkok time, not UTC', () => {
    // 07:00 at the counter is midnight UTC. Getting this wrong is the bug
    // that makes the first chip of the day look like it is already over.
    expect(slotWindow(DAY, at('07:00')).startTime.toISOString()).toBe(
      '2026-09-16T00:00:00.000Z',
    );
    expect(slotWindow(DAY, at('13:00')).startTime.toISOString()).toBe(
      '2026-09-16T06:00:00.000Z',
    );
  });

  it('refuses an index the day does not have', () => {
    expect(() => slotWindow(DAY, ROOM_SLOTS.length)).toThrow(BusinessError);
  });
});

describe('dayWindow', () => {
  it('spans opening to closing, in UTC', () => {
    const { from, to } = dayWindow(DAY);
    expect(from.toISOString()).toBe('2026-09-16T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-09-16T11:00:00.000Z');
  });
});

describe('slotsAdjacent', () => {
  it('joins consecutive half-hours', () => {
    expect(slotsAdjacent(at('09:00'), at('09:30'))).toBe(true);
  });

  it('does not join across lunch, though the indices are consecutive', () => {
    expect(at('13:00') - at('11:30')).toBe(1);
    expect(slotsAdjacent(at('11:30'), at('13:00'))).toBe(false);
  });
});

describe('slotsToWindow', () => {
  it('turns a run of chips into one window', () => {
    const { startTime, endTime } = slotsToWindow(DAY, [
      at('09:00'),
      at('09:30'),
      at('10:00'),
    ]);
    expect(startTime.toISOString()).toBe('2026-09-16T02:00:00.000Z');
    expect(endTime.toISOString()).toBe('2026-09-16T03:30:00.000Z');
  });

  it('does not care what order they were tapped in', () => {
    const tapped = slotsToWindow(DAY, [at('10:00'), at('09:00'), at('09:30')]);
    const ordered = slotsToWindow(DAY, [at('09:00'), at('09:30'), at('10:00')]);
    expect(tapped).toEqual(ordered);
  });

  it('counts a chip tapped twice once', () => {
    const { endTime } = slotsToWindow(DAY, [at('09:00'), at('09:00')]);
    expect(endTime.toISOString()).toBe('2026-09-16T02:30:00.000Z');
  });

  it('refuses a gap', () => {
    expect(() => slotsToWindow(DAY, [at('09:00'), at('10:00')])).toThrow(
      /ROOM_SLOTS_NOT_CONTIGUOUS/,
    );
  });

  it('refuses a run that only the lunch break joins', () => {
    expect(() => slotsToWindow(DAY, [at('11:30'), at('13:00')])).toThrow(
      /ROOM_SLOTS_NOT_CONTIGUOUS/,
    );
  });

  it('refuses more than three hours', () => {
    const tooMany = Array.from(
      { length: MAX_ROOM_BOOKING_SLOTS + 1 },
      (_, i) => at('07:00') + i,
    );
    expect(() => slotsToWindow(DAY, tooMany)).toThrow(
      /ROOM_SLOT_LIMIT_EXCEEDED/,
    );
  });

  it('allows exactly three hours', () => {
    const full = Array.from(
      { length: MAX_ROOM_BOOKING_SLOTS },
      (_, i) => at('07:00') + i,
    );
    expect(slotsToWindow(DAY, full).endTime.toISOString()).toBe(
      '2026-09-16T03:00:00.000Z',
    );
  });

  it('refuses an index off the end of the day', () => {
    expect(() => slotsToWindow(DAY, [ROOM_SLOTS.length])).toThrow(
      /ROOM_SLOT_OUT_OF_RANGE/,
    );
  });

  it('refuses an empty selection', () => {
    expect(() => slotsToWindow(DAY, [])).toThrow(BusinessError);
  });
});

describe('markSlots', () => {
  const booked = (start: string, end: string) => ({
    startTime: new Date(start),
    endTime: new Date(end),
  });

  it('marks everything free when nothing is booked', () => {
    expect(markSlots(DAY, []).every((slot) => slot.available)).toBe(true);
  });

  it('greys out the slots a booking covers and no others', () => {
    // 09:00-10:00 Bangkok.
    const slots = markSlots(DAY, [
      booked('2026-09-16T02:00:00.000Z', '2026-09-16T03:00:00.000Z'),
    ]);
    expect(slots[at('08:30')].available).toBe(true);
    expect(slots[at('09:00')].available).toBe(false);
    expect(slots[at('09:30')].available).toBe(false);
    expect(slots[at('10:00')].available).toBe(true);
  });

  it('greys out both slots a booking straddles', () => {
    // 09:15-09:45 lines up with no boundary, and the room is free in neither
    // half-hour it touches.
    const slots = markSlots(DAY, [
      booked('2026-09-16T02:15:00.000Z', '2026-09-16T02:45:00.000Z'),
    ]);
    expect(slots[at('09:00')].available).toBe(false);
    expect(slots[at('09:30')].available).toBe(false);
  });

  it('does not grey out a slot a booking merely ends at', () => {
    const slots = markSlots(DAY, [
      booked('2026-09-16T01:30:00.000Z', '2026-09-16T02:00:00.000Z'),
    ]);
    expect(slots[at('09:00')].available).toBe(true);
  });
});
