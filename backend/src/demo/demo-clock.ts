/**
 * A clock the demo seed can move back in time.
 *
 * The seed drives the real services, which read "now" from `new Date()` and
 * `Date.now()`. To leave a loan that looks five days old, the seed sets the
 * clock five days back, acts, and moves on. Only this process sees it; the
 * database's own defaults (row creation times) still use the real time.
 */
const RealDate = Date;
let offsetMs = 0;

class ShiftedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + offsetMs);
    else super(...(args as [string]));
  }

  static now(): number {
    return RealDate.now() + offsetMs;
  }
}

/** Replace the global Date until `restoreClock` is called. */
export function installClock(): void {
  globalThis.Date = ShiftedDate as DateConstructor;
}

export function restoreClock(): void {
  offsetMs = 0;
  globalThis.Date = RealDate;
}

/** From here on "now" is `at`, until set again. */
export function setNow(at: Date): void {
  offsetMs = at.getTime() - RealDate.now();
}

/** The real time, whatever the clock is set to. */
export function realNow(): Date {
  return new RealDate(RealDate.now());
}
