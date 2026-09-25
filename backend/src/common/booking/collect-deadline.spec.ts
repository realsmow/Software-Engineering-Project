import { collectDeadline } from './booking-window';

describe('collectDeadline', () => {
  const now = new Date('2026-09-24T02:00:00Z');

  it('counts the day from the start of an advance booking', () => {
    const start = new Date('2026-12-12T09:00:00Z');
    expect(collectDeadline(start, now)).toEqual(
      new Date('2026-12-13T09:00:00Z'),
    );
  });

  it('counts from now once the window is already open', () => {
    const start = new Date('2026-09-23T09:00:00Z');
    expect(collectDeadline(start, now)).toEqual(
      new Date('2026-09-25T02:00:00Z'),
    );
  });
});
