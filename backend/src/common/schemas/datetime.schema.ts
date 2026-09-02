import { z } from 'zod';

/**
 * Dates and times on the wire (ว-08): ISO 8601 strings, always UTC.
 *
 * The rule matters more than the choice. A codebase where some procedures
 * return `Date` and others return strings is the worst outcome, because the
 * generated types call both correct and the frontend finds out at runtime.
 *
 * Time is business logic here, not decoration — due dates, overdue marking,
 * daily credit deductions and penalty expiry all key off it — so every value
 * that crosses the boundary goes through this file.
 */

/** A moment. Used for CheckoutTime, CheckInTime, DueTime, ExpirationTime, ActionTime. */
export const isoDateTime = z.iso.datetime({ offset: false });

/** A moment that may not have happened yet, e.g. CheckInTime of an open loan. */
export const isoDateTimeNullable = isoDateTime.nullable();

/**
 * A calendar day, `YYYY-MM-DD`, with no time attached.
 *
 * Separate from isoDateTime because "ยืมถึงวันที่ 20" has to mean the same hour
 * on every screen. The client picks days; the server decides what hour a day
 * ends at.
 */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/**
 * The hour a loan falls due, in UTC.
 *
 * 10:00 UTC is 17:00 in Thailand, the end of the counter's working day
 * (proposal §5.9: "ตั้งค่าช่วงเวลารับอุปกรณ์ เช่น 08.00–17.00 น. หากคืนช้ากว่านั้น
 * ถือเป็นการคืนช้า 1 วัน"). The overdue job and the countdown on screen must
 * read this same constant, or the system will dock credit from someone whose
 * screen still says they have hours left.
 *
 * It is a constant rather than a per-department setting because the schema has
 * nowhere to store one — see docs/staff.md.
 */
export const DUE_TIME_OF_DAY_UTC = '10:00:00';

/** Prisma `Date` -> contract string. Every mapper ends with one of these two. */
export function toIso(value: Date): string {
  return value.toISOString();
}

export function toIsoNullable(value: Date | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toISOString();
}

/** A calendar day from the client -> the exact instant the loan falls due. */
export function toDueDate(isoDateOnly: string): Date {
  return new Date(`${isoDateOnly}T${DUE_TIME_OF_DAY_UTC}Z`);
}

/** `from` plus N whole days, keeping the time of day. */
export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

/**
 * Whole days from `from` to `to`, rounded up, never below zero.
 *
 * Rounded up because a return one hour late is a day late at the counter — the
 * proposal charges lateness by the day, and the borrower has already missed
 * the closing time the due instant encodes.
 */
export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}
