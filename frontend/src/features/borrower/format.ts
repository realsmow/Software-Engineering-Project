/**
 * Date formatting for the borrower screens.
 *
 * The implementations moved to `lib/datetime.ts` (which the TODO that used to
 * sit here asked for): both copies of this helper rendered in the *browser's*
 * timezone and hard-coded the Thai locale, so the English UI printed Thai
 * month names and a laptop outside Bangkok printed the wrong hour. The names
 * are re-exported so the screens importing them do not have to change.
 *
 * `fmtDateTime` now carries the year, matching what the admin copy always did.
 */
export { fmtDate, fmtDateTime, fmtDayMonth, fmtTime } from "@/lib/datetime";
