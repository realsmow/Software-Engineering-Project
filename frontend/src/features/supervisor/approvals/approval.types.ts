import type { CreditBand, Tier } from "@/types/domain";
import type { BorrowerRef } from "@/features/staff/queue/queue.types";

/**
 * Server shapes for the approval desk, mirroring
 * backend/src/approval/approval.schema.ts.
 *
 * One queue, two audiences, split by `route`: T2 equipment and anything from a
 * shaky credit band go to a supervisor, everything else that is not
 * auto-approved goes to the department's staff. Requests the system cleared on
 * its own never appear here at all.
 */

/** Who has to decide. */
export type ApprovalRoute = "auto" | "staff" | "supervisor";

/**
 * The routes a human can filter the queue by.
 *
 * `auto` is excluded rather than merely unused: a request the system cleared
 * itself never lands on this desk, so offering it as a filter would promise a
 * view that is always empty.
 */
export type DecidableRoute = Exclude<ApprovalRoute, "auto">;

/** A request this decision would knock out if approved. */
export interface ApprovalClash {
  reservationKey: number;
  borrowerName: string;
  startTime: string;
  endTime: string;
}

export interface ApprovalQueueRow {
  reservationKey: number;
  requestedAt: string;
  borrower: BorrowerRef;
  /** The band that put this row on this desk, when it was not the tier. */
  creditTier: CreditBand;
  route: ApprovalRoute;
  resourceKey: number;
  itemName: string | null;
  serialNo: string | null;
  kind: "equipment" | "room";
  tier: Tier | null;
  startTime: string;
  endTime: string;
  requestedDays: number;
  reason: string | null;
  /**
   * Other requests for the same unit over a window that touches this one once
   * the unit's buffer is applied. Approving this cancels them, so the desk has
   * to see them before deciding, not after.
   */
  clashesWith: ApprovalClash[];
}

export interface ApprovalCounts {
  /** Waiting on staff. */
  staff: number;
  /** Waiting on a supervisor. */
  supervisor: number;
  /** Of those, the ones whose start time has already passed. */
  overdueToDecide: number;
  /** Cleared by the system today. */
  autoApprovedToday: number;
  asOf: string | null;
}

/**
 * What the decision did.
 *
 * `cancelled` is the part that is easy to miss: approving one request cancels
 * every other pending request for the same unit over an overlapping window.
 * Showing them afterwards is what stops it surfacing later as "my request
 * vanished".
 */
export interface DecideApprovalOutput {
  request: { reservationKey: number; status: string };
  cancelled: {
    reservationKey: number;
    borrower: BorrowerRef;
    startTime: string;
    endTime: string;
  }[];
}
