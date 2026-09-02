import { clashingWindowFilter, withBuffer } from './booking-window';

/**
 * The overlap rule, which decides whose request gets cancelled.
 *
 * Every case below is a real complaint waiting to happen: a room that cannot
 * be booked back to back, or two people promised the same multimeter.
 */

const at = (iso: string) => new Date(iso);

describe('withBuffer', () => {
  it('pads both ends, because the delay belongs to the unit', () => {
    const { from, to } = withBuffer(
      at('2026-09-10T03:00:00Z'),
      at('2026-09-12T03:00:00Z'),
      1,
    );
    expect(from).toEqual(at('2026-09-09T03:00:00Z'));
    expect(to).toEqual(at('2026-09-13T03:00:00Z'));
  });

  it('leaves the window alone when the unit needs no preparation', () => {
    const start = at('2026-09-10T03:00:00Z');
    const end = at('2026-09-10T05:00:00Z');
    const { from, to } = withBuffer(start, end, 0);
    expect(from).toEqual(start);
    expect(to).toEqual(end);
  });
});

describe('clashingWindowFilter', () => {
  const filter = clashingWindowFilter(
    7,
    at('2026-09-09T00:00:00Z'),
    at('2026-09-13T00:00:00Z'),
  );

  it('looks only at requests that still hold the unit', () => {
    // Rejected and Canceled rows are history; a query that counted them would
    // block a unit forever after one refusal.
    expect(filter.ApproveStatus).toEqual({ in: ['Pending', 'Approved'] });
  });

  it('is half-open, so back-to-back bookings do not collide', () => {
    // A slot ending exactly when the next begins must stay bookable, or every
    // consecutive lecture hour on a zero-buffer room is unreachable.
    expect(filter.StartTime).toEqual({ lt: at('2026-09-13T00:00:00Z') });
    expect(filter.EndTime).toEqual({ gt: at('2026-09-09T00:00:00Z') });
  });

  it('can exclude the request being decided', () => {
    // Approving a request must not find that request clashing with itself.
    const excluding = clashingWindowFilter(
      7,
      at('2026-09-09T00:00:00Z'),
      at('2026-09-13T00:00:00Z'),
      42,
    );
    expect(excluding.ReservationKey).toEqual({ not: 42 });
    expect(filter.ReservationKey).toBeUndefined();
  });
});
