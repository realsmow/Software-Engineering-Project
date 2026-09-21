import type { ConditionType, Paginated } from "@/features/staff/queue/queue.types";
import type { DamageLevel } from "@/types/domain";

/**
 * The repair workshop, mirroring backend/src/inspection/inspection.schema.ts.
 *
 * These shapes are declared here rather than taken from server/trpc-contract.ts
 * because the contract types every repair procedure as `unknown`: it was written
 * when nothing called them. Verified field by field against the backend schema
 * and against live responses from `inspection.listRepairs`, `startRepair`,
 * `finishRepair`, `listForResource` and `recordRoomCheck`.
 */

/** ConditionType values that take a unit out of the pool (UNUSABLE_CONDITIONS). */
export const UNUSABLE_CONDITIONS: ConditionType[] = [
  "MajorDamage",
  "Broken",
  "Missing",
];

/** Every condition a repair or a room check may end on, worst last. */
export const CONDITIONS: ConditionType[] = [
  "Normal",
  "MinorDamage",
  "MajorDamage",
  "Broken",
  "Missing",
];

/** One RepairLog row. `finishedAt === null` is what "still open" means. */
export interface Repair {
  repairKey: number;
  resourceKey: number;
  itemName: string | null;
  serialNo: string | null;
  repairedByName: string;
  /** The condition the unit went in with, from its ConditionLog at that moment. */
  conditionBefore: ConditionType;
  /** Null until the repair is closed. */
  conditionAfter: ConditionType | null;
  beganAt: string;
  finishedAt: string | null;
}

export type PaginatedRepairs = Paginated<Repair>;

/** One past grade on a unit, keyed to its serial (proposal 5.7). */
export interface InspectionHistoryEntry {
  inspectionKey: number;
  usageKey: number;
  condition: ConditionType;
  /** Null when the condition has no B-grade equivalent, i.e. `Missing`. */
  level: DamageLevel | null;
  note: string | null;
  inspectedAt: string | null;
  inspectorName: string;
  borrowerStudentId: string;
}

/** The result of one T3 walk-round. */
export interface RoomCheckResult {
  resourceKey: number;
  conditionKey: number;
  condition: ConditionType;
  note: string | null;
  checkedAt: string;
  /** False when the check took the room out of service. */
  stillBookable: boolean;
}

/**
 * What `proposeDecommission` would answer.
 *
 * Declared for completeness; the server has nowhere to store a proposal and
 * answers NOT_IMPLEMENTED, so nothing has ever received one of these.
 */
export interface DecommissionRequest {
  requestKey: number;
  resourceKey: number;
  reason: string;
  proposedByAccountKey: number;
  proposedAt: string;
  status: "Pending" | "Approved" | "Rejected";
}

/** Whether a condition leaves the unit lendable once the repair closes. */
export function isUsable(condition: ConditionType): boolean {
  return !UNUSABLE_CONDITIONS.includes(condition);
}
