import type { DamageLevel, Tier } from "@/types/domain";
import type { ConditionType, Paginated } from "@/features/staff/queue/queue.types";

/**
 * The inspection desk, mirroring backend/src/inspection/inspection.schema.ts.
 *
 * Deliberately separate from the return itself: `loan.recordReturn` frees the
 * borrower and settles lateness, and this decides what the item's condition
 * costs. That split is what lets a busy counter clear returns and grade them
 * afterwards.
 *
 * Grading is one-way. `existingInspectionKey` being set means this loan has
 * already been graded and the server will refuse a second one; a grade the
 * borrower disputes is corrected through an appeal, not by re-grading.
 */

export type { DamageLevel };

export interface InspectionQueueRow {
  usageKey: number;
  borrowerName: string;
  borrowerStudentId: string;
  itemName: string | null;
  serialNo: string | null;
  resourceKey: number;
  tier: Tier | null;
  /** Condition recorded when the unit was prepared - the baseline. */
  checkoutCondition: ConditionType;
  returnedAt: string | null;
  /** Whole days late. The late penalty was already applied at return. */
  overdueDays: number;
  beforeImageCount: number;
  afterImageCount: number;
}

export type PaginatedInspectionQueue = Paginated<InspectionQueueRow>;

export interface EvidenceImage {
  imageKey: number;
  url: string;
  submittedAt: string | null;
}

/** A past grade on this same unit, so a repeat problem is visible. */
export interface ConditionHistoryEntry {
  conditionKey: number;
  condition: ConditionType;
  note: string | null;
  loggedAt: string | null;
}

export interface InspectionSubject {
  usageKey: number;
  resourceKey: number;
  itemName: string | null;
  serialNo: string | null;
  tier: Tier | null;
  /** ItemInfo.CreditWeight - what a penalty is sized from. */
  creditWeight: number;
  borrowerAccountKey: number;
  borrowerName: string;
  borrowerStudentId: string;
  borrowerCreditScore: number;
  checkoutCondition: ConditionType;
  checkoutConditionNote: string | null;
  checkoutAt: string;
  dueAt: string;
  returnedAt: string | null;
  overdueDays: number;
  beforeImages: EvidenceImage[];
  afterImages: EvidenceImage[];
  unitHistory: ConditionHistoryEntry[];
  /** Set once graded; a second grade is refused. */
  existingInspectionKey: number | null;
}

export interface InspectionResult {
  inspectionKey: number;
  usageKey: number;
  resourceKey: number;
  inspectorAccountKey: number;
  level: DamageLevel | null;
  condition: ConditionType;
  note: string | null;
  inspectedAt: string | null;
  /** Null when the grade was B0 - fair wear costs the borrower nothing. */
  penalty: {
    penaltyKey: number;
    creditDeducted: number;
    expiresAt: string;
  } | null;
  /** True when the unit went back on the shelf rather than into repair. */
  returnedToPool: boolean;
}
