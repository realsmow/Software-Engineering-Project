import type { BorrowerRef } from "@/features/staff/queue/queue.types";

/**
 * The appeal desk's shapes, mirroring backend/src/appeal/appeal.schema.ts.
 *
 * An appeal argues with a *credit penalty*, not with a damage grade. The
 * previous version of this file modelled a B0..B3 grade picker and derived a
 * refund from the distance between two grades; no procedure on the server has
 * ever taken a grade from this desk, and none computes a refund that way. What
 * the supervisor actually chooses is how much of the deduction still stands,
 * and the server works out what that hands back.
 */

/** Pending / Approved / Rejected. There is no cancelled appeal (ว-10). */
export type AppealStatus = "pending" | "approved" | "rejected";

/** The penalty being argued about (`appealedPenalty`). */
export interface AppealedPenalty {
  penaltyKey: number;
  /**
   * The loan the penalty came from, and the only handle this desk gets on the
   * evidence: `image.usagePhotos` is keyed by it. Null for a penalty with no
   * loan behind it, such as an administrative borrowing ban, which is issued
   * against the account rather than against something borrowed.
   */
  usageKey: number | null;
  reason: string | null;
  creditDeducted: number | null;
  issuedAt: string | null;
  expiresAt: string;
  /** False once an approved appeal has lifted it. */
  inEffect: boolean;
}

/** One appeal (`appealOutput`), as every appeal procedure returns it. */
export interface AppealOutput {
  appealKey: number;
  status: AppealStatus;
  /** What the borrower wrote. Nullable in the column; in practice always set. */
  appealReason: string | null;
  filedAt: string | null;
  resolvedAt: string | null;
  filedBy: BorrowerRef;
  /** Who ruled on it. Null while pending. */
  resolvedBy: BorrowerRef | null;
  penalty: AppealedPenalty;
  /**
   * The smaller penalty left standing when the supervisor reduced rather than
   * cancelled. Null for a plain approval or a rejection.
   */
  replacementPenalty: AppealedPenalty | null;
  /** Credit actually handed back. Zero until the appeal is approved. */
  creditRestored: number;
  /**
   * Who graded the return that produced the penalty.
   *
   * The desk needs it to know who must *not* take the case: the server refuses
   * a decision from the inspector whose grade is being appealed
   * (CANNOT_DECIDE_OWN_INSPECTION), so the screen checks it first rather than
   * offering a button that is going to be rejected.
   */
  inspectorKeys: number[];
}

/** A penalty the borrower may still appeal (`appealablePenalty`). */
export interface AppealablePenalty extends AppealedPenalty {
  /** After this the penalty can no longer be appealed. */
  appealableUntil: string;
}

/**
 * A decision (`decideAppealInput`).
 *
 * `reducedCreditDeducted` is the middle answer the desk needs: omitted means
 * cancel the penalty outright and refund all of it, a positive figure smaller
 * than the original leaves a smaller penalty standing and refunds only the
 * difference. The server refuses anything that is not smaller than the
 * original (INVALID_APPEAL_REDUCTION) - an appeal is not a route to a bigger
 * penalty, nor to one that costs the same.
 */
export interface DecideAppealInput {
  appealKey: number;
  decision: "approve" | "reject";
  /** Reaches the borrower in the notification. Optional on the server. */
  note?: string;
  reducedCreditDeducted?: number;
}
