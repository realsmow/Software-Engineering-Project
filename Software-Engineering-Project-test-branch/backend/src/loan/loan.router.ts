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
  paginationInput,
  type PaginationInput,
} from '../common/schemas/pagination.schema';
import {
  allocateLoanInput,
  confirmPickupInput,
  decideExtensionInput,
  listStaffQueueInput,
  loanOutput,
  markLostInput,
  paginatedExtensionReviews,
  paginatedStaffQueue,
  recordReturnInput,
  recordReturnOutput,
  staffQueueCounts,
  swapUnitInput,
  usageIdInput,
  type AllocateLoanInput,
  type ConfirmPickupInput,
  type DecideExtensionInput,
  type ListStaffQueueInput,
  type MarkLostInput,
  type RecordReturnInput,
  type SwapUnitInput,
} from './loan.schema';
import { LoanService } from './loan.service';

/**
 * The loan domain — staff half (ว-05).
 *
 * The borrower half (`loan.list`, `loan.getById`, `loan.create`, `loan.cancel`,
 * `loan.requestExtension`) goes in this same router and is not written yet.
 * Nothing here overlaps those names.
 *
 * Two of these are on the polling list: `staffQueue` and `queueCounts` are
 * refetched every 30 seconds, so both are paginated and neither loads an image
 * or a history — the queue row carries only what the counter reads off it.
 */
@Router({ alias: 'loan' })
@UseMiddlewares(StaffMiddleware)
export class LoanRouter {
  constructor(private readonly loanService: LoanService) {}

  // ── The queue ───────────────────────────────────────────────────────────

  /** Polled every 30s. `q` matches borrower name/ID, serial, or item name. */
  @Query({ input: listStaffQueueInput, output: paginatedStaffQueue })
  staffQueue(@Input() input: ListStaffQueueInput, @Ctx() ctx: TrpcContext) {
    return this.loanService.listStaffQueue(ctx.user!, input);
  }

  /** Polled every 30s by the staff dashboard. Counts only. */
  @Query({ output: staffQueueCounts })
  queueCounts(@Ctx() ctx: TrpcContext) {
    return this.loanService.getQueueCounts(ctx.user!);
  }

  @Query({ input: usageIdInput, output: loanOutput })
  getForStaff(@Input() input: { usageKey: number }, @Ctx() ctx: TrpcContext) {
    return this.loanService.getLoanById(ctx.user!, input.usageKey);
  }

  // ── Preparing and handing over ──────────────────────────────────────────

  /** Sets a unit aside and opens the loan in `Prepared`. */
  @Mutation({ input: allocateLoanInput, output: loanOutput })
  allocate(@Input() input: AllocateLoanInput, @Ctx() ctx: TrpcContext) {
    return this.loanService.allocate(ctx.user!, input);
  }

  /** Borrower asks for a different unit at the counter. T1 only. */
  @Mutation({ input: swapUnitInput, output: loanOutput })
  swapUnit(@Input() input: SwapUnitInput, @Ctx() ctx: TrpcContext) {
    return this.loanService.swapUnit(ctx.user!, input);
  }

  @Mutation({ input: confirmPickupInput, output: loanOutput })
  confirmPickup(@Input() input: ConfirmPickupInput, @Ctx() ctx: TrpcContext) {
    return this.loanService.confirmPickup(ctx.user!, input);
  }

  /**
   * Takes the item back and settles lateness. Grading happens separately, in
   * `inspection.create` — see the note on `recordReturnInput`.
   */
  @Mutation({ input: recordReturnInput, output: recordReturnOutput })
  recordReturn(@Input() input: RecordReturnInput, @Ctx() ctx: TrpcContext) {
    return this.loanService.recordReturn(ctx.user!, input);
  }

  /** Two weeks past due, or reported lost in person. */
  @Mutation({ input: markLostInput, output: loanOutput })
  markLost(@Input() input: MarkLostInput, @Ctx() ctx: TrpcContext) {
    return this.loanService.markLost(ctx.user!, input);
  }

  // ── Extensions settled at the counter ───────────────────────────────────

  /** T1 extensions that need the item inspected. T2 is the supervisor's queue. */
  @Query({ input: paginationInput, output: paginatedExtensionReviews })
  extensionReviews(@Input() input: PaginationInput, @Ctx() ctx: TrpcContext) {
    return this.loanService.listExtensionReviews(ctx.user!, input);
  }

  @Mutation({ input: decideExtensionInput, output: loanOutput })
  decideExtension(
    @Input() input: DecideExtensionInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.loanService.decideExtension(ctx.user!, input);
  }
}
