import i18n from "i18next";

/**
 * Turning instants into what a person at Kasetsart reads, and back.
 *
 * The counterpart of `lib/validation.ts`: that file says what a date looks like
 * on the wire (ว-08 - ISO 8601, always UTC), this one says what it looks like
 * on screen and how a day the user picked becomes an instant.
 *
 * ── The two rules ─────────────────────────────────────────────────────────
 * 1. Instants are UTC. They arrive as `...Z` strings and stay that way.
 * 2. Calendar days and clock times are **Bangkok's**, always, on every screen.
 *
 * Rule 2 is the one that was missing. `date-fns` `format()` renders in the
 * *browser's* timezone, so the same loan read "17:00" on a laptop in Bangkok
 * and "10:00" on one left in UTC - while the backend's own notification for
 * that loan said 17:00, because notification.service.ts already formats in
 * Asia/Bangkok. The university has one counter in one timezone; a borrower
 * abroad still has to return the thing by 17:00 Bangkok, so that is the number
 * to show them.
 *
 * Buddhist era falls out of the locale rather than `+ 543` arithmetic: `th-TH`
 * is a Buddhist-calendar locale in ICU, so it prints 2569 on its own, and
 * `en-GB` prints 2026. Doing it by hand was what made the English UI show Thai
 * month names and a Buddhist year.
 */

/** The university's timezone. Every calendar day and clock time is measured here. */
export const APP_TIME_ZONE = "Asia/Bangkok";

/**
 * Asia/Bangkok's offset from UTC, in milliseconds.
 *
 * A constant because Thailand has been a fixed UTC+07:00 since 1920 and has
 * never observed daylight saving. It mirrors the same constant in the
 * backend's `common/schemas/datetime.schema.ts`; if Thailand ever changes its
 * rules, those two lines are what need replacing with a real zone conversion.
 */
const APP_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

const DAY_MS = 86_400_000;

/** What we render for a value that is missing or unparsable. */
const PLACEHOLDER = "-";

/**
 * The BCP 47 tag to format in, from the language i18next currently has.
 *
 * Read at call time rather than captured, because these are plain functions
 * called during render - a component that re-renders on a language switch
 * (which is every component using `useTranslation`) picks the new tag up here.
 *
 * `en-GB` rather than `en-US` so the day comes before the month, matching the
 * Thai ordering: the two locales should differ in language, not in how a date
 * is laid out, or staff reading both would have to check which they are on.
 */
function localeTag(): string {
  return i18n.language?.startsWith("en") ? "en-GB" : "th-TH";
}

/** Accepts what the contract sends (ISO string), a Date, or nothing. */
function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value === "" || value === PLACEHOLDER) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatWith(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  const d = toDate(value);
  if (d === null) return PLACEHOLDER;
  return new Intl.DateTimeFormat(localeTag(), {
    ...options,
    timeZone: APP_TIME_ZONE,
  }).format(d);
}

/**
 * "13 ก.ย. 2569 17:00" / "13 Sep 2026, 17:00" - the default for tables.
 *
 * The year is included deliberately. It used to be dropped here and kept in
 * the admin copy of this helper, so the same audit row read "6 ส.ค. 09:50" on
 * one screen and "6 ส.ค. 2569 09:50" on another, and a row from last year was
 * indistinguishable from one from this morning.
 */
export function fmtDateTime(value?: string | Date | null): string {
  return formatWith(value, {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  });
}

/** "13 ก.ย. 2569" / "13 Sep 2026" - a day, where the hour would be noise. */
export function fmtDate(value?: string | Date | null): string {
  return formatWith(value, { dateStyle: "medium" });
}

/**
 * "13 ก.ย." / "13 Sep" - day and month only.
 *
 * For chart axes and availability strips, where every point is inside a window
 * the surrounding copy has already named the year of.
 */
export function fmtDayMonth(value?: string | Date | null): string {
  return formatWith(value, { day: "numeric", month: "short" });
}

/**
 * "13" - the day of the month on its own.
 *
 * Only useful as the left half of a same-month range ("13–20 ก.ย."), which is
 * why it exists rather than callers slicing `fmtDayMonth`.
 */
export function fmtDayNum(value?: string | Date | null): string {
  return formatWith(value, { day: "numeric" });
}

/** "17:00" - clock time at the counter, for a value that is already a known day. */
export function fmtTime(value?: string | Date | null): string {
  return formatWith(value, { timeStyle: "short", hour12: false });
}

/**
 * "in 3 days" / "อีก 3 วัน" - a gap between two instants.
 *
 * Needs no timezone, because a difference between instants has none. It does
 * need the active language, which the hard-coded Thai `date-fns` locale it
 * replaced did not take.
 */
export function fmtRelative(value?: string | Date | null): string {
  const d = toDate(value);
  if (d === null) return PLACEHOLDER;

  const rtf = new Intl.RelativeTimeFormat(localeTag(), { numeric: "auto" });
  const min = Math.round((d.getTime() - Date.now()) / 60_000);
  if (Math.abs(min) < 60) return rtf.format(min, "minute");
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rtf.format(hr, "hour");
  return rtf.format(Math.round(hr / 24), "day");
}

/**
 * `YYYY-MM-DD` for the Bangkok day an instant falls on.
 *
 * Use this instead of `iso.slice(0, 10)`, which answers with the *UTC* day: a
 * room booked 19:00-21:00 Bangkok on the 13th is `2026-09-13T12:00:00Z`, fine,
 * but anything from 07:00 Bangkok backwards belongs to the previous UTC day
 * and the slice silently reports yesterday.
 */
export function toLocalDayKey(value: string | Date): string {
  const d = toDate(value);
  if (d === null) return PLACEHOLDER;
  return new Date(d.getTime() + APP_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Midnight in Bangkok on the day `at` falls in, as an instant.
 *
 * The client-side twin of the backend's `startOfLocalDay`.
 */
export function startOfLocalDay(at: Date): Date {
  const local = at.getTime() + APP_UTC_OFFSET_MS;
  return new Date(local - (local % DAY_MS) - APP_UTC_OFFSET_MS);
}

/** `YYYY-MM-DD` for today, at the counter rather than in the browser's zone. */
export function todayLocalDayKey(): string {
  return toLocalDayKey(new Date());
}

/**
 * A day the user picked plus an hour at the counter -> the instant it means.
 *
 * This is the fix for the classic `<input type="date">` bug. The element hands
 * back `"2026-09-13"`, and `new Date("2026-09-13")` is **UTC** midnight, which
 * is 07:00 on the 13th in Bangkok - so a naive parse of a picked date is seven
 * hours adrift, and any hour-of-day added to it afterwards is adrift with it.
 * Everything the user picks goes through here instead.
 */
export function localInstant(dayKey: string, hour = 0, minute = 0): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour, minute, 0, 0) - APP_UTC_OFFSET_MS);
}
