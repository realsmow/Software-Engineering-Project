import { z } from 'zod';
import {
  paginated,
  paginationInput,
} from '../common/schemas/pagination.schema';
import {
  isoDateTime,
  isoDateTimeNullable,
} from '../common/schemas/datetime.schema';
import {
  approveStatus,
  conditionType,
  resourceTier,
  usageStatus,
} from '../common/schemas/status.schema';

/**
 * The handover desk (proposal §5.9 "งานประจำวัน").
 *
 * This is the staff half of the loan domain. The borrower half — `loan.list`,
 * `loan.getById`, `loan.create`, `loan.cancel`, `loan.requestExtension` — is
 * not here; it belongs to the borrower slice and goes in the same router.
 *
 * One loan is one UsageLog row moving through Pending -> Prepared -> Lended ->
 * Returned -> Inspected. Each procedure below moves it exactly one step and
 * refuses from any other state, so a double-clicked button cannot skip one.
 */

export const usageIdInput = z.object({ usageKey: z.number().int().positive() });
export const reservationIdInput = z.object({
  reservationKey: z.number().int().positive(),
});

// ---------------------------------------------------------------------------
// The staff work queue
// ---------------------------------------------------------------------------

/**
 * Which pile of work to show.
 *
 * These are the two lists "คิวงานฝั่งเจ้าหน้าที่ (คำขอรอจัดเตรียม, ของรอรับคืน)" from
 * the polling table, plus the two the daily-task table adds. Separate buckets
 * rather than a status filter because `toPrepare` reads from Reservations while
 * the rest read from UsageLog — they are not the same row at all.
 */
export const staffQueueBucket = z.enum([
  /** Approved requests with nothing set aside yet */
  'toPrepare',
  /** Set aside, waiting for the borrower to walk in */
  'toHandover',
  /** Out with a borrower */
  'onLoan',
  /** Out with a borrower and past due */
  'overdue',
]);
export type StaffQueueBucket = z.infer<typeof staffQueueBucket>;

export const listStaffQueueInput = paginationInput.extend({
  bucket: staffQueueBucket,
  tier: resourceTier.optional(),
});
export type ListStaffQueueInput = z.infer<typeof listStaffQueueInput>;

/** Who is on the other side of the counter. */
export const borrowerRef = z.object({
  accountKey: z.number().int(),
  studentId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  creditScore: z.number().int(),
});

export const staffQueueRow = z.object({
  /**
   * Null in the `toPrepare` bucket: nothing has been set aside yet, so there is
   * no UsageLog to point at — `reservationKey` is what `loan.allocate` takes.
   */
  usageKey: z.number().int().nullable(),
  reservationKey: z.number().int().nullable(),
  status: usageStatus.nullable(),
  borrower: borrowerRef,
  itemName: z.string().nullable(),
  /** Null until a unit is chosen — the point of the `toPrepare` queue. */
  serialNo: z.string().nullable(),
  resourceKey: z.number().int().nullable(),
  tier: resourceTier.nullable(),
  /** Days staff need between return and re-issue (ResourceInfo.BufferTime). */
  prepDays: z.number().int().min(0),
  /** When the borrower said they would collect it. */
  pickupAt: isoDateTimeNullable,
  dueAt: isoDateTimeNullable,
  /** Zero unless the loan is past due; whole days, rounded up. */
  overdueDays: z.number().int().min(0),
  /** True once the overdue window has run long enough to write the thing off. */
  lostEligible: z.boolean(),
});

export const paginatedStaffQueue = paginated(staffQueueRow);

/** The dashboard tiles. One cheap query per bucket, polled every 30s. */
export const staffQueueCounts = z.object({
  toPrepare: z.number().int().min(0),
  toHandover: z.number().int().min(0),
  onLoan: z.number().int().min(0),
  overdue: z.number().int().min(0),
  /** Returned but not yet graded — the inspection desk's backlog. */
  toInspect: z.number().int().min(0),
  /** Extension requests waiting for a physical condition check. */
  extensionsToInspect: z.number().int().min(0),
});

// ---------------------------------------------------------------------------
// One loan in full
// ---------------------------------------------------------------------------

export const loanOutput = z.object({
  usageKey: z.number().int(),
  reservationKey: z.number().int().nullable(),
  status: usageStatus,
  borrower: borrowerRef,
  itemName: z.string().nullable(),
  serialNo: z.string().nullable(),
  resourceKey: z.number().int(),
  tier: resourceTier.nullable(),
  /** Condition staff recorded when they set the unit aside. */
  checkoutCondition: conditionType.nullable(),
  checkoutConditionNote: z.string().nullable(),
  /** Condition recorded at the counter on return; null until it comes back. */
  checkinCondition: conditionType.nullable(),
  checkoutAt: isoDateTime,
  dueAt: isoDateTime,
  returnedAt: isoDateTimeNullable,
  overdueDays: z.number().int().min(0),
  /** Extension request currently waiting on somebody, if any. */
  pendingExtensionKey: z.number().int().nullable(),
});

// ---------------------------------------------------------------------------
// Preparing and handing over
// ---------------------------------------------------------------------------

/**
 * Set a unit aside for an approved request (§5.9 "จัดเตรียม").
 *
 * `resourceKey` is optional because a T1 request names a type, not a unit, and
 * the reservation carries whichever unit the system picked. Passing one swaps
 * to a different unit of the same type — that is the "ระบบเสนอชิ้นที่ว่างก่อน"
 * step, where staff take the suggestion or override it.
 *
 * The condition recorded here is the baseline the return is compared against,
 * which is why it is captured at prep time and not at the counter: whatever is
 * wrong with the unit before it leaves must not become the borrower's problem.
 */
export const allocateLoanInput = reservationIdInput.extend({
  resourceKey: z.number().int().positive().optional(),
  condition: conditionType.default('Normal'),
  note: z.string().trim().max(500).optional(),
});
export type AllocateLoanInput = z.infer<typeof allocateLoanInput>;

/** Swap the reserved unit for another of the same type. T1 only (§5.4). */
export const swapUnitInput = usageIdInput.extend({
  resourceKey: z.number().int().positive(),
  reason: z.string().trim().max(500).optional(),
});
export type SwapUnitInput = z.infer<typeof swapUnitInput>;

/**
 * Hand it over (§5.9 "ส่งมอบ").
 *
 * No image is uploaded here. Photos go straight to storage and are attached by
 * the borrower's own confirmation step (CONTRACT.md §3) — this procedure only
 * records that the thing physically left the counter.
 */
export const confirmPickupInput = usageIdInput.extend({
  note: z.string().trim().max(500).optional(),
});
export type ConfirmPickupInput = z.infer<typeof confirmPickupInput>;

/**
 * Take it back (§5.9 "รับคืนและตรวจสภาพ", first half).
 *
 * Deliberately does not grade the damage: this records the moment the item
 * came back, which is what the late penalty is calculated from, and leaves the
 * grade to `inspection.create`. Splitting them means a queue of returns can be
 * cleared at a busy counter and inspected afterwards, which is how the desk
 * actually runs.
 *
 * The late penalty is applied here, because lateness is settled by the clock
 * and does not depend on what the inspection finds.
 */
export const recordReturnInput = usageIdInput.extend({
  note: z.string().trim().max(500).optional(),
});
export type RecordReturnInput = z.infer<typeof recordReturnInput>;

export const recordReturnOutput = z.object({
  loan: loanOutput,
  /** Null when the return was on time. */
  latePenalty: z
    .object({
      penaltyKey: z.number().int(),
      creditDeducted: z.number().int(),
      overdueDays: z.number().int(),
      expiresAt: isoDateTime,
    })
    .nullable(),
});

/**
 * Write a unit off as lost (§5.7: two weeks past due).
 *
 * Also reachable by the daily "mark lost" job. Kept as a staff action too
 * because the proposal has the borrower come and report it in person
 * ("ผู้ยืมต้องติดต่อเจ้าหน้าที่เพื่อรายงาน"), and the penalty clock then starts from
 * that report rather than from the deadline.
 */
export const markLostInput = usageIdInput.extend({
  reason: z.string().trim().max(500).optional(),
  /**
   * Report the loss before the two-week mark, on the borrower's word.
   * Recorded in the penalty note, because it means a human decided this.
   */
  reportedByBorrower: z.boolean().default(false),
});
export type MarkLostInput = z.infer<typeof markLostInput>;

// ---------------------------------------------------------------------------
// Extensions that need the item on the counter
// ---------------------------------------------------------------------------

/**
 * The extension requests staff have to settle in person.
 *
 * T1 alternates: one extension online, then the item must be brought in for a
 * condition check before the next one (§5.4). D2 borrowers lose the online
 * option entirely (§5.7). Both land here.
 */
export const extensionReviewRow = z.object({
  extensionKey: z.number().int(),
  usageKey: z.number().int(),
  borrower: borrowerRef,
  itemName: z.string().nullable(),
  serialNo: z.string().nullable(),
  tier: resourceTier.nullable(),
  /** Which extension of this loan it is (ExtensionRequest.ExtendNo). */
  extendNo: z.number().int().nullable(),
  previousDueAt: isoDateTime,
  requestedDueAt: isoDateTime,
  requestedAt: isoDateTime,
  status: approveStatus,
});

export const paginatedExtensionReviews = paginated(extensionReviewRow);

export const decideExtensionInput = z.object({
  extensionKey: z.number().int().positive(),
  decision: z.enum(['approve', 'reject']),
  /** Condition found on the counter. Required to approve — that is the point. */
  condition: conditionType.default('Normal'),
  note: z.string().trim().max(500).optional(),
});
export type DecideExtensionInput = z.infer<typeof decideExtensionInput>;

// ===========================================================================
// Borrower slice — opening a request, tracking it, cancelling it
//
// A request is one `Reservations` row. A basket of five items is five rows
// that move independently: the frontend already models it that way ("submitting
// a basket of five items produces five independent requests that move at their
// own speed", frontend/src/features/borrower/mock-data.ts), and the schema has
// no table to group them under.
// ===========================================================================

/** Where a request has got to, as one string the borrower's card can show. */
export const requestStatus = z.enum([
  'pending', // waiting on a person
  'approved', // cleared, nothing set aside yet
  'preparing', // staff have a unit on the bench
  'ready', // on the shelf with the borrower's name on it
  'inUse', // collected
  'returned', // back, not yet graded
  'done', // graded, finished
  'rejected',
  'cancelled',
]);
export type RequestStatus = z.infer<typeof requestStatus>;

/** Who still has to say yes. `auto` means nobody did — the system cleared it. */
export const approvalRoute = z.enum(['auto', 'staff', 'supervisor']);

export const requestIdInput = z.object({
  reservationKey: z.number().int().positive(),
});

/**
 * One line of a basket.
 *
 * `resourceKey` names a physical unit rather than a type because
 * `Reservations.ResourceKey` is not nullable — something has to be reserved.
 * For T0/T1 the client sends whichever unit the catalogue showed as free and
 * staff may swap it at the counter (`loan.swapUnit`); for T2 the unit is the
 * point, and the supervisor approves that serial.
 */
export const createRequestLine = z.object({
  resourceKey: z.number().int().positive(),
  reason: z.string().max(500).optional(),
});

/**
 * Open one or more requests over the same window.
 *
 * The window is per basket, not per line, matching the request screen: one
 * pickup date and one return date across everything in it.
 *
 * `startTime`/`endTime` are full instants rather than dates because T3 rooms
 * are booked by the hour. Equipment clients send the agreed counter times.
 */
export const createRequestInput = z.object({
  startTime: isoDateTime,
  endTime: isoDateTime,
  lines: z.array(createRequestLine).min(1).max(10),
});
export type CreateRequestInput = z.infer<typeof createRequestInput>;

/** The thing being asked for, thin enough for a list card. */
export const requestResourceRef = z.object({
  resourceKey: z.number().int(),
  name: z.string().nullable(),
  /** Asset tag for equipment, null for a room. */
  serialNo: z.string().nullable(),
  kind: z.enum(['equipment', 'room']),
  tier: resourceTier.nullable(),
  creditWeight: z.number(),
});

/** Who signed off, when, and whether a person was involved at all. */
export const approvalTrail = z.object({
  route: approvalRoute,
  status: approveStatus,
  /** Null while pending, and null when the system cleared it — see `autoApproved`. */
  approvedBy: borrowerRef.nullable(),
  autoApproved: z.boolean(),
  approvedAt: isoDateTimeNullable,
  resolvedAt: isoDateTimeNullable,
});

export const requestOutput = z.object({
  reservationKey: z.number().int(),
  status: requestStatus,
  resource: requestResourceRef,
  startTime: isoDateTime,
  endTime: isoDateTime,
  reason: z.string().nullable(),
  requestedAt: isoDateTime,
  /** When an approved request stops being held for the borrower (§5.9). */
  expiresAt: isoDateTimeNullable,
  approval: approvalTrail,
  /** Set once staff have prepared a unit; null while the request is only a request. */
  usageKey: z.number().int().nullable(),
  /** True while the borrower can still call `loan.cancel` on it. */
  cancellable: z.boolean(),
});

export const listMyRequestsInput = paginationInput
  .omit({ sort: true, order: true })
  .extend({
    /** The three tabs on "คำขอของฉัน". Omit for everything. */
    tab: z.enum(['active', 'using', 'history']).optional(),
  });
export type ListMyRequestsInput = z.infer<typeof listMyRequestsInput>;

export const paginatedRequests = paginated(requestOutput);

/**
 * What opening a basket produced.
 *
 * Every line gets a row even when it was refused, so the client can show which
 * ones went through and why the rest did not, instead of failing the whole
 * basket because one item was out.
 */
export const createRequestOutput = z.object({
  created: z.array(requestOutput),
  rejected: z.array(
    z.object({
      resourceKey: z.number().int(),
      /** The BusinessError code this line would have thrown on its own. */
      code: z.string(),
      detail: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
});

export const cancelRequestInput = requestIdInput.extend({
  reason: z.string().max(500).optional(),
});
export type CancelRequestInput = z.infer<typeof cancelRequestInput>;
