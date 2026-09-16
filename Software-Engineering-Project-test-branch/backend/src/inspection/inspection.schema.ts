import { z } from 'zod';
import {
  paginated,
  paginationInput,
} from '../common/schemas/pagination.schema';
import {
  isoDateTime,
  isoDateTimeNullable,
} from '../common/schemas/datetime.schema';
import { imageUrl } from '../common/schemas/image.schema';
import {
  conditionType,
  damageLevel,
  resourceTier,
} from '../common/schemas/status.schema';

/**
 * The inspection desk (proposal §5.9 "รับคืนและตรวจสภาพ" and §5.7 damage grades).
 *
 * Split from the return itself on purpose: `loan.recordReturn` frees the
 * borrower and settles lateness, and this domain decides what the item's
 * condition costs. That is also the split the proposal describes for T2, where
 * "staff A" hands out and "staff B" inspects.
 *
 * Grading is one-way. A grade the borrower disputes is corrected through the
 * appeal domain, by a supervisor — never by re-grading here, which is why
 * `inspection.create` refuses a second run on the same loan.
 */

export const inspectionIdInput = z.object({
  inspectionKey: z.number().int().positive(),
});
export const usageIdInput = z.object({ usageKey: z.number().int().positive() });
export const resourceIdInput = z.object({
  resourceKey: z.number().int().positive(),
});

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

export const inspectionQueueRow = z.object({
  usageKey: z.number().int(),
  borrowerName: z.string(),
  borrowerStudentId: z.string(),
  itemName: z.string().nullable(),
  serialNo: z.string().nullable(),
  resourceKey: z.number().int(),
  tier: resourceTier.nullable(),
  /** Baseline recorded when the unit was prepared — what the return is compared to. */
  checkoutCondition: conditionType,
  returnedAt: isoDateTimeNullable,
  /** Whole days late; the late penalty was already applied at return. */
  overdueDays: z.number().int().min(0),
  /** How many photos the borrower uploaded, so the desk knows what it has. */
  beforeImageCount: z.number().int().min(0),
  afterImageCount: z.number().int().min(0),
});

export const paginatedInspectionQueue = paginated(inspectionQueueRow);

export const listInspectionQueueInput = paginationInput.extend({
  tier: resourceTier.optional(),
});
export type ListInspectionQueueInput = z.infer<typeof listInspectionQueueInput>;

// ---------------------------------------------------------------------------
// One return, laid out for the comparison
// ---------------------------------------------------------------------------

export const evidenceImage = z.object({
  imageKey: z.number().int(),
  url: z.string(),
  submittedAt: isoDateTimeNullable,
});

/** A past grade on this same unit, so a repeat problem is visible. */
export const conditionHistoryEntry = z.object({
  conditionKey: z.number().int(),
  condition: conditionType,
  note: z.string().nullable(),
  loggedAt: isoDateTimeNullable,
});

export const inspectionSubjectOutput = z.object({
  usageKey: z.number().int(),
  resourceKey: z.number().int(),
  itemName: z.string().nullable(),
  serialNo: z.string().nullable(),
  tier: resourceTier.nullable(),
  /** ItemInfo.CreditWeight — the multiplier a penalty would be sized from. */
  creditWeight: z.number(),
  borrowerAccountKey: z.number().int(),
  borrowerName: z.string(),
  borrowerStudentId: z.string(),
  borrowerCreditScore: z.number().int(),
  checkoutCondition: conditionType,
  checkoutConditionNote: z.string().nullable(),
  checkoutAt: isoDateTime,
  dueAt: isoDateTime,
  returnedAt: isoDateTimeNullable,
  overdueDays: z.number().int().min(0),
  /** Photos taken at handover, and at return — the proposal's side-by-side. */
  beforeImages: z.array(evidenceImage),
  afterImages: z.array(evidenceImage),
  /** Earlier grades on this unit, newest first. */
  unitHistory: z.array(conditionHistoryEntry),
  /** Set once graded; a second grade is refused. */
  existingInspectionKey: z.number().int().nullable(),
});

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

/**
 * Record the grade (§5.7 B0–B3).
 *
 * B0 puts the unit straight back in the pool and charges nothing. B1–B3 take it
 * out of the pool and open a penalty; the unit stays out until a repair is
 * closed, or forever if it is written off.
 */
export const createInspectionInput = usageIdInput.extend({
  level: damageLevel,
  note: z.string().trim().max(1000).optional(),
  /**
   * URLs of photos the inspector already uploaded (CONTRACT.md §3: the bytes
   * never travel through tRPC). Recorded as InspectionPicture rows so an appeal
   * can be argued from what the inspector saw.
   */
  imageUrls: z.array(imageUrl).max(10).default([]),
});
export type CreateInspectionInput = z.infer<typeof createInspectionInput>;

export const inspectionOutput = z.object({
  inspectionKey: z.number().int(),
  usageKey: z.number().int(),
  resourceKey: z.number().int(),
  inspectorAccountKey: z.number().int(),
  level: damageLevel.nullable(),
  condition: conditionType,
  note: z.string().nullable(),
  inspectedAt: isoDateTimeNullable,
  /** Null when the grade was B0 — fair wear costs the borrower nothing. */
  penalty: z
    .object({
      penaltyKey: z.number().int(),
      creditDeducted: z.number().int(),
      expiresAt: isoDateTime,
    })
    .nullable(),
  /** True when the unit went back on the shelf rather than into repair. */
  returnedToPool: z.boolean(),
});

export const listInspectionsForResourceInput = resourceIdInput.extend({
  limit: z.number().int().min(1).max(100).default(20),
});
export type ListInspectionsForResourceInput = z.infer<
  typeof listInspectionsForResourceInput
>;

export const inspectionHistoryEntry = z.object({
  inspectionKey: z.number().int(),
  usageKey: z.number().int(),
  condition: conditionType,
  level: damageLevel.nullable(),
  note: z.string().nullable(),
  inspectedAt: isoDateTimeNullable,
  inspectorName: z.string(),
  borrowerStudentId: z.string(),
});

// ---------------------------------------------------------------------------
// Rooms (T3) — the daily walk-round
// ---------------------------------------------------------------------------

/**
 * Record a room check (§5.9 "ตรวจสถานที่รายวัน").
 *
 * Just the result. Opening a round each morning is the daily
 * "สร้างรอบตรวจสถานที่ (T3)" job, which belongs to whoever owns the scheduler —
 * this procedure works with or without it, because a check is a ConditionLog
 * either way.
 */
export const recordRoomCheckInput = resourceIdInput.extend({
  condition: conditionType.default('Normal'),
  note: z.string().trim().max(1000).optional(),
});
export type RecordRoomCheckInput = z.infer<typeof recordRoomCheckInput>;

export const roomCheckOutput = z.object({
  resourceKey: z.number().int(),
  conditionKey: z.number().int(),
  condition: conditionType,
  note: z.string().nullable(),
  checkedAt: isoDateTime,
  /** False when the check took the room out of service. */
  stillBookable: z.boolean(),
});

// ---------------------------------------------------------------------------
// Repair (R02 "การติดตามการซ่อมบำรุง")
// ---------------------------------------------------------------------------

export const repairOutput = z.object({
  repairKey: z.number().int(),
  resourceKey: z.number().int(),
  itemName: z.string().nullable(),
  serialNo: z.string().nullable(),
  repairedByName: z.string(),
  conditionBefore: conditionType,
  conditionAfter: conditionType.nullable(),
  beganAt: isoDateTime,
  finishedAt: isoDateTimeNullable,
});

export const paginatedRepairs = paginated(repairOutput);

export const listRepairsInput = paginationInput.extend({
  /** Default: only repairs still open, which is what the workshop list means. */
  openOnly: z.boolean().default(true),
});
export type ListRepairsInput = z.infer<typeof listRepairsInput>;

export const startRepairInput = resourceIdInput.extend({
  note: z.string().trim().max(1000).optional(),
});
export type StartRepairInput = z.infer<typeof startRepairInput>;

export const finishRepairInput = z.object({
  repairKey: z.number().int().positive(),
  /** What the unit is like now. `Normal` puts it back in the pool. */
  condition: conditionType.default('Normal'),
  note: z.string().trim().max(1000).optional(),
});
export type FinishRepairInput = z.infer<typeof finishRepairInput>;

// ---------------------------------------------------------------------------
// Decommission (R02) — declared, not yet storable
// ---------------------------------------------------------------------------

/**
 * Propose retiring a unit (§5.7 note, §5.9 supervisor table).
 *
 * The schema has nowhere to keep a proposal: it needs a request row with a
 * proposer, a supervisor decision and an audit entry, and none of those tables
 * exist. Declared so the frontend can build the screen against a real type, and
 * throws NOT_IMPLEMENTED naming what is missing — see docs/staff.md.
 */
export const proposeDecommissionInput = resourceIdInput.extend({
  reason: z.string().trim().min(1).max(1000),
});
export type ProposeDecommissionInput = z.infer<typeof proposeDecommissionInput>;

export const decommissionRequestOutput = z.object({
  requestKey: z.number().int(),
  resourceKey: z.number().int(),
  reason: z.string(),
  proposedByAccountKey: z.number().int(),
  proposedAt: isoDateTime,
  status: z.enum(['Pending', 'Approved', 'Rejected']),
});
