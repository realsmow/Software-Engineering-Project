import {
  ROOM_SLOTS,
  MAX_ROOM_BOOKING_SLOTS,
  slotsToWindow,
  assertRoomWindow,
} from '../../src/common/booking/room-slots';

describe('Room booking validation through the real booking helpers', () => {
  const day = '2031-09-26';
  const now = new Date('2031-09-26T00:00:00.000Z');

  it('uses the real 30-minute grid and omits lunch from available operating hours', () => {
    expect(ROOM_SLOTS).toHaveLength(20);
    expect(ROOM_SLOTS[0].start).toBe('07:00');
    expect(ROOM_SLOTS.at(-1)!.end).toBe('18:00');
    expect(ROOM_SLOTS.some((slot) => slot.start.startsWith('12:'))).toBe(false);
    for (const slot of ROOM_SLOTS)
      expect(['00', '30']).toContain(slot.start.split(':')[1]);
  });

  it('rejects a booking exceeding six slots through the actual validator', () => {
    expect(() =>
      slotsToWindow(
        day,
        Array.from({ length: MAX_ROOM_BOOKING_SLOTS + 1 }, (_, index) => index),
      ),
    ).toThrow('ROOM_SLOT_LIMIT_EXCEEDED');
  });

  it('rejects off-grid instants through the actual validator', () => {
    expect(() =>
      assertRoomWindow(
        new Date(day + 'T13:10:00+07:00'),
        new Date(day + 'T13:40:00+07:00'),
        now,
      ),
    ).toThrow('ROOM_SLOT_OUT_OF_RANGE');
  });

  it('rejects off-hours and overnight windows through the actual validator', () => {
    expect(() =>
      assertRoomWindow(
        new Date(day + 'T22:00:00+07:00'),
        new Date('2031-09-27T01:00:00+07:00'),
        now,
      ),
    ).toThrow('ROOM_SLOT_OUT_OF_RANGE');
    expect(() => slotsToWindow(day, [9, 10])).toThrow(
      'ROOM_SLOTS_NOT_CONTIGUOUS',
    );
  });

  it('rejects a next-day booking and accepts a same-day booking', () => {
    const today = slotsToWindow(day, [0, 1]);
    expect(() =>
      assertRoomWindow(today.startTime, today.endTime, now),
    ).not.toThrow();
    const tomorrow = slotsToWindow('2031-09-27', [0, 1]);
    expect(() =>
      assertRoomWindow(tomorrow.startTime, tomorrow.endTime, now),
    ).toThrow('ROOM_BOOKING_SAME_DAY_ONLY');
  });

  it('allows exactly six contiguous slots and returns their UTC instants', () => {
    const window = slotsToWindow(
      day,
      Array.from({ length: MAX_ROOM_BOOKING_SLOTS }, (_, index) => index),
    );
    expect(window.startTime.toISOString()).toBe('2031-09-26T00:00:00.000Z');
    expect(window.endTime.toISOString()).toBe('2031-09-26T03:00:00.000Z');
    expect(() =>
      assertRoomWindow(window.startTime, window.endTime, now),
    ).not.toThrow();
  });
});
