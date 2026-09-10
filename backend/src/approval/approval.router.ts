import {
  Ctx,
  Input,
  Mutation,
  Query,
  Router,
  UseMiddlewares,
} from 'nestjs-trpc';
import { StaffMiddleware } from '../trpc/auth.middleware';
import type { TrpcContext } from '../trpc/context';
import {
  approvalCounts,
  decideApprovalInput,
  decideApprovalOutput,
  listApprovalQueueInput,
  paginatedApprovalQueue,
  type DecideApprovalInput,
  type ListApprovalQueueInput,
} from './approval.schema';
import {
  decideExtensionInput,
  extensionOutput,
  listExtensionReviewsInput,
  paginatedExtensionReviews,
  type DecideExtensionInput,
  type ListExtensionReviewsInput,
} from '../loan/loan.schema';
import { ApprovalService } from './approval.service';
import { LoanExtensionService } from '../loan/loan.extension.service';

/**
 * The approval desk (CONTRACT.md `approval.*`, proposal §5.4).
 *
 * Gated at StaffMiddleware rather than SupervisorMiddleware because the queue
 * is shared: staff clear the T0/T1 requests that did not qualify for automatic
 * approval, supervisors clear T2 and anything a shaky credit band pulled up to
 * them. Which rows a caller can see or decide is settled per row by
 * `approval-policy.ts`, not by the middleware - a floor of "staff" is the most
 * the middleware can honestly assert.
 */
@Router({ alias: 'approval' })
@UseMiddlewares(StaffMiddleware)
export class ApprovalRouter {
  constructor(
    private readonly approvals: ApprovalService,
    private readonly extensions: LoanExtensionService,
  ) {}

  /**
   * Everything waiting on the caller, oldest first.
   *
   * POLLED every 30-60s per CONTRACT.md, and always paginated.
   */
  @Query({ input: listApprovalQueueInput, output: paginatedApprovalQueue })
  queue(@Input() input: ListApprovalQueueInput, @Ctx() ctx: TrpcContext) {
    return this.approvals.listQueue(ctx.user!, input);
  }

  /** Four numbers for the dashboard tile. Polled alongside the queue. */
  @Query({ output: approvalCounts })
  counts(@Ctx() ctx: TrpcContext) {
    return this.approvals.counts(ctx.user!);
  }

  /**
   * Approve or reject one request.
   *
   * Approving also cancels every pending request that wanted the same unit
   * over a window that touches this one, buffer included - they come back in
   * `cancelled` so the desk can see what the decision cost.
   */
  @Mutation({ input: decideApprovalInput, output: decideApprovalOutput })
  decide(@Input() input: DecideApprovalInput, @Ctx() ctx: TrpcContext) {
    return this.approvals.decide(ctx.user!, input);
  }

  // ── Extensions (§5.4) ────────────────────────────────────────────────────
  //
  // The same two procedures as `loan.extensionReviews` / `loan.decideExtension`,
  // pointed at the same service, and deliberately not a second implementation:
  // one extension is granted once, by whichever desk it was routed to. They are
  // exposed here as well because a supervisor works from the approval screen and
  // should not have to open the counter's to clear T2 — `route` is what
  // separates the two piles, and `canDecide` enforces it either way.

  /** Extension requests waiting on the caller. Default: T2 and anything else routed up. */
  @Query({
    input: listExtensionReviewsInput,
    output: paginatedExtensionReviews,
  })
  extensionQueue(
    @Input() input: ListExtensionReviewsInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.extensions.listReviews(ctx.user!, {
      ...input,
      route: input.route ?? 'supervisor',
    });
  }

  /** Grant or refuse one extension. */
  @Mutation({ input: decideExtensionInput, output: extensionOutput })
  decideExtension(
    @Input() input: DecideExtensionInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.extensions.decide(ctx.user!, input);
  }
}
