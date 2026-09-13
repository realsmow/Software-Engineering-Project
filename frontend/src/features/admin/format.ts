import { fmtDayMonth } from "@/lib/datetime";

/**
 * Date formatting for the admin screens.
 *
 * The implementations moved to `lib/datetime.ts`; see the note in
 * `features/borrower/format.ts`. This file had its own `fmtDateTime` and
 * `fmtDate` that added `+ 543` by hand, which printed a Buddhist year on the
 * English UI too. The era now comes from the locale: `th-TH` is a
 * Buddhist-calendar locale and prints 2569 on its own, `en-GB` prints 2026.
 *
 * Several admin screens already imported `fmtDateTime` from the borrower
 * module rather than this one, so the same timestamp rendered with a year on
 * the users page and without one on the dashboard. There is one of each now.
 */
export { fmtDate, fmtDateTime, fmtDayMonth, fmtTime } from "@/lib/datetime";

/** "6 ส.ค." / "6 Aug" - compact day+month for chart axes. */
export const fmtDayShort = fmtDayMonth;

/** "09:00" - hour label for a 0–23 hour bucket. */
export function fmtHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}
