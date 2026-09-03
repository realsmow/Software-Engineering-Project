import { z } from 'zod';
import {
  paginated,
  paginationInput,
} from '../common/schemas/pagination.schema';
import {
  isoDateTime,
  isoDateTimeNullable,
} from '../common/schemas/datetime.schema';
import { creditTier, resourceTier } from '../common/schemas/status.schema';
import { approvalRoute, borrowerRef, requestOutput } from '../loan/loan.schema';

/**
 * The approval desk (proposal §5.4, CONTRACT.md `approval.*`).
 *
 * Two audiences share one queue, split by `route`: T2 equipment and anything
 * from a shaky credit band go to a supervisor, everything else that is not
 * auto-approved goes to the department's staff. The split is computed, never
 * stored - common/approval/approval-policy.ts is the only table of it.
 *
 * Requests the system cleared on its own never appear here at all. They are
 * already `Approved` with `AutoApproved: true` the moment they are opened.
 */

export const approvalIdInput = z.object({
  reservationKey: z.number().int().positive(),
});

/** One row of the queue - enough to decide without opening the request. */
export const approvalQueueRow = z.object({
  reservationKey: z.number().int(),
  requestedAt: isoDateTime,
  borrower: borrowerRef,
  /** The band that put this row on this desk, when it was not the tier. */
  creditTier,
  route: approvalRoute,
  resourceKey: z.number().int(),
  itemName: z.string().nullable(),
  serialNo: z.string().nullable(),
  kind: z.enum(['equipment', 'room']),
  tier: resourceTier.nullable(),
  startTime: isoDateTime,
  endTime: isoDateTime,
  requestedDays: z.number().int().min(0),
  reason: z.string().nullable(),
  /**
   * Other requests this one would knock out if approved - same unit, windows
   * that touch once the unit's buffer is applied. Shown before the decision
   * because approving is what cancels them.
   */
  clashesWith: z.array(
    z.object({
      reservationKey: z.number().int(),
      borrowerName: z.string(),
      startTime: isoDateTime,
      endTime: isoDateTime,
    }),
  ),
});

export const paginatedApprovalQueue = paginated(approvalQueueRow);

export const listApprovalQueueInput = paginationInput
  .omit({ sort: true, order: true })
  .extend({
    /** Omit to see everything the caller is allowed to decide. */
    route: approvalRoute.exclude(['auto']).optional(),
    tier: resourceTier.optional(),
  });
export type ListApprovalQueueInput = z.infer<typeof listApprovalQueueInput>;

/**
 * Approve or reject one request.
 *
 * `reason` is required on a rejection and ignored on an approval: a borrower
 * whose request is refused is owed an explanation, and §5.9 puts that on the
 * person deciding rather than on a generic message.
 */
export const decideApprovalInput = approvalIdInput
  .extend({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().max(500).optional(),
  })
  .refine(
    (v) => v.decision === 'approve' || (v.reason?.trim().length ?? 0) > 0,
    {
      message: 'A rejection must say why',
      path: ['reason'],
    },
  );
export type DecideApprovalInput = z.infer<typeof decideApprovalInput>;

/**
 * What the decision did.
 *
 * `cancelled` is the part that is easy to miss: approving one request cancels
 * every other pending request that wanted the same unit over an overlapping
 * window. Returning them makes that visible at the desk instead of surfacing
 * later as "my request vanished".
 */
export const decideApprovalOutput = z.object({
  request: requestOutput,
  cancelled: z.array(
    z.object({
      reservationKey: z.number().int(),
      borrower: borrowerRef,
      startTime: isoDateTime,
      endTime: isoDateTime,
    }),
  ),
});

export const approvalCounts = z.object({
  /** Waiting on staff. */
  staff: z.number().int().min(0),
  /** Waiting on a supervisor. */
  supervisor: z.number().int().min(0),
  /** Of those, the ones whose start time has already passed. */
  overdueToDecide: z.number().int().min(0),
  /** Cleared by the system today, for the dashboard's "ระบบอนุมัติเอง" figure. */
  autoApprovedToday: z.number().int().min(0),
  asOf: isoDateTimeNullable,
});
