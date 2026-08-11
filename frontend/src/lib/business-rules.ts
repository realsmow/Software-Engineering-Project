import { BUSINESS, CREDIT_BANDS } from "@/constants";
import type { CreditBand } from "@/types/domain";

/**
 * Pure, client-side business-rule helpers.
 *
 * These mirror the backend's authoritative checks so the UI can warn the user
 * *before* they submit (rather than only reacting to a tRPC error afterward).
 * The backend remains the source of truth — these never mutate anything and
 * exist purely to give immediate, correct feedback in forms.
 *
 * Covers tester AC §2.4 (G2 loan-period ceiling), §2.5 (17:00 return cutoff),
 * §2.6 (T3 concurrent-slot limit) and §2.7 (AllowBorrow gating).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Max loan days a credit band grants, never exceeding the global cap. */
export function maxLoanDaysForBand(band: CreditBand): number {
  const cfg = CREDIT_BANDS.find((b) => b.band === band) ?? CREDIT_BANDS[0];
  return Math.min(cfg.loanDays, BUSINESS.MAX_LOAN_DAYS);
}

/** Whole days between two calendar dates (endDate − startDate). */
export function loanDurationDays(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Math.round((end - start) / DAY_MS);
}

/**
 * G2 ceiling: the latest date a new borrower may return the item so staff still
 * have `bufferDays` (ResourceInfo.BufferTime / prep_days) to prepare it before
 * the next existing reservation begins. Returns a `YYYY-MM-DD` string.
 */
export function maxReturnDateBeforeReservation(
  nextReservationStart: string,
  bufferDays: number,
): string {
  const start = new Date(nextReservationStart);
  const ceiling = new Date(start.getTime() - bufferDays * DAY_MS);
  return ceiling.toISOString().slice(0, 10);
}

export interface LoanPeriodInput {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  creditBand: CreditBand;
  /** ISO datetime of the next existing reservation on this item, if any (G2). */
  nextReservationStart?: string;
  /** ResourceInfo.BufferTime (prep_days); required when nextReservationStart set. */
  bufferDays?: number;
}

export interface LoanPeriodResult {
  ok: boolean;
  requestedDays: number;
  /** Effective maximum loan length allowed (credit- and reservation-bounded). */
  maxDays: number;
  /** Latest allowed return date as YYYY-MM-DD — show this in the form warning. */
  maxReturnDate: string;
  creditTier: CreditBand;
  /** Why it failed, if it did. */
  reason?: "CREDIT_LIMIT" | "G2_RESERVATION" | "BELOW_MIN";
}

/**
 * Validate a requested loan window against the borrower's credit ceiling and
 * (optionally) an upcoming reservation (G2). The UI should call this on every
 * date change and surface `maxReturnDate` so the user sees the real limit
 * before confirming — matching AC §2.4.
 */
export function validateLoanPeriod(input: LoanPeriodInput): LoanPeriodResult {
  const { startDate, endDate, creditBand, nextReservationStart, bufferDays } = input;
  const requestedDays = loanDurationDays(startDate, endDate);
  const creditMaxDays = maxLoanDaysForBand(creditBand);

  // Credit ceiling as a concrete return date.
  const creditMaxReturn = new Date(
    Date.parse(`${startDate}T00:00:00.000Z`) + creditMaxDays * DAY_MS,
  )
    .toISOString()
    .slice(0, 10);

  // G2 ceiling, if there is an upcoming reservation.
  const g2MaxReturn =
    nextReservationStart != null
      ? maxReturnDateBeforeReservation(nextReservationStart, bufferDays ?? 0)
      : undefined;

  // The binding ceiling is the earlier of the two return dates.
  let maxReturnDate = creditMaxReturn;
  let boundBy: "CREDIT_LIMIT" | "G2_RESERVATION" = "CREDIT_LIMIT";
  if (g2MaxReturn != null && g2MaxReturn < creditMaxReturn) {
    maxReturnDate = g2MaxReturn;
    boundBy = "G2_RESERVATION";
  }

  const maxDays = loanDurationDays(startDate, maxReturnDate);

  if (requestedDays < BUSINESS.MIN_LOAN_DAYS) {
    return { ok: false, requestedDays, maxDays, maxReturnDate, creditTier: creditBand, reason: "BELOW_MIN" };
  }
  if (endDate > maxReturnDate) {
    return { ok: false, requestedDays, maxDays, maxReturnDate, creditTier: creditBand, reason: boundBy };
  }
  return { ok: true, requestedDays, maxDays, maxReturnDate, creditTier: creditBand };
}

/**
 * Return-cutoff penalty (AC §2.5). The due day's deadline is `cutoffHour`:00
 * (17:00 by default). A check-in at exactly 17:00 is on time (0 days); 17:00:01
 * or later counts as 1 late day, and each further calendar day adds one more.
 * Both instants are compared in UTC — callers pass UTC times per ว-08.
 */
export function returnLatePenaltyDays(
  dueDate: string, // YYYY-MM-DD
  checkInAt: string, // ISO 8601 UTC
  cutoffHour: number = BUSINESS.RETURN_CUTOFF_HOUR,
): number {
  const [y, m, d] = dueDate.split("-").map(Number);
  const deadline = Date.UTC(y, m - 1, d, cutoffHour, 0, 0, 0);
  const checkIn = new Date(checkInAt).getTime();
  if (checkIn <= deadline) return 0;
  return Math.ceil((checkIn - deadline) / DAY_MS);
}

/** Reservation statuses that occupy a concurrent T3 slot (AC §2.6). */
export const ACTIVE_T3_STATUSES = ["pending", "approved"] as const;

type WithApproveStatus = { approveStatus: string };

/**
 * Count a borrower's T3 reservations that still hold a slot. Cancelled/expired/
 * rejected reservations are excluded, so freeing an old slot immediately allows
 * a new booking (AC §2.6).
 */
export function activeT3SlotCount(reservations: readonly WithApproveStatus[]): number {
  const active = ACTIVE_T3_STATUSES as readonly string[];
  return reservations.filter((r) => active.includes(r.approveStatus)).length;
}

/** True when the borrower may book one more T3 slot (default max 2). */
export function canBookAnotherT3Slot(
  reservations: readonly WithApproveStatus[],
  max: number = BUSINESS.MAX_T3_CONCURRENT_SLOTS,
): boolean {
  return activeT3SlotCount(reservations) < max;
}

type WithAllowBorrow = { allowBorrow?: boolean };

/**
 * Drop items closed for borrowing (AC §2.7). `AllowBorrow` defaults to false in
 * the Prisma schema, so only an explicit `true` is borrowable; `undefined`
 * (mock/legacy rows lacking the flag) is treated as borrowable to avoid hiding
 * everything before the backend supplies the field.
 */
export function isBorrowable(item: WithAllowBorrow): boolean {
  return item.allowBorrow !== false;
}

export function filterBorrowableItems<T extends WithAllowBorrow>(items: readonly T[]): T[] {
  return items.filter(isBorrowable);
}
