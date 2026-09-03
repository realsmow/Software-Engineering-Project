import {
  Ctx,
  Input,
  Mutation,
  Query,
  Router,
  UseMiddlewares,
} from 'nestjs-trpc';
import { AuthMiddleware, StaffMiddleware } from '../trpc/auth.middleware';
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
  cancelRequestInput,
  createRequestInput,
  createRequestOutput,
  listMyRequestsInput,
  paginatedRequests,
  requestIdInput,
  requestOutput,
  type CancelRequestInput,
  type CreateRequestInput,
  type ListMyRequestsInput,
} from './loan.schema';
import { LoanService } from './loan.service';
import { LoanRequestService } from './loan.request.service';

/**
 * The loan domain - both halves (ว-05).
 *
 * Middleware is per-procedure, not on the class, because the two halves have
 * different audiences: the borrower slice (`create`, `list`, `getById`,
 * `cancel`) runs on AuthMiddleware and checks row ownership itself, while the
 * staff slice (`staffQueue`, `allocate`, `confirmPickup`, `recordReturn`, …)
 * runs on StaffMiddleware and is scoped to the caller's department.
 *
 * The names were chosen not to collide across that boundary (`list` vs
 * `staffQueue`, `getById` vs `getForStaff`) so no borrower-looking name ever
 * reaches a staff-only view.
 *
 * Two of these are on the polling list: `staffQueue` and `queueCounts` are
 * refetched every 30 seconds, so both are paginated and neither loads an image
 * or a history — the queue row carries only what the counter reads off it.
 */
@Router({ alias: 'loan' })
export class LoanRouter {
  constructor(
    private readonly loanService: LoanService,
    private readonly requests: LoanRequestService,
  ) {}

  // ═══ Borrower slice — opening a request, tracking it, calling it off ══════
  //
  // AuthMiddleware, not StaffMiddleware: these act on the caller's own rows and
  // check ownership themselves. Names chosen not to collide with the staff half
  // below (`list` vs `staffQueue`, `getById` vs `getForStaff`), per ว-05.

  /**
   * Opens one request per basket line over a shared window.
   *
   * Checks, in order: the borrower's credit band may open a request at all,
   * the window is sane, they are eligible for each item (Eligibility x
   * Authority + MinimumAuthorityLevel), the loan is not longer than their band
   * allows, and nothing else holds the unit over that window plus its buffer.
   *
   * Lines that fail come back in `rejected` rather than failing the basket.
   */
  @UseMiddlewares(AuthMiddleware)
  @Mutation({ input: createRequestInput, output: createRequestOutput })
  create(@Input() input: CreateRequestInput, @Ctx() ctx: TrpcContext) {
    return this.requests.create(ctx.user!, input);
  }

  /** The caller's own requests. `tab` matches the three tabs on คำขอของฉัน. */
  @UseMiddlewares(AuthMiddleware)
  @Query({ input: listMyRequestsInput, output: paginatedRequests })
  list(@Input() input: ListMyRequestsInput, @Ctx() ctx: TrpcContext) {
    return this.requests.listMine(ctx.user!, input);
  }

  /** One of the caller's own requests, with where the approval got to. */
  @UseMiddlewares(AuthMiddleware)
  @Query({ input: requestIdInput, output: requestOutput })
  getById(@Input() input: { reservationKey: number }, @Ctx() ctx: TrpcContext) {
    return this.requests.getMine(ctx.user!, input.reservationKey);
  }

  /**
   * Calls off the caller's own request.
   *
   * Only while nothing physical has happened: once staff have set a unit aside
   * it goes back through the counter, not from here.
   */
  @UseMiddlewares(AuthMiddleware)
  @Mutation({ input: cancelRequestInput, output: requestOutput })
  cancel(@Input() input: CancelRequestInput, @Ctx() ctx: TrpcContext) {
    return this.requests.cancel(ctx.user!, input);
  }

  // ═══ Staff slice — the handover desk ═════════════════════════════════════

  // ── The queue ───────────────────────────────────────────────────────────

  /** Polled every 30s. `q` matches borrower name/ID, serial, or item name. */
  @UseMiddlewares(StaffMiddleware)
  @Query({ input: listStaffQueueInput, output: paginatedStaffQueue })
  staffQueue(@Input() input: ListStaffQueueInput, @Ctx() ctx: TrpcContext) {
    return this.loanService.listStaffQueue(ctx.user!, input);
  }

  /** Polled every 30s by the staff dashboard. Counts only. */
  @UseMiddlewares(StaffMiddleware)
  @Query({ output: staffQueueCounts })
  queueCounts(@Ctx() ctx: TrpcContext) {
    return this.loanService.getQueueCounts(ctx.user!);
  }

  @UseMiddlewares(StaffMiddleware)
  @Query({ input: usageIdInput, output: loanOutput })
  getForStaff(@Input() input: { usageKey: number }, @Ctx() ctx: TrpcContext) {
    return this.loanService.getLoanById(ctx.user!, input.usageKey);
  }

  // ── Preparing and handing over ──────────────────────────────────────────

  /** Sets a unit aside and opens the loan in `Prepared`. */
  @UseMiddlewares(StaffMiddleware)
  @Mutation({ input: allocateLoanInput, output: loanOutput })
  allocate(@Input() input: AllocateLoanInput, @Ctx() ctx: TrpcContext) {
    return this.loanService.allocate(ctx.user!, input);
  }

  /** Borrower asks for a different unit at the counter. T1 only. */
  @UseMiddlewares(StaffMiddleware)
  @Mutation({ input: swapUnitInput, output: loanOutput })
  swapUnit(@Input() input: SwapUnitInput, @Ctx() ctx: TrpcContext) {
    return this.loanService.swapUnit(ctx.user!, input);
  }

  @UseMiddlewares(StaffMiddleware)
  @Mutation({ input: confirmPickupInput, output: loanOutput })
  confirmPickup(@Input() input: ConfirmPickupInput, @Ctx() ctx: TrpcContext) {
    return this.loanService.confirmPickup(ctx.user!, input);
  }

  /**
   * Takes the item back and settles lateness. Grading happens separately, in
   * `inspection.create` — see the note on `recordReturnInput`.
   */
  @UseMiddlewares(StaffMiddleware)
  @Mutation({ input: recordReturnInput, output: recordReturnOutput })
  recordReturn(@Input() input: RecordReturnInput, @Ctx() ctx: TrpcContext) {
    return this.loanService.recordReturn(ctx.user!, input);
  }

  /** Two weeks past due, or reported lost in person. */
  @UseMiddlewares(StaffMiddleware)
  @Mutation({ input: markLostInput, output: loanOutput })
  markLost(@Input() input: MarkLostInput, @Ctx() ctx: TrpcContext) {
    return this.loanService.markLost(ctx.user!, input);
  }

  // ── Extensions settled at the counter ───────────────────────────────────

  /** T1 extensions that need the item inspected. T2 is the supervisor's queue. */
  @UseMiddlewares(StaffMiddleware)
  @Query({ input: paginationInput, output: paginatedExtensionReviews })
  extensionReviews(@Input() input: PaginationInput, @Ctx() ctx: TrpcContext) {
    return this.loanService.listExtensionReviews(ctx.user!, input);
  }

  @UseMiddlewares(StaffMiddleware)
  @Mutation({ input: decideExtensionInput, output: loanOutput })
  decideExtension(
    @Input() input: DecideExtensionInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.loanService.decideExtension(ctx.user!, input);
  }
}
