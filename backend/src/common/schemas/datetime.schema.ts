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
 * The zone every *calendar day* in this system is measured in.
 *
 * Instants are UTC everywhere - in the database, on the wire, in every
 * comparison below. But "today", "the day it is due" and "17:00" are not
 * instants, they are questions about a calendar, and this system has exactly
 * one calendar: the counter's, in Bangkok. Asking them in UTC moves every
 * boundary seven hours and quietly redefines which day a borrower is in.
 */
export const APP_TIME_ZONE = 'Asia/Bangkok';

/**
 * Asia/Bangkok's offset from UTC, in milliseconds.
 *
 * A constant rather than an Intl lookup because Thailand has been a fixed
 * UTC+07:00 since 1920 and has never observed daylight saving. If that ever
 * changes, this is the one line to replace with a real zone conversion -
 * everything else in this file is derived from it.
 */
const APP_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * The hour a loan falls due, in the counter's local time.
 *
 * 17:00 is the end of the counter's working day (proposal §5.9: "ตั้งค่า
 * ช่วงเวลารับอุปกรณ์ เช่น 08.00–17.00 น. หากคืนช้ากว่านั้น ถือเป็นการคืนช้า
 * 1 วัน"). The overdue job and the countdown on screen must read this same
 * constant, or the system will dock credit from someone whose screen still
 * says they have hours left.
 *
 * It is a constant rather than a per-department setting because the schema has
 * nowhere to store one — see docs/staff.md.
 */
export const DUE_HOUR_LOCAL = 17;

/**
 * The same hour expressed in UTC, which is what actually goes in the column.
 *
 * Derived rather than written down twice: the pair used to be maintained by
 * hand on two sides of the stack and drifted apart by seven hours.
 */
export const DUE_TIME_OF_DAY_UTC = `${String(
  DUE_HOUR_LOCAL - APP_UTC_OFFSET_MS / 3_600_000,
).padStart(2, '0')}:00:00`;

/** Prisma `Date` -> contract string. Every mapper ends with one of these two. */
export function toIso(value: Date): string {
  return value.toISOString();
}

export function toIsoNullable(value: Date | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toISOString();
}

/**
 * A calendar day plus a wall-clock time at the counter -> the instant it is.
 *
 * `localTimeToUtc('2026-09-16', '07:00')` is 00:00Z that morning, because the
 * counter opens at 07:00 Bangkok. Room slots are the reason this exists: their
 * boundaries are written as the times staff see on the wall, while everything
 * stored and compared is UTC, and doing that conversion at each call site is
 * how half of them end up seven hours out.
 */
export function localTimeToUtc(isoDateOnly: string, hhmm: string): Date {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const midnightLocal = new Date(`${isoDateOnly}T00:00:00Z`).getTime();
  return new Date(
    midnightLocal + (hours * 60 + minutes) * 60_000 - APP_UTC_OFFSET_MS,
  );
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

/**
 * The instant the borrower's day starts - midnight in Bangkok, not in UTC.
 *
 * `setUTCHours(0, 0, 0, 0)` is the tempting version and it is wrong here by
 * seven hours: it puts the boundary at 07:00 Bangkok, so anything staff did
 * between midnight and breakfast counts against yesterday, and at 03:00 the
 * window it opens spans two Bangkok days at once.
 */
export function startOfLocalDay(at: Date): Date {
  const local = at.getTime() + APP_UTC_OFFSET_MS;
  return new Date(local - (local % 86_400_000) - APP_UTC_OFFSET_MS);
}

/**
 * `YYYY-MM-DD` - the calendar day `at` falls on in Bangkok, not in UTC.
 *
 * `toDueDate` is its inverse: `toDueDate(toLocalDayKey(d))` is closing time on
 * the day `d` falls on at the counter.
 */
export function toLocalDayKey(at: Date): string {
  return new Date(at.getTime() + APP_UTC_OFFSET_MS).toISOString().slice(0, 10);
}
