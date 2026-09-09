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
  allocateLoanInput,
  cancelExtensionInput,
  confirmPickupInput,
  decideExtensionInput,
  extensionOptionsOutput,
  extensionOutput,
  listExtensionReviewsInput,
  listMyExtensionsInput,
  listStaffQueueInput,
  loanOutput,
  markLostInput,
  paginatedExtensionReviews,
  paginatedExtensions,
  paginatedStaffQueue,
  recordReturnInput,
  recordReturnOutput,
  requestExtensionInput,
  staffQueueCounts,
  swapUnitInput,
  usageIdInput,
  type AllocateLoanInput,
  type CancelExtensionInput,
  type ConfirmPickupInput,
  type DecideExtensionInput,
  type ListExtensionReviewsInput,
  type ListMyExtensionsInput,
  type ListStaffQueueInput,
  type MarkLostInput,
  type RecordReturnInput,
  type RequestExtensionInput,
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
import { LoanExtensionService } from './loan.extension.service';

/**
 * The loan domain (ว-05), both halves.
 *
 * The borrower's procedures act on the caller's own rows and check ownership
 * themselves (AuthMiddleware); the staff ones act on a department's rows and go
 * through StaffScopeService (StaffMiddleware). The two halves share this router
 * because they are the same loan seen from two sides, and the names are chosen
 * not to collide: `list` vs `staffQueue`, `getById` vs `getForStaff`.
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
    private readonly extensions: LoanExtensionService,
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

  // ── Keeping it longer (§5.4 "ขอต่ออายุการยืม") ──────────────────────────

  /**
   * What the borrower may ask for, before they ask.
   *
   * A dry run of `requestExtension`: same checks, no writes, and every refusal
   * comes back as `blockedBy` rather than an error, because "this one cannot be
   * extended" is the ordinary answer for most loans.
   */
  @UseMiddlewares(AuthMiddleware)
  @Query({ input: usageIdInput, output: extensionOptionsOutput })
  extensionOptions(
    @Input() input: { usageKey: number },
    @Ctx() ctx: TrpcContext,
  ) {
    return this.extensions.getOptions(ctx.user!, input.usageKey);
  }

  /**
   * Ask to keep something longer.
   *
   * Granted on the spot when the borrower's band and the item's tier allow an
   * online renewal (§5.4) — the response already carries the new due date.
   * Otherwise it is queued for whichever desk `route` names, and the item has
   * to be brought in.
   */
  @UseMiddlewares(AuthMiddleware)
  @Mutation({ input: requestExtensionInput, output: extensionOutput })
  requestExtension(
    @Input() input: RequestExtensionInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.extensions.request(ctx.user!, input);
  }

  /** The caller's own extension requests, newest first. */
  @UseMiddlewares(AuthMiddleware)
  @Query({ input: listMyExtensionsInput, output: paginatedExtensions })
  myExtensions(@Input() input: ListMyExtensionsInput, @Ctx() ctx: TrpcContext) {
    return this.extensions.listMine(ctx.user!, input);
  }

  /** Withdraw one nobody has answered yet. Costs no quota. */
  @UseMiddlewares(AuthMiddleware)
  @Mutation({ input: cancelExtensionInput, output: extensionOutput })
  cancelExtension(
    @Input() input: CancelExtensionInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.extensions.cancel(ctx.user!, input);
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

  /**
   * Extensions that need the item on the counter.
   *
   * Shows only what the caller may actually decide: T2 belongs to a supervisor
   * and never appears in a staff member's pile (`approval.extensionQueue` is
   * the same list from that desk). A supervisor standing at the counter sees
   * both, because the route is a floor rather than a job description.
   */
  @UseMiddlewares(StaffMiddleware)
  @Query({
    input: listExtensionReviewsInput,
    output: paginatedExtensionReviews,
  })
  extensionReviews(
    @Input() input: ListExtensionReviewsInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.extensions.listReviews(ctx.user!, input);
  }

  /** Grant or refuse one, recording the condition the item was found in. */
  @UseMiddlewares(StaffMiddleware)
  @Mutation({ input: decideExtensionInput, output: extensionOutput })
  decideExtension(
    @Input() input: DecideExtensionInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.extensions.decide(ctx.user!, input);
  }
}
