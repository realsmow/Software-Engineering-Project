import { z } from "zod";

/**
 * Shared date/datetime validation - convention ว-08.
 *
 * Every date field crossing the tRPC boundary (`startDate`, `endDate`,
 * `nextAvailableAt`, slot times, `decidedAt`, ...) must be a string in one of
 * two shapes:
 *   - isoDate:     calendar date only, `YYYY-MM-DD`
 *   - isoDateTime: ISO 8601 instant in UTC, e.g. `2026-08-11T09:30:00.000Z`
 *
 * Keeping these here means the loan form, reservation form and any payload
 * parser validate identically, so a malformed date is rejected client-side
 * before it ever reaches the backend.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// UTC only: must end in Z (optionally with milliseconds). Offsets like +07:00
// are rejected so timestamps are unambiguous across client/server (ว-08).
const ISO_DATETIME_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** `YYYY-MM-DD`, and an actually-valid calendar date. */
export const isoDate = z
  .string()
  .regex(ISO_DATE_RE, "ต้องเป็นวันที่รูปแบบ YYYY-MM-DD")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "วันที่ไม่ถูกต้อง");

/** ISO 8601 instant in UTC (`...Z`), and an actually-valid instant. */
export const isoDateTime = z
  .string()
  .regex(ISO_DATETIME_UTC_RE, "ต้องเป็นเวลารูปแบบ ISO 8601 UTC (ลงท้ายด้วย Z)")
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "เวลาไม่ถูกต้อง");

export function isIsoDate(value: unknown): value is string {
  return isoDate.safeParse(value).success;
}

export function isIsoDateTime(value: unknown): value is string {
  return isoDateTime.safeParse(value).success;
}
