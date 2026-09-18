import { z } from 'zod';
import { borrowerRef } from '../loan/loan.schema';
import {
  isoDateTime,
  isoDateTimeNullable,
} from '../common/schemas/datetime.schema';
import { dbId } from '../common/schemas/id.schema';
import {
  paginated,
  paginationInput,
} from '../common/schemas/pagination.schema';

/**
 * Appeals against a credit penalty (proposal §5.8 "ขออุทธรณ์").
 *
 * Two desks, one table. The borrower files one against a penalty they think is
 * wrong; a supervisor rules on it. `AppealInfo.OriginalPenalty` is unique, so
 * "one appeal per penalty" is the database's rule and not a race this code has
 * to win.
 *
 * What an approved appeal does is lift the original penalty and hand the
 * credit back — optionally replacing it with a smaller one, which is what
 * `NewPenalty` on the table is for. It never edits the original row: the
 * penalty that was issued stays on the borrower's record as issued, and the
 * appeal is the second row that says it was overturned. A credit history that
 * rewrites itself cannot be explained to the person it belongs to.
 */

/**
 * How long after a penalty it may still be appealed.
 *
 * The proposal gives no figure. Seven days is the interval the notification
 * already implies — "เครดิตของคุณถูกหัก" links to the profile page, and a
 * borrower who has not looked at it within a week has accepted the deduction
 * in practice. It is here, as one constant, so changing it is one edit rather
 * than a hunt through the service.
 */
export const APPEAL_WINDOW_DAYS = 7;

/** Pending / Approved / Rejected, as the frontend spells them (ว-10). */
export const appealStatus = z.enum(['pending', 'approved', 'rejected']);
export type AppealStatus = z.infer<typeof appealStatus>;

/** The penalty being argued about, as much of it as the appeal screens show. */
export const appealedPenalty = z.object({
  penaltyKey: z.number().int(),
  /**
   * The loan the penalty came from — the handle for its evidence.
   *
   * FR-APL-03 puts the before/after photos, the staff report and the
   * borrower's account on one screen, and every procedure that can supply the
   * first two (`image.usagePhotos`, `inspection.getById`) is keyed by
   * `usageKey`. Without it here an appeal is a dead end: the supervisor has
   * the argument and no way to reach what it argues about.
   *
   * Null for a penalty with no loan behind it — an administrative borrowing
   * ban is issued against the account, not against something borrowed.
   */
  usageKey: z.number().int().nullable(),
  reason: z.string().nullable(),
  creditDeducted: z.number().int().nullable(),
  issuedAt: isoDateTimeNullable,
  expiresAt: isoDateTime,
  /** False once an approved appeal has lifted it. */
  inEffect: z.boolean(),
});

export const appealOutput = z.object({
  appealKey: z.number().int(),
  status: appealStatus,
  /** What the borrower wrote. Nullable in the column; in practice always set. */
  appealReason: z.string().nullable(),
  filedAt: isoDateTimeNullable,
  resolvedAt: isoDateTimeNullable,
  filedBy: borrowerRef,
  /**
   * Who ruled on it. Null while pending.
   *
   * Returned so the queue can show it and, more to the point, so the rule
   * that the decider may not be the inspector is visible rather than only
   * enforced — see `CANNOT_DECIDE_OWN_INSPECTION`.
   */
  resolvedBy: borrowerRef.nullable(),
  penalty: appealedPenalty,
  /**
   * The smaller penalty that replaced the original, when the supervisor
   * reduced rather than cancelled. Null for a plain approval or a rejection.
   */
  replacementPenalty: appealedPenalty.nullable(),
  /** Credit actually handed back by the decision. Zero until it is approved. */
  creditRestored: z.number().int(),
  /**
   * Who graded the return that produced the penalty, when it came from an
   * inspection. The desk needs it to know who must *not* take the case.
   */
  inspectorKeys: z.array(z.number().int()),
});
export type AppealOutput = z.infer<typeof appealOutput>;

// ---------------------------------------------------------------------------
// Borrower side
// ---------------------------------------------------------------------------

/**
 * File one (§5.8).
 *
 * The penalty key rather than the usage: a single return can produce both a
 * late penalty and a damage penalty, and a borrower may well accept one and
 * dispute the other.
 */
export const createAppealInput = z.object({
  penaltyKey: dbId,
  appealReason: z.string().trim().min(1).max(1000),
});
export type CreateAppealInput = z.infer<typeof createAppealInput>;

export const listMyAppealsInput = paginationInput.extend({
  status: appealStatus.optional(),
});
export type ListMyAppealsInput = z.infer<typeof listMyAppealsInput>;

/**
 * The penalties this borrower could still appeal, for the "ขออุทธรณ์" button.
 *
 * A query of its own rather than a flag on the credit page, because the answer
 * is three separate conditions (in force, not already appealed, inside the
 * window) and the frontend must not have to reimplement any of them to decide
 * whether to render the button.
 */
export const appealablePenalty = appealedPenalty.extend({
  /** After this the penalty can no longer be appealed. */
  appealableUntil: isoDateTime,
});

// ---------------------------------------------------------------------------
// Supervisor side
// ---------------------------------------------------------------------------

export const listAppealsInput = paginationInput.extend({
  status: appealStatus.optional(),
});
export type ListAppealsInput = z.infer<typeof listAppealsInput>;

export const paginatedAppeals = paginated(appealOutput);

export const appealIdInput = z.object({ appealKey: dbId });

/**
 * Rule on one (§5.8).
 *
 * `reducedCreditDeducted` is the middle answer the desk actually needs. A
 * grade that was too harsh is rarely wholly wrong, and without it a supervisor
 * has to choose between leaving an unfair penalty standing and cancelling a
 * deserved one. Omitted or zero means cancel the penalty outright.
 */
export const decideAppealInput = z.object({
  appealKey: dbId,
  decision: z.enum(['approve', 'reject']),
  /** The supervisor's reasoning. Reaches the borrower in the notification. */
  note: z.string().trim().max(1000).optional(),
  /**
   * Approve-only. Must be smaller than the original: an appeal is not a route
   * to a bigger penalty, and a supervisor who thinks the grade was too lenient
   * has `inspection` for that.
   */
  reducedCreditDeducted: z.number().int().positive().optional(),
});
export type DecideAppealInput = z.infer<typeof decideAppealInput>;
