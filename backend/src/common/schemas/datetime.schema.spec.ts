import {
  APP_TIME_ZONE,
  workHours,
  dueTimeOfDayUtc,
  startOfLocalDay,
  toLocalDayKey,
  toDueDate,
} from './datetime.schema';

/**
 * The timezone contract.
 *
 * Instants are UTC everywhere in this system; calendar days are Bangkok's.
 * Every assertion below is a boundary where mixing the two silently changes
 * which day a borrower is in - and none of them fail loudly, they just answer
 * the wrong question, so nothing but a test notices.
 *
 * The suite is written to pass on any host. `TZ=UTC npx jest` and
 * `TZ=Asia/Bangkok npx jest` must agree, which is the point: a helper that
 * reads the machine's zone would pass on a Bangkok laptop and fail in CI.
 */

/** 2026-09-13, one minute past midnight *in Bangkok* (= 17:01Z the day before). */
const JUST_AFTER_BANGKOK_MIDNIGHT = new Date('2026-09-12T17:01:00.000Z');

/** The same Bangkok day, late morning. */
const BANGKOK_MORNING = new Date('2026-09-13T02:30:00.000Z');

/** The same Bangkok day, one minute before it ends (= 16:59Z). */
const JUST_BEFORE_BANGKOK_MIDNIGHT = new Date('2026-09-13T16:59:00.000Z');

describe('the two constants stay in step', () => {
  it('states the counter closing hour once, in local time', () => {
    expect(workHours.end).toBe(17);
    expect(APP_TIME_ZONE).toBe('Asia/Bangkok');
  });

  it('derives the UTC wire form from it rather than repeating it', () => {
    // 17:00 in Bangkok is 10:00Z. These drifted apart by seven hours once,
    // when the frontend wrote 17 and the backend wrote 10:00:00 by hand.
    expect(dueTimeOfDayUtc()).toBe('10:00:00');
  });

  it('really is closing time in Bangkok, as Intl reads it', () => {
    const due = toDueDate('2026-09-13');
    const hour = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: APP_TIME_ZONE,
    }).format(due);
    expect(hour).toBe(String(workHours.end));
  });

  it('keeps the due instant on the day the borrower named', () => {
    expect(toLocalDayKey(toDueDate('2026-09-13'))).toBe('2026-09-13');
  });
});

describe('startOfLocalDay', () => {
  it('opens the day at midnight in Bangkok, not at midnight UTC', () => {
    // The UTC boundary sits at 07:00 Bangkok. A dashboard counting "approved
    // today" from there loses every decision made before the desk opens.
    expect(startOfLocalDay(BANGKOK_MORNING).toISOString()).toBe(
      '2026-09-12T17:00:00.000Z',
    );
  });

  it('puts every instant of one Bangkok day on the same boundary', () => {
    const boundary = startOfLocalDay(BANGKOK_MORNING).getTime();
    expect(startOfLocalDay(JUST_AFTER_BANGKOK_MIDNIGHT).getTime()).toBe(
      boundary,
    );
    expect(startOfLocalDay(JUST_BEFORE_BANGKOK_MIDNIGHT).getTime()).toBe(
      boundary,
    );
  });

  it('rolls over when Bangkok does, not seven hours later', () => {
    // One minute apart, either side of Bangkok midnight: different days.
    const before = startOfLocalDay(new Date('2026-09-12T16:59:00.000Z'));
    const after = startOfLocalDay(JUST_AFTER_BANGKOK_MIDNIGHT);
    expect(after.getTime() - before.getTime()).toBe(86_400_000);
  });

  it('never lands after the instant it was asked about', () => {
    for (const at of [
      JUST_AFTER_BANGKOK_MIDNIGHT,
      BANGKOK_MORNING,
      JUST_BEFORE_BANGKOK_MIDNIGHT,
    ]) {
      expect(startOfLocalDay(at).getTime()).toBeLessThanOrEqual(at.getTime());
      expect(at.getTime() - startOfLocalDay(at).getTime()).toBeLessThan(
        86_400_000,
      );
    }
  });
});

describe('toLocalDayKey', () => {
  it('names the Bangkok day, so late-evening instants do not read as yesterday', () => {
    // 17:01Z is already tomorrow at the counter. Slicing the ISO string, which
    // is what the frontend adapters did, would answer 2026-09-12.
    expect(toLocalDayKey(JUST_AFTER_BANGKOK_MIDNIGHT)).toBe('2026-09-13');
    expect(JUST_AFTER_BANGKOK_MIDNIGHT.toISOString().slice(0, 10)).toBe(
      '2026-09-12',
    );
  });

  it('agrees with itself across a whole Bangkok day', () => {
    expect(toLocalDayKey(BANGKOK_MORNING)).toBe('2026-09-13');
    expect(toLocalDayKey(JUST_BEFORE_BANGKOK_MIDNIGHT)).toBe('2026-09-13');
  });

  it('round-trips through the due instant', () => {
    for (const day of ['2026-01-01', '2026-09-13', '2026-12-31']) {
      expect(toLocalDayKey(toDueDate(day))).toBe(day);
    }
  });
});
