import type { Tier } from "@/types/domain";

/**
 * Server shapes for the staff counter, mirroring backend/src/loan/loan.schema.ts.
 *
 * No adapter here, unlike the borrower catalogue. These screens were built
 * against the server's own vocabulary rather than an older mock, so there are
 * no two shapes to reconcile - inventing a second set of names would only add
 * a translation layer that has nothing to translate.
 */

/** UsageLog.CurrentStatus - how far along one borrowing is. */
export type UsageStatus = "Pending" | "Prepared" | "Lended" | "Returned" | "Inspected";

export type ConditionType = "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing";

/** Which pile of work a row is in. Drives the tabs on the queue page. */
export type StaffQueueBucket = "toPrepare" | "toHandover" | "onLoan" | "overdue";

export const STAFF_QUEUE_BUCKETS: StaffQueueBucket[] = [
  "toPrepare",
  "toHandover",
  "onLoan",
  "overdue",
];

/** Who is on the other side of the counter. */
export interface BorrowerRef {
  accountKey: number;
  studentId: string;
  firstName: string;
  lastName: string;
  creditScore: number;
}

export interface StaffQueueRow {
  /** Null in `toPrepare`: nothing is set aside yet, so there is no UsageLog. */
  usageKey: number | null;
  /** What `loan.allocate` takes. Null once the row has a usageKey instead. */
  reservationKey: number | null;
  status: UsageStatus | null;
  borrower: BorrowerRef;
  itemName: string | null;
  /** Null until a unit is chosen - the point of the `toPrepare` queue. */
  serialNo: string | null;
  resourceKey: number | null;
  tier: Tier | null;
  prepDays: number;
  pickupAt: string | null;
  dueAt: string | null;
  /** Zero unless past due; whole days, rounded up. */
  overdueDays: number;
  /** True once the overdue window is long enough to write the unit off. */
  lostEligible: boolean;
}

export interface StaffQueueCounts {
  toPrepare: number;
  toHandover: number;
  onLoan: number;
  overdue: number;
  toInspect: number;
  extensionsToInspect: number;
}

export interface LoanOutput {
  usageKey: number;
  reservationKey: number | null;
  status: UsageStatus;
  borrower: BorrowerRef;
  itemName: string | null;
  serialNo: string | null;
  resourceKey: number;
  tier: Tier | null;
}

/**
 * `loan.recordReturn` settles lateness at the same moment it takes the item
 * back, so the penalty comes back with the loan. The counter has to show it:
 * the borrower is standing there, and "why did I lose 5 credits" is asked then,
 * not later.
 */
export interface RecordReturnOutput {
  loan: LoanOutput;
  /** Null when the return was on time. */
  latePenalty: {
    penaltyKey: number;
    creditDeducted: number;
    overdueDays: number;
    expiresAt: string;
  } | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
