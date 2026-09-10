import { DAMAGE_LEVELS } from "@/constants";
import type { DamageLevel } from "@/types/domain";
import type { BorrowerRef } from "@/features/staff/queue/queue.types";

/**
 * The appeal desk's shapes.
 *
 * NO BACKEND YET. `AppealInfo` exists in schema.prisma (OriginalPenalty,
 * NewPenalty, FiledBy, ResolvedBy, AppealReason, ApproveStatus) but no
 * `appeal.*` router or service does, so these are written to match the table
 * and the procedures it will get, not invented for the screen.
 *
 * When the backend lands, this file stays and mock-appeals.ts goes: the hook
 * swaps its queryFn for `trpc.appeal.queue.query()` and nothing else moves.
 *
 * What the screen has to carry comes from the SRS:
 *   FR-APL: the borrower may appeal within 7 days of the staff report
 *   the decider sees the before/after photos, the staff report and the
 *   borrower's evidence on one screen
 *   the decider may lower the damage grade and give part of the credit back
 */

/**
 * Damage grades, in order.
 *
 * The labels and the credit multipliers live in `DAMAGE_LEVELS` in
 * constants/index.ts and match DAMAGE_CREDIT_WEIGHT on the server (0/1/3/5);
 * this is only the ordering, which is what "reduce to a lower grade" needs.
 */
export const DAMAGE_ORDER: DamageLevel[] = ["B0", "B1", "B2", "B3"];

export type AppealStatus = "Pending" | "Approved" | "Rejected" | "Canceled";

export interface AppealPhoto {
  /** "before" is the condition recorded at handover, "after" is the return. */
  when: "before" | "after";
  url: string;
}

export interface AppealRow {
  appealKey: number;
  status: AppealStatus;
  filedAt: string;
  borrower: BorrowerRef;

  itemName: string;
  serialNo: string | null;

  /** The verdict being appealed. */
  gradedLevel: DamageLevel;
  creditDeducted: number;
  /** What staff wrote when they graded the return. */
  staffNote: string | null;
  gradedBy: string;
  gradedAt: string;

  /** The borrower's side of it. */
  appealReason: string | null;
  photos: AppealPhoto[];
}

/**
 * A decision. Lowering `newLevel` is what gives credit back: the refund is the
 * difference between the two grades' weights, so the desk never types a credit
 * figure directly and the two can never disagree.
 */
export interface DecideAppealInput {
  appealKey: number;
  decision: "uphold" | "reduce";
  /** Required when reducing; must be a lower grade than the original. */
  newLevel?: DamageLevel;
  reason: string;
}

/** Credit multiplier for a grade, from the shared DAMAGE_LEVELS table. */
export function damageWeight(level: DamageLevel): number {
  return DAMAGE_LEVELS[level].weight;
}
