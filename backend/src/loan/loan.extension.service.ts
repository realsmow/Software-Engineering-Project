import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { StaffScopeService } from '../common/authority/staff-scope.service';
import { CreditTierService } from '../common/credit/credit-tier.service';
import { EligibilityService } from '../common/authority/eligibility.service';
import {
  canDecide,
  isBlockedByCredit,
} from '../common/approval/approval-policy';
import {
  extensionRouteFor,
  requiresInspection,
  type ExtensionRoute,
} from '../common/approval/extension-policy';
import {
  clashingWindowFilter,
  runSerializable,
  withBuffer,
} from '../common/booking/booking-window';
import { BusinessError } from '../common/errors/business-error';
import {
  addDays,
  daysBetween,
  toIso,
  toIsoNullable,
} from '../common/schemas/datetime.schema';
import { toPage, toSkipTake } from '../common/schemas/pagination.schema';
import { tryMapTier, type CreditTier } from '../common/schemas/status.schema';
import {
  NotificationService,
  resourceName,
} from '../notification/notification.service';
import type { TrpcUser } from '../trpc/context';
import type {
  CancelExtensionInput,
  DecideExtensionInput,
  ListExtensionReviewsInput,
  ListMyExtensionsInput,
  RequestExtensionInput,
} from './loan.schema';

/** Borrower fields every extension row carries, same shape as LoanService's. */
const BORROWER_SELECT = {
  AccountKey: true,
  UserID: true,
  UserFName: true,
  UserLName: true,
  UserCredit: true,
} as const;

const RESOURCE_SELECT = {
  ResourceKey: true,
  ManagedBy: true,
  BufferTime: true,
  BorrowRule: true,
  BorrowRuleInfo: { select: { RuleName: true } },
  Item: { select: { ItemID: true, Item: { select: { ItemName: true } } } },
  Room: { select: { RoomName: true } },
} satisfies Prisma.ResourceInfoSelect;

const USAGE_SELECT = {
  UsageKey: true,
  ReservationKey: true,
  AccountKey: true,
  CurrentStatus: true,
  DueTime: true,
  PendingExtension: true,
  Account: { select: BORROWER_SELECT },
  Resource: { select: RESOURCE_SELECT },
} satisfies Prisma.UsageLogSelect;

type UsageRow = Prisma.UsageLogGetPayload<{ select: typeof USAGE_SELECT }>;

const EXTENSION_SELECT = {
  ExtensionKey: true,
  UsageKey: true,
  RequestedBy: true,
  ExtendNo: true,
  PreviousDueTime: true,
  RequestedDueTime: true,
  ApproveStatus: true,
  ApprovedBy: true,
  RequestedAt: true,
  ResolvedAt: true,
  Reason: true,
  RequestedByUser: { select: BORROWER_SELECT },
  Usage: { select: USAGE_SELECT },
} satisfies Prisma.ExtensionRequestSelect;

type ExtensionRow = Prisma.ExtensionRequestGetPayload<{
  select: typeof EXTENSION_SELECT;
}>;

/** What the borrow rules allow this borrower on this one loan. */
interface ExtensionAllowance {
  creditTier: CreditTier;
  creditTierKey: number;
  /** Extensions already granted on this loan. */
  used: number;
  /** BorrowConstraints.MaxExtendTime for (the unit's rule x the band). */
  allowed: number;
  /** BorrowConstraints.MaxBorrowDate — the most one extension may add. */
  maxBorrowDays: number;
}

/**
 * Keeping something longer (proposal §5.4 "ขอต่ออายุการยืม").
 *
 * Both halves of the extension live here, and that is the point. A borrower
 * asking and a supervisor granting are the same rule read from two ends: how
 * many extensions are left, whether this one may go through online, and how
 * far the due date may move. Splitting them across the borrower service and
 * the counter service is how the two answers start to disagree — the desk
 * approving what the screen said was impossible, or the other way round.
 *
 * The routing table itself is not here. It is
 * common/approval/extension-policy.ts, tested on its own, because a wrong
 * answer from it type-checks perfectly.
 */
@Injectable()
export class LoanExtensionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: StaffScopeService,
    private readonly creditTiers: CreditTierService,
    private readonly eligibility: EligibilityService,
    private readonly notifications: NotificationService,
  ) {}

  // =========================================================================
  // The borrower's side
  // =========================================================================

  /**
   * A dry run of `request`, for the screen that offers the button.
   *
   * Every refusal `request` can produce is reported here as a code rather than
   * thrown, because "you cannot extend this" is the normal answer for most
   * loans and an error is the wrong shape for a normal answer. The checks run
   * in the order `request` runs them, so the first thing that would stop the
   * borrower is the thing they are told about.
   */
  async getOptions(user: TrpcUser, usageKey: number) {
    const usage = await this.readOwnLoan(user, usageKey);
    const dueAt = usage.DueTime;

    const blocked = (
      code: string,
      extra?: Partial<{
        route: ExtensionRoute;
        used: number;
        allowed: number;
        maxRequestedDueAt: Date;
      }>,
    ) => ({
      usageKey,
      canRequest: false,
      blockedBy: code,
      route: extra?.route ?? null,
      requiresInspection: extra?.route
        ? requiresInspection(extra.route)
        : false,
      currentDueAt: toIso(dueAt),
      maxRequestedDueAt: toIso(extra?.maxRequestedDueAt ?? dueAt),
      extensionsUsed: extra?.used ?? 0,
      extensionsAllowed: extra?.allowed ?? 0,
      pendingExtensionKey: usage.PendingExtension,
    });

    if (usage.CurrentStatus !== 'Lended') return blocked('WRONG_LOAN_STATE');
    if (usage.PendingExtension !== null) {
      return blocked('EXTENSION_ALREADY_PENDING');
    }

    let allowance: ExtensionAllowance;
    try {
      allowance = await this.resolveAllowance(user, usage);
    } catch (error) {
      // Credit band gone, eligibility withdrawn, or BorrowConstraints missing a
      // row. All three are answers, not crashes — the screen shows "ต่ออายุไม่ได้"
      // with the code beside it.
      if (!(error instanceof BusinessError)) throw error;
      return blocked(error.businessCode);
    }

    const route = extensionRouteFor({
      tier: tryMapTier(usage.Resource.BorrowRuleInfo.RuleName),
      creditTier: allowance.creditTier,
      extendNo: allowance.used + 1,
    });

    // The band's ceiling, then whatever the next booking leaves of it. The
    // second is usually the real limit: a unit somebody is queuing for can only
    // be kept until their window starts, buffer included.
    const bandCeiling = addDays(dueAt, allowance.maxBorrowDays);
    const latest = await this.latestHoldableUntil(usage, bandCeiling);

    const detail = {
      route,
      used: allowance.used,
      allowed: allowance.allowed,
      maxRequestedDueAt: latest ?? bandCeiling,
    };

    if (isBlockedByCredit(allowance.creditTier)) {
      return blocked('CREDIT_TOO_LOW', detail);
    }
    if (allowance.used >= allowance.allowed) {
      return blocked('EXTENSION_QUOTA_EXCEEDED', detail);
    }
    if (latest === null) {
      // Somebody else's booking starts before this loan even ends: there is no
      // later date left to ask for.
      return blocked('WINDOW_NOT_AVAILABLE', {
        ...detail,
        maxRequestedDueAt: dueAt,
      });
    }

    return {
      usageKey,
      canRequest: true,
      blockedBy: null,
      route,
      requiresInspection: requiresInspection(route),
      currentDueAt: toIso(dueAt),
      maxRequestedDueAt: toIso(latest),
      extensionsUsed: allowance.used,
      extensionsAllowed: allowance.allowed,
      pendingExtensionKey: null,
    };
  }

  /**
   * Ask to keep something longer.
   *
   * The online case (§5.4: T0, and every other T1 extension for a healthy
   * record) is granted inside this call — there is no queue, no notification to
   * wait for, and the due date has already moved by the time the response
   * lands. Everything else is written `Pending` and pointed at from the loan,
   * so the counter and the borrower's card both see one open request.
   */
  async request(user: TrpcUser, input: RequestExtensionInput) {
    const usage = await this.readOwnLoan(user, input.usageKey);

    if (usage.CurrentStatus !== 'Lended') {
      // Nothing else can be extended: a prepared loan has not started and a
      // returned one is over.
      throw new BusinessError('WRONG_LOAN_STATE', {
        usageKey: input.usageKey,
        actual: usage.CurrentStatus,
        expected: ['Lended'],
      });
    }
    if (usage.PendingExtension !== null) {
      throw new BusinessError('EXTENSION_ALREADY_PENDING', {
        usageKey: input.usageKey,
        extensionKey: usage.PendingExtension,
      });
    }

    const allowance = await this.resolveAllowance(user, usage);
    if (isBlockedByCredit(allowance.creditTier)) {
      // Same rule as opening a request: a D3 record may not take on more time
      // with something it is already holding. See approval-policy.ts.
      throw new BusinessError('CREDIT_TOO_LOW', {
        creditTier: allowance.creditTier,
        creditScore: user.creditScore,
      });
    }
    if (allowance.used >= allowance.allowed) {
      throw new BusinessError('EXTENSION_QUOTA_EXCEEDED', {
        usageKey: input.usageKey,
        used: allowance.used,
        allowed: allowance.allowed,
        creditTier: allowance.creditTier,
      });
    }

    const requestedDue = new Date(input.requestedDueAt);
    this.assertExtensionWindow(
      usage.DueTime,
      requestedDue,
      allowance.maxBorrowDays,
    );

    const extendNo = allowance.used + 1;
    const route = extensionRouteFor({
      tier: tryMapTier(usage.Resource.BorrowRuleInfo.RuleName),
      creditTier: allowance.creditTier,
      extendNo,
    });
    const approved = route === 'auto';
    const now = new Date();

    const extensionKey = await runSerializable(this.prisma, async (tx) => {
      // Re-checked inside the transaction at Serializable, for the same reason
      // `loan.create` re-checks: an extension and somebody else's new booking
      // can be committed a millisecond apart, and only one of them may win the
      // days they share.
      await this.assertHoldableUntil(tx, usage, requestedDue);

      const row = await tx.extensionRequest.create({
        data: {
          UsageKey: usage.UsageKey,
          RequestedBy: user.accountKey,
          ExtendNo: extendNo,
          PreviousDueTime: usage.DueTime,
          RequestedDueTime: requestedDue,
          ApproveStatus: approved ? 'Approved' : 'Pending',
          // Nobody signed an online renewal. A null ApprovedBy on an Approved
          // row is what says "the system did this", the same encoding
          // Reservations uses through AutoApproved.
          ApprovedBy: null,
          RequestedAt: now,
          ResolvedAt: approved ? now : null,
          Reason: input.reason ?? null,
        },
        select: { ExtensionKey: true },
      });

      await tx.usageLog.update({
        where: { UsageKey: usage.UsageKey },
        data: {
          // Pointed at from the loan only while somebody still has to answer.
          PendingExtension: approved ? null : row.ExtensionKey,
          ...(approved ? { DueTime: requestedDue } : {}),
        },
      });

      if (approved) {
        await this.holdReservationUntil(tx, usage, requestedDue);
        await this.notifications.extensionApproved(tx, {
          accountKey: usage.AccountKey,
          extensionKey: row.ExtensionKey,
          itemName: resourceName(usage.Resource),
          dueAt: requestedDue,
          automatic: true,
        });
      }

      return row.ExtensionKey;
    });

    return this.renderOne(extensionKey);
  }

  /** The caller's own extension requests, newest first. */
  async listMine(user: TrpcUser, input: ListMyExtensionsInput) {
    const where: Prisma.ExtensionRequestWhereInput = {
      RequestedBy: user.accountKey,
      ...(input.status ? { ApproveStatus: input.status } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.extensionRequest.findMany({
        where,
        orderBy: { RequestedAt: 'desc' },
        ...toSkipTake(input),
        select: EXTENSION_SELECT,
      }),
      this.prisma.extensionRequest.count({ where }),
    ]);

    return toPage(await this.render(rows), total, input);
  }

  /**
   * Withdraw a request nobody has answered yet.
   *
   * Only while it is Pending: once a decision is written the due date has
   * either moved or not, and there is nothing left to take back. Cancelling
   * frees the loan to ask again — the quota counts granted extensions, so a
   * withdrawn one costs the borrower nothing.
   */
  async cancel(user: TrpcUser, input: CancelExtensionInput) {
    const row = await this.readExtension(input.extensionKey);
    if (row.RequestedBy !== user.accountKey) {
      // Same answer as a key that does not exist, so extension numbers cannot
      // be probed — see `getMine` in loan.request.service.ts.
      throw new BusinessError('EXTENSION_NOT_FOUND', {
        extensionKey: input.extensionKey,
      });
    }
    if (row.ApproveStatus !== 'Pending') {
      throw new BusinessError('ALREADY_DECIDED', {
        extensionKey: input.extensionKey,
        status: row.ApproveStatus,
        decidedAt: toIsoNullable(row.ResolvedAt),
      });
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.extensionRequest.update({
        where: { ExtensionKey: input.extensionKey },
        data: { ApproveStatus: 'Canceled', ResolvedAt: now },
      });
      await this.clearPendingPointer(tx, row);
    });

    return this.renderOne(input.extensionKey);
  }

  // =========================================================================
  // The desks
  // =========================================================================

  /**
   * The extension requests waiting on the caller.
   *
   * One list for both desks, split by `route` exactly as the approval queue is:
   * `canDecide` decides which rows a caller may see, so a staff member never
   * finds T2 work in their pile and a supervisor can still clear a counter's
   * backlog. Filtering in memory rather than in SQL because the route depends
   * on the borrower's current credit band and on how many extensions the loan
   * has had, neither of which is a column on this table.
   */
  async listReviews(user: TrpcUser, input: ListExtensionReviewsInput) {
    const rows = await this.prisma.extensionRequest.findMany({
      where: {
        ApproveStatus: 'Pending',
        Usage: { Resource: await this.scope.resourceScope(user) },
        ...(input.q
          ? {
              RequestedByUser: {
                OR: [
                  { UserID: { contains: input.q, mode: 'insensitive' } },
                  { UserFName: { contains: input.q, mode: 'insensitive' } },
                  { UserLName: { contains: input.q, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      // Oldest first: somebody is holding an item whose due date has not moved
      // while this sits here.
      orderBy: { RequestedAt: 'asc' },
      select: EXTENSION_SELECT,
    });

    const toBand = await this.creditTiers.tierMapper();
    const visible = rows
      .map((row) => ({ row, ...this.routeOf(row, toBand) }))
      .filter(({ route }) => canDecide(route, this.deciderRole(user)))
      .filter(({ route }) => input.route === undefined || route === input.route)
      .filter(
        ({ row }) =>
          input.tier === undefined ||
          tryMapTier(row.Usage.Resource.BorrowRuleInfo.RuleName) === input.tier,
      );

    const { skip, take } = toSkipTake(input);
    const page = visible
      .slice(skip, skip + take)
      .map(({ row, route, band }) => ({
        extensionKey: row.ExtensionKey,
        usageKey: row.UsageKey,
        borrower: this.toBorrower(row.RequestedByUser),
        creditTier: band,
        route,
        itemName: this.nameOf(row.Usage.Resource),
        serialNo: row.Usage.Resource.Item?.ItemID ?? null,
        tier: tryMapTier(row.Usage.Resource.BorrowRuleInfo.RuleName),
        extendNo: row.ExtendNo,
        previousDueAt: toIso(row.PreviousDueTime),
        requestedDueAt: toIso(row.RequestedDueTime),
        requestedAt: toIso(row.RequestedAt),
        reason: row.Reason,
        status: row.ApproveStatus,
      }));

    return toPage(page, visible.length, input);
  }

  /**
   * Settles an extension somebody had to look at (§5.9 "ต่ออายุแบบตรวจสภาพ").
   *
   * Approving records the condition the item was found in — that check is the
   * whole reason this extension was not an online one — and moves both the due
   * date and the booking behind it. The booking matters as much as the due
   * date: the clash checks read `Reservations`, so a loan extended without it
   * leaves days that look free to the next borrower.
   */
  async decide(user: TrpcUser, input: DecideExtensionInput) {
    const row = await this.readExtension(input.extensionKey);
    await this.scope.assertResourceInScope(
      user,
      row.Usage.Resource.ResourceKey,
    );

    if (row.ApproveStatus !== 'Pending') {
      throw new BusinessError('ALREADY_DECIDED', {
        extensionKey: input.extensionKey,
        status: row.ApproveStatus,
        decidedAt: toIsoNullable(row.ResolvedAt),
      });
    }
    if (row.RequestedBy === user.accountKey) {
      // §5.9 again: staff and supervisors borrow too, and may not sign for
      // themselves.
      throw new BusinessError('CANNOT_APPROVE_OWN_REQUEST', {
        extensionKey: input.extensionKey,
      });
    }

    const toBand = await this.creditTiers.tierMapper();
    const { route } = this.routeOf(row, toBand);
    if (!canDecide(route, this.deciderRole(user))) {
      throw new BusinessError('EXTENSION_NEEDS_SUPERVISOR', {
        extensionKey: input.extensionKey,
        route,
        tier: tryMapTier(row.Usage.Resource.BorrowRuleInfo.RuleName),
      });
    }

    const now = new Date();
    const approved = input.decision === 'approve';

    await runSerializable(this.prisma, async (tx) => {
      if (approved) {
        // The days asked for may have been taken by another booking while this
        // sat in the queue. Refusing here is better than granting an extension
        // over a window the unit is already promised for.
        await this.assertHoldableUntil(tx, row.Usage, row.RequestedDueTime);
      }

      // Written on both outcomes: somebody physically looked at the unit, and
      // that observation is true whichever way the decision went.
      const condition = await tx.conditionLog.create({
        data: {
          ResourceKey: row.Usage.Resource.ResourceKey,
          LoggedBy: user.accountKey,
          Condition: input.condition,
          Notes: input.note ?? null,
          LoggedAt: now,
        },
        select: { ConditionKey: true },
      });

      await tx.resourceInfo.update({
        where: { ResourceKey: row.Usage.Resource.ResourceKey },
        data: { ConditionKey: condition.ConditionKey },
      });

      await tx.extensionRequest.update({
        where: { ExtensionKey: input.extensionKey },
        data: {
          ApproveStatus: approved ? 'Approved' : 'Rejected',
          ApprovedBy: user.accountKey,
          ResolvedAt: now,
          // The decider's words are appended rather than replacing the
          // borrower's: a refusal has to keep the reason it refused.
          Reason: this.appendNote(row.Reason, input.note),
        },
      });

      await tx.usageLog.update({
        where: { UsageKey: row.UsageKey },
        data: {
          // Cleared either way: the request is settled, so nothing is pending
          // on this loan any more.
          PendingExtension: null,
          ...(approved ? { DueTime: row.RequestedDueTime } : {}),
        },
      });

      if (approved) {
        await this.holdReservationUntil(tx, row.Usage, row.RequestedDueTime);
        await this.notifications.extensionApproved(tx, {
          accountKey: row.Usage.AccountKey,
          extensionKey: row.ExtensionKey,
          itemName: resourceName(row.Usage.Resource),
          dueAt: row.RequestedDueTime,
          automatic: false,
        });
      } else {
        await this.notifications.extensionRejected(tx, {
          accountKey: row.Usage.AccountKey,
          extensionKey: row.ExtensionKey,
          itemName: resourceName(row.Usage.Resource),
          dueAt: row.Usage.DueTime,
          reason: input.note,
        });
      }
    });

    return this.renderOne(input.extensionKey);
  }

  // =========================================================================
  // Internals
  // =========================================================================

  /**
   * The caller's own loan, or a 404.
   *
   * Ownership rather than departmental scope: this service's borrower half
   * answers to the person holding the item, and someone else's loan number must
   * look exactly like one that does not exist.
   */
  private async readOwnLoan(
    user: TrpcUser,
    usageKey: number,
  ): Promise<UsageRow> {
    const usage = await this.prisma.usageLog.findUnique({
      where: { UsageKey: usageKey },
      select: USAGE_SELECT,
    });
    if (!usage || usage.AccountKey !== user.accountKey) {
      throw new BusinessError('LOAN_NOT_FOUND', { usageKey });
    }
    return usage;
  }

  private async readExtension(extensionKey: number): Promise<ExtensionRow> {
    const row = await this.prisma.extensionRequest.findUnique({
      where: { ExtensionKey: extensionKey },
      select: EXTENSION_SELECT,
    });
    if (!row) {
      throw new BusinessError('EXTENSION_NOT_FOUND', { extensionKey });
    }
    return row;
  }

  /**
   * Quota and window limits for one borrower on one loan.
   *
   * `assertMayBorrow` is reused rather than reading BorrowConstraints directly:
   * an extension is a fresh grant of the same item, so someone who has since
   * left the club that made them eligible should not be able to keep it for
   * another fortnight by pressing a different button.
   */
  private async resolveAllowance(
    user: TrpcUser,
    usage: UsageRow,
  ): Promise<ExtensionAllowance> {
    const band = await this.creditTiers.resolveTier(user.creditScore);
    const allowance = await this.eligibility.assertMayBorrow(
      user,
      usage.Resource.ResourceKey,
      band.creditTierKey,
    );

    // Granted ones only. A withdrawn or refused request costs no quota — the
    // limit in §5.4 counts how many times the due date moved, not how many
    // times somebody asked.
    const used = await this.prisma.extensionRequest.count({
      where: { UsageKey: usage.UsageKey, ApproveStatus: 'Approved' },
    });

    return {
      creditTier: band.creditTier,
      creditTierKey: band.creditTierKey,
      used,
      allowed: allowance.maxExtendTimes,
      maxBorrowDays: allowance.maxBorrowDays,
    };
  }

  /** Forwards, into the future, and no longer than one borrow window. */
  private assertExtensionWindow(
    currentDue: Date,
    requestedDue: Date,
    maxBorrowDays: number,
  ): void {
    if (requestedDue <= currentDue) {
      throw new BusinessError('INVALID_EXTENSION_WINDOW', {
        reason: 'NOT_LATER_THAN_CURRENT_DUE',
        currentDueAt: toIso(currentDue),
        requestedDueAt: toIso(requestedDue),
      });
    }
    if (requestedDue.getTime() <= Date.now()) {
      // A due date already in the past extends nothing; it just relabels how
      // late the borrower already is.
      throw new BusinessError('INVALID_EXTENSION_WINDOW', {
        reason: 'IN_THE_PAST',
        requestedDueAt: toIso(requestedDue),
      });
    }

    const added = daysBetween(currentDue, requestedDue);
    if (added > maxBorrowDays) {
      throw new BusinessError('INVALID_EXTENSION_WINDOW', {
        reason: 'EXCEEDS_MAX_BORROW_DAYS',
        maxDays: maxBorrowDays,
        requestedDays: added,
        maxRequestedDueAt: toIso(addDays(currentDue, maxBorrowDays)),
      });
    }
  }

  /**
   * Nothing else may hold this unit over the days being asked for.
   *
   * The loan's own reservation is excluded — it is the row being extended, and
   * counting it would make every extension clash with itself.
   */
  private async assertHoldableUntil(
    tx: Prisma.TransactionClient,
    usage: UsageRow,
    requestedDue: Date,
  ): Promise<void> {
    const { from, to } = withBuffer(
      usage.DueTime,
      requestedDue,
      usage.Resource.BufferTime,
    );
    const clash = await tx.reservations.findFirst({
      where: clashingWindowFilter(
        usage.Resource.ResourceKey,
        from,
        to,
        usage.ReservationKey ?? undefined,
      ),
      orderBy: { StartTime: 'asc' },
      select: { ReservationKey: true, StartTime: true },
    });

    if (clash) {
      throw new BusinessError('WINDOW_NOT_AVAILABLE', {
        resourceKey: usage.Resource.ResourceKey,
        blockedBy: clash.ReservationKey,
        // What the borrower may ask for instead: up to the buffer before the
        // next booking starts.
        maxRequestedDueAt: toIso(
          addDays(clash.StartTime, -usage.Resource.BufferTime),
        ),
      });
    }
  }

  /**
   * The furthest due date the next booking leaves room for, capped at `ceiling`.
   *
   * Null when there is no room at all — somebody's window opens before this
   * loan's own due date, buffer included, so the item has to come back on time.
   */
  private async latestHoldableUntil(
    usage: UsageRow,
    ceiling: Date,
  ): Promise<Date | null> {
    const { from, to } = withBuffer(
      usage.DueTime,
      ceiling,
      usage.Resource.BufferTime,
    );
    const clash = await this.prisma.reservations.findFirst({
      where: clashingWindowFilter(
        usage.Resource.ResourceKey,
        from,
        to,
        usage.ReservationKey ?? undefined,
      ),
      orderBy: { StartTime: 'asc' },
      select: { StartTime: true },
    });
    if (!clash) return ceiling;

    const latest = addDays(clash.StartTime, -usage.Resource.BufferTime);
    return latest > usage.DueTime ? latest : null;
  }

  /**
   * Moves the booking behind the loan to the new due date.
   *
   * Without this an extension is invisible to every availability check in the
   * system: `clashingWindowFilter` reads `Reservations`, so the days between
   * the old and new due dates would go on looking free and the catalogue would
   * happily promise them to somebody else.
   *
   * A loan with no reservation is a walk-in recorded at the counter. There is
   * nothing to move, and nothing was holding those days in the first place.
   */
  private async holdReservationUntil(
    tx: Prisma.TransactionClient,
    usage: UsageRow,
    requestedDue: Date,
  ): Promise<void> {
    if (usage.ReservationKey === null) return;
    await tx.reservations.update({
      where: { ReservationKey: usage.ReservationKey },
      data: { EndTime: requestedDue },
    });
  }

  /** Drops the loan's pointer, but only if it still names this request. */
  private async clearPendingPointer(
    tx: Prisma.TransactionClient,
    row: ExtensionRow,
  ): Promise<void> {
    await tx.usageLog.updateMany({
      where: { UsageKey: row.UsageKey, PendingExtension: row.ExtensionKey },
      data: { PendingExtension: null },
    });
  }

  /**
   * The route this request takes, recomputed rather than stored.
   *
   * Same reasoning as `routeOf` in loan.request.service.ts: storing it would be
   * a second copy of extension-policy.ts to keep in step. `ExtendNo` is the
   * number the request was opened with, so an alternation does not shift under
   * a request already in the queue.
   */
  private routeOf(
    row: ExtensionRow,
    toBand: (creditScore: number) => CreditTier,
  ): { route: ExtensionRoute; band: CreditTier } {
    const band = toBand(row.RequestedByUser.UserCredit);
    return {
      band,
      route: extensionRouteFor({
        tier: tryMapTier(row.Usage.Resource.BorrowRuleInfo.RuleName),
        creditTier: band,
        extendNo: row.ExtendNo ?? 1,
      }),
    };
  }

  /**
   * The role the caller decides with.
   *
   * `StaffMiddleware` already refused anyone below staff — copied from
   * ApprovalService, which asks the same question of the same middleware.
   */
  private deciderRole(user: TrpcUser): 'staff' | 'supervisor' | 'admin' {
    return user.role === 'admin' || user.role === 'supervisor'
      ? user.role
      : 'staff';
  }

  private appendNote(existing: string | null, note?: string): string | null {
    if (!note) return existing;
    return existing ? `${existing} · ${note}` : note;
  }

  private nameOf(resource: UsageRow['Resource']): string | null {
    return resource.Item?.Item.ItemName ?? resource.Room?.RoomName ?? null;
  }

  private toBorrower(row: {
    AccountKey: number;
    UserID: string;
    UserFName: string;
    UserLName: string;
    UserCredit: number;
  }) {
    return {
      accountKey: row.AccountKey,
      studentId: row.UserID,
      firstName: row.UserFName,
      lastName: row.UserLName,
      creditScore: row.UserCredit,
    };
  }

  private async renderOne(extensionKey: number) {
    const [rendered] = await this.render([
      await this.readExtension(extensionKey),
    ]);
    return rendered;
  }

  /**
   * Rows to contract shape, with the quota resolved in two queries rather than
   * two per row.
   *
   * A borrower's history page is twenty rows, and reading BorrowConstraints and
   * counting granted extensions per row would be forty round trips for a list
   * nobody scrolls.
   */
  private async render(rows: ExtensionRow[]) {
    if (rows.length === 0) return [];

    const usageKeys = [...new Set(rows.map((r) => r.UsageKey))];
    const grouped = await this.prisma.extensionRequest.groupBy({
      by: ['UsageKey'],
      where: { UsageKey: { in: usageKeys }, ApproveStatus: 'Approved' },
      _count: { _all: true },
    });
    const usedByUsage = new Map(
      grouped.map((g) => [g.UsageKey, g._count._all]),
    );

    // The band of the person who asked, not of the caller: a staff member
    // reading this list must see the borrower's quota, not their own.
    const toBand = await this.creditTiers.tierMapper();
    const tiers = await this.prisma.creditTier.findMany({
      select: { CreditTierKey: true, CreditTierName: true },
    });
    const tierKeyByName = new Map(
      tiers.map((t) => [t.CreditTierName ?? '', t.CreditTierKey]),
    );

    const constraints = await this.prisma.borrowConstraints.findMany({
      where: {
        BorrowRuleKey: {
          in: [...new Set(rows.map((r) => r.Usage.Resource.BorrowRule))],
        },
        CreditTierKey: { in: [...tierKeyByName.values()] },
      },
      select: {
        BorrowRuleKey: true,
        CreditTierKey: true,
        MaxExtendTime: true,
      },
    });
    const allowedBy = new Map(
      constraints.map((c) => [
        `${c.BorrowRuleKey}:${c.CreditTierKey}`,
        c.MaxExtendTime,
      ]),
    );

    return rows.map((row) => {
      const band = toBand(row.RequestedByUser.UserCredit);
      const route = extensionRouteFor({
        tier: tryMapTier(row.Usage.Resource.BorrowRuleInfo.RuleName),
        creditTier: band,
        extendNo: row.ExtendNo ?? 1,
      });
      const tierKey = tierKeyByName.get(band);
      const allowed =
        allowedBy.get(`${row.Usage.Resource.BorrowRule}:${tierKey}`) ?? 0;

      return {
        extensionKey: row.ExtensionKey,
        usageKey: row.UsageKey,
        status: row.ApproveStatus,
        route,
        requiresInspection: requiresInspection(route),
        // Approved with nobody's signature on it: the online renewal.
        autoApproved:
          row.ApproveStatus === 'Approved' && row.ApprovedBy === null,
        extendNo: row.ExtendNo,
        previousDueAt: toIso(row.PreviousDueTime),
        requestedDueAt: toIso(row.RequestedDueTime),
        dueAt: toIso(row.Usage.DueTime),
        requestedAt: toIso(row.RequestedAt),
        resolvedAt: toIsoNullable(row.ResolvedAt),
        itemName: this.nameOf(row.Usage.Resource),
        serialNo: row.Usage.Resource.Item?.ItemID ?? null,
        tier: tryMapTier(row.Usage.Resource.BorrowRuleInfo.RuleName),
        extensionsUsed: usedByUsage.get(row.UsageKey) ?? 0,
        extensionsAllowed: allowed,
      };
    });
  }
}
