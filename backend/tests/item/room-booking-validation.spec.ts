import {
  assertRoomWindow,
  DEFAULT_ROOM_HOURS,
} from '../../src/common/booking/room-slots';

// Bangkok's day can differ from the UTC date stored on a reservation.
describe('Room booking validation at local-day and opening-hours boundaries', () => {
  it('accepts a booking on the same Bangkok day even when its UTC date differs from now', () => {
    expect(() =>
      assertRoomWindow(
        DEFAULT_ROOM_HOURS,
        new Date('2031-09-26T00:00:00.000Z'), // 07:00 Bangkok
        new Date('2031-09-26T03:00:00.000Z'), // 10:00 Bangkok
        new Date('2031-09-25T23:30:00.000Z'), // 06:30 Bangkok, still September 26
      ),
    ).not.toThrow();
  });

  it('rejects a booking on the next Bangkok day even when its UTC date matches now', () => {
    const overnightHours = {
      openMinutes: 0,
      closeMinutes: 240,
      breakStartMinutes: null,
      breakEndMinutes: null,
    };

    expect(() =>
      assertRoomWindow(
        overnightHours,
        new Date('2031-09-26T17:00:00.000Z'), // 00:00 Bangkok, September 27
        new Date('2031-09-26T18:00:00.000Z'), // 01:00 Bangkok, September 27
        new Date('2031-09-26T09:00:00.000Z'), // 16:00 Bangkok, September 26
      ),
    ).toThrow(/ROOM_BOOKING_SAME_DAY_ONLY/);
  });

  it('validates raw booking times against the selected room hours and its lack of a lunch break', () => {
    const hours = {
      openMinutes: 540,
      closeMinutes: 1020,
      breakStartMinutes: null,
      breakEndMinutes: null,
    };
    const now = new Date('2031-09-26T00:00:00.000Z');

    expect(() =>
      assertRoomWindow(
        hours,
        new Date('2031-09-26T05:00:00.000Z'), // 12:00 Bangkok
        new Date('2031-09-26T07:00:00.000Z'), // 14:00 Bangkok
        now,
      ),
    ).not.toThrow();
    expect(() =>
      assertRoomWindow(
        hours,
        new Date('2031-09-26T00:00:00.000Z'), // 07:00, before this room opens
        new Date('2031-09-26T01:00:00.000Z'),
        now,
      ),
    ).toThrow(/ROOM_SLOT_OUT_OF_RANGE/);
  });
});
