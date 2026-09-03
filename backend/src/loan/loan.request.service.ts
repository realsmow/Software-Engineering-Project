import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { CreditTierService } from '../common/credit/credit-tier.service';
import { EligibilityService } from '../common/authority/eligibility.service';
import {
  isBlockedByCredit,
  routeFor,
  type ApprovalRoute,
} from '../common/approval/approval-policy';
import {
  clashingWindowFilter,
  runSerializable,
  withBuffer,
} from '../common/booking/booking-window';
import { BusinessError } from '../common/errors/business-error';
import { addDays, daysBetween, toIso } from '../common/schemas/datetime.schema';
import { toPage, toSkipTake } from '../common/schemas/pagination.schema';
import { tryMapTier, type CreditTier } from '../common/schemas/status.schema';
import { UNAVAILABLE_USAGE_STATES } from '../common/usage/usage-states';
import type { TrpcUser } from '../trpc/context';
import type {
  CancelRequestInput,
  CreateRequestInput,
  ListMyRequestsInput,
  RequestStatus,
} from './loan.schema';

/**
 * How long an approved request is held before the borrower loses it.
 *
 * §5.9: a request not collected within a day is cancelled. Written into
 * `Reservations.ReservationExpiration` at approval time rather than left for
 * the cron job to compute, so the borrower's card can show the deadline the
 * moment it is approved.
 */
const COLLECT_WITHIN_DAYS = 1;

/** Which tab of "คำขอของฉัน" each status belongs to (mock-data.ts STATUS_TAB). */
const STATUS_TAB: Record<RequestStatus, 'active' | 'using' | 'history'> = {
  pending: 'active',
  approved: 'active',
  preparing: 'active',
  ready: 'active',
  inUse: 'using',
  returned: 'history',
  done: 'history',
  rejected: 'history',
  cancelled: 'history',
};

const RESOURCE_SELECT = {
  ResourceKey: true,
  ManagedBy: true,
  BufferTime: true,
  AllowBorrow: true,
  ResourceStatus: true,
  BorrowRule: true,
  BorrowRuleInfo: { select: { RuleName: true } },
  Item: {
    select: {
      ItemID: true,
      Item: { select: { ItemName: true, CreditWeight: true } },
    },
  },
  Room: { select: { RoomName: true, CreditWeight: true } },
} satisfies Prisma.ResourceInfoSelect;

const REQUEST_SELECT = {
  ReservationKey: true,
  ReservedBy: true,
  Reason: true,
  StartTime: true,
  EndTime: true,
  ApproveStatus: true,
  ApprovedBy: true,
  AutoApproved: true,
  ApprovedAt: true,
  ReservationExpiration: true,
  ActionTime: true,
  ResolvedAt: true,
  Resource: { select: RESOURCE_SELECT },
  ReservedByUser: { select: { UserCredit: true } },
  ApprovedByUser: {
    select: {
      AccountKey: true,
      UserID: true,
      UserFName: true,
      UserLName: true,
      UserCredit: true,
    },
  },
  UsageLogs: {
    orderBy: { UsageKey: 'desc' },
    take: 1,
    select: { UsageKey: true, CurrentStatus: true },
  },
} satisfies Prisma.ReservationsSelect;

type RequestRow = Prisma.ReservationsGetPayload<{
  select: typeof REQUEST_SELECT;
}>;

/**
 * The borrower's own view of the loan domain: opening a request, watching it
 * move, and calling it off.
 *
 * Separate from LoanService because the two answer to different people. That
 * one is the counter — every method takes a staff member and asserts
 * departmental scope. This one takes a borrower and asserts ownership: the
 * only rows it will ever touch are the caller's own.
 */
@Injectable()
export class LoanRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditTiers: CreditTierService,
    private readonly eligibility: EligibilityService,
  ) {}

  // =========================================================================
  // Opening a request
  // =========================================================================

  /**
   * Opens one request per basket line.
   *
   * Lines are checked and written one at a time, and a line that fails is
   * reported rather than thrown: a basket of five where the fourth item was
   * taken thirty seconds ago should produce four requests and one explanation,
   * not five nothings. The two checks that concern the *borrower* rather than
   * the item — credit block and window shape — are done once up front and do
   * throw, because they fail every line identically.
   */
  async create(user: TrpcUser, input: CreateRequestInput) {
    const startTime = new Date(input.startTime);
    const endTime = new Date(input.endTime);
    this.assertWindowShape(startTime, endTime);

    const band = await this.creditTiers.resolveTier(user.creditScore);
    if (isBlockedByCredit(band.creditTier)) {
      // §CREDIT_BAND_POLICY: D3 may not open a request until what they are
      // holding is cleared. See common/approval/approval-policy.ts for why
      // this rule exists despite CONTRACT.md.
      throw new BusinessError('CREDIT_TOO_LOW', {
        creditTier: band.creditTier,
        creditScore: user.creditScore,
      });
    }

    const toBand = await this.creditTiers.tierMapper();
    const created: RequestRow[] = [];
    const rejected: {
      resourceKey: number;
      code: string;
      detail: Record<string, unknown> | null;
    }[] = [];

    for (const line of input.lines) {
      try {
        created.push(
          await this.createOne(
            user,
            band.creditTierKey,
            band.creditTier,
            line.resourceKey,
            line.reason ?? null,
            startTime,
            endTime,
          ),
        );
      } catch (error) {
        if (!(error instanceof BusinessError)) throw error;
        rejected.push({
          resourceKey: line.resourceKey,
          code: error.message,
          detail: (error.cause as Record<string, unknown> | undefined) ?? null,
        });
      }
    }

    return {
      created: created.map((row) => this.toRequest(row, toBand)),
      rejected,
    };
  }

  private async createOne(
    user: TrpcUser,
    creditTierKey: number,
    creditTier: Parameters<typeof routeFor>[0]['creditTier'],
    resourceKey: number,
    reason: string | null,
    startTime: Date,
    endTime: Date,
  ): Promise<RequestRow> {
    const resource = await this.prisma.resourceInfo.findUnique({
      where: { ResourceKey: resourceKey },
      select: RESOURCE_SELECT,
    });
    if (!resource) {
      throw new BusinessError('RESOURCE_NOT_FOUND', { resourceKey });
    }
    if (!resource.AllowBorrow || resource.ResourceStatus === 'Missing') {
      throw new BusinessError('ITEM_UNAVAILABLE', {
        resourceKey,
        reason: resource.AllowBorrow ? 'MISSING' : 'NOT_LENDABLE',
      });
    }

    const tier = tryMapTier(resource.BorrowRuleInfo.RuleName);
    if (tier === null) {
      throw new BusinessError('TIER_NOT_CONFIGURED', {
        resourceKey,
        borrowRuleKey: resource.BorrowRule,
      });
    }

    // Eligibility and the authority floor. Throws NOT_ELIGIBLE on its own.
    const allowance = await this.eligibility.assertMayBorrow(
      user,
      resourceKey,
      creditTierKey,
    );

    const days = daysBetween(startTime, endTime);
    if (days > allowance.maxBorrowDays) {
      throw new BusinessError('LOAN_PERIOD_EXCEEDS_LIMIT', {
        maxDays: allowance.maxBorrowDays,
        requestedDays: days,
        creditTier,
      });
    }

    await this.assertWindowFree(resource, startTime, endTime);

    const route = routeFor({ tier, creditTier });
    const now = new Date();
    const approved = route === 'auto';

    const key = await runSerializable(this.prisma, async (tx) => {
      // Re-check inside the transaction. Two people submitting the same unit
      // for the same hours a moment apart both pass the check above; only one
      // may come out of here holding it.
      const { from, to } = withBuffer(startTime, endTime, resource.BufferTime);
      const taken = await tx.reservations.count({
        where: clashingWindowFilter(resource.ResourceKey, from, to),
      });
      if (taken > 0) {
        throw new BusinessError('WINDOW_NOT_AVAILABLE', {
          resourceKey: resource.ResourceKey,
          from: toIso(from),
          to: toIso(to),
        });
      }

      const row = await tx.reservations.create({
        data: {
          ResourceKey: resource.ResourceKey,
          ReservedBy: user.accountKey,
          Reason: reason,
          StartTime: startTime,
          EndTime: endTime,
          ApproveStatus: approved ? 'Approved' : 'Pending',
          AutoApproved: approved,
          // Nobody signed an auto-approval, so ApprovedBy stays null and
          // AutoApproved is what tells the two cases apart.
          ApprovedBy: null,
          ApprovedAt: approved ? now : null,
          ActionTime: now,
          ReservationExpiration: approved
            ? addDays(now, COLLECT_WITHIN_DAYS)
            : // Nothing is being held yet, so the field carries the end of the
              // requested window rather than a collection deadline.
              endTime,
        },
        select: { ReservationKey: true },
      });
      return row.ReservationKey;
    });

    return this.read(key);
  }

  // =========================================================================
  // Tracking
  // =========================================================================

  /** The caller's own requests, newest first. */
  async listMine(user: TrpcUser, input: ListMyRequestsInput) {
    const rows = await this.prisma.reservations.findMany({
      where: {
        ReservedBy: user.accountKey,
        ...(input.q
          ? {
              Resource: {
                OR: [
                  {
                    Item: {
                      Item: {
                        ItemName: { contains: input.q, mode: 'insensitive' },
                      },
                    },
                  },
                  {
                    Item: {
                      ItemID: { contains: input.q, mode: 'insensitive' },
                    },
                  },
                  {
                    Room: {
                      RoomName: { contains: input.q, mode: 'insensitive' },
                    },
                  },
                ],
              },
            }
          : {}),
      },
      orderBy: { ActionTime: 'desc' },
      select: REQUEST_SELECT,
    });

    // The tab is a function of the derived status, which no SQL column holds -
    // it is ApproveStatus crossed with how far the UsageLog has got. Filtering
    // here keeps the two definitions in one place at the cost of reading the
    // caller's own rows, which is a page of history, not a table scan.
    const toBand = await this.creditTiers.tierMapper();
    const all = rows.map((row) => this.toRequest(row, toBand));
    const filtered =
      input.tab === undefined
        ? all
        : all.filter((r) => STATUS_TAB[r.status] === input.tab);

    const { skip, take } = toSkipTake(input);
    return toPage(filtered.slice(skip, skip + take), filtered.length, input);
  }

  /** One of the caller's own requests. Someone else's is a 404, not a 403. */
  async getMine(user: TrpcUser, reservationKey: number) {
    const row = await this.read(reservationKey);
    if (row.ReservedBy !== user.accountKey) {
      // Deliberately the same answer as a key that does not exist: a borrower
      // must not be able to probe for other people's request numbers.
      throw new BusinessError('RESERVATION_NOT_FOUND', { reservationKey });
    }
    return this.toRequest(row, await this.creditTiers.tierMapper());
  }

  /**
   * The same shape, for a caller who is not the borrower.
   *
   * Ownership is deliberately not checked: the approval desk has already
   * proved it may act on this resource through StaffScopeService, and it needs
   * to echo the request back after deciding it. Never reachable from a
   * borrower-facing procedure - `getMine` is the one they get.
   */
  async getAsDecider(reservationKey: number) {
    return this.toRequest(
      await this.read(reservationKey),
      await this.creditTiers.tierMapper(),
    );
  }

  // =========================================================================
  // Cancelling
  // =========================================================================

  /**
   * Calls off the caller's own request.
   *
   * Allowed while nothing physical has happened yet: pending, or approved but
   * not prepared. Once staff have set a unit aside the borrower cannot undo it
   * from here - that unit is off the shelf and someone has to put it back, so
   * it goes through the counter instead.
   */
  async cancel(user: TrpcUser, input: CancelRequestInput) {
    const row = await this.read(input.reservationKey);
    if (row.ReservedBy !== user.accountKey) {
      throw new BusinessError('RESERVATION_NOT_FOUND', {
        reservationKey: input.reservationKey,
      });
    }

    if (row.ApproveStatus === 'Canceled' || row.ApproveStatus === 'Rejected') {
      throw new BusinessError('ALREADY_DECIDED', {
        reservationKey: input.reservationKey,
        status: row.ApproveStatus,
        decidedAt: row.ResolvedAt ? toIso(row.ResolvedAt) : null,
      });
    }
    if (row.UsageLogs.length > 0) {
      throw new BusinessError('CANNOT_CANCEL', {
        reservationKey: input.reservationKey,
        usageKey: row.UsageLogs[0].UsageKey,
        reason: 'ALREADY_PREPARED',
      });
    }

    await this.prisma.reservations.update({
      where: { ReservationKey: input.reservationKey },
      data: {
        ApproveStatus: 'Canceled',
        ResolvedAt: new Date(),
        Reason: input.reason ?? row.Reason,
      },
    });

    return this.toRequest(
      await this.read(input.reservationKey),
      await this.creditTiers.tierMapper(),
    );
  }

  // =========================================================================
  // Internals
  // =========================================================================

  private assertWindowShape(startTime: Date, endTime: Date): void {
    if (endTime <= startTime) {
      throw new BusinessError('INVALID_BORROW_WINDOW', {
        reason: 'END_BEFORE_START',
        startTime: toIso(startTime),
        endTime: toIso(endTime),
      });
    }
    // A window that has already started cannot be honoured: staff prepare
    // against the start time, and there is nothing to prepare in the past.
    if (startTime.getTime() < Date.now()) {
      throw new BusinessError('INVALID_BORROW_WINDOW', {
        reason: 'STARTS_IN_THE_PAST',
        startTime: toIso(startTime),
      });
    }
  }

  /** Nothing else may hold this unit over the window, buffer included. */
  private async assertWindowFree(
    resource: { ResourceKey: number; BufferTime: number },
    startTime: Date,
    endTime: Date,
  ): Promise<void> {
    const { from, to } = withBuffer(startTime, endTime, resource.BufferTime);

    const clash = await this.prisma.reservations.findFirst({
      where: clashingWindowFilter(resource.ResourceKey, from, to),
      orderBy: { StartTime: 'asc' },
      select: { ReservationKey: true, StartTime: true, EndTime: true },
    });
    if (clash) {
      throw new BusinessError('WINDOW_NOT_AVAILABLE', {
        resourceKey: resource.ResourceKey,
        nextAvailableAt: toIso(addDays(clash.EndTime, resource.BufferTime)),
      });
    }

    // A unit that is physically out on an older loan blocks the window too,
    // even with no reservation row behind it - a walk-in loan recorded at the
    // counter is exactly that case.
    const held = await this.prisma.usageLog.findFirst({
      where: {
        ResourceKey: resource.ResourceKey,
        CurrentStatus: { in: UNAVAILABLE_USAGE_STATES },
        DueTime: { gt: from },
      },
      orderBy: { DueTime: 'asc' },
      select: { UsageKey: true, DueTime: true },
    });
    if (held) {
      throw new BusinessError('ITEM_UNAVAILABLE', {
        resourceKey: resource.ResourceKey,
        usageKey: held.UsageKey,
        nextAvailableAt: toIso(addDays(held.DueTime, resource.BufferTime)),
      });
    }
  }

  private async read(reservationKey: number): Promise<RequestRow> {
    const row = await this.prisma.reservations.findUnique({
      where: { ReservationKey: reservationKey },
      select: REQUEST_SELECT,
    });
    if (!row) {
      throw new BusinessError('RESERVATION_NOT_FOUND', { reservationKey });
    }
    return row;
  }

  /**
   * The single place a request's status is decided.
   *
   * It is not a column: the request's own ApproveStatus answers only until it
   * is approved, after which how far the UsageLog has got is the real answer.
   * Anything reading one without the other reports a request as "approved"
   * while the borrower is holding the item.
   */
  private toRequest(
    row: RequestRow,
    toBand: (creditScore: number) => CreditTier,
  ) {
    const usage = row.UsageLogs[0] ?? null;
    const route = this.routeOf(row, toBand);

    return {
      reservationKey: row.ReservationKey,
      status: this.statusOf(row),
      resource: {
        resourceKey: row.Resource.ResourceKey,
        name:
          row.Resource.Item?.Item.ItemName ??
          row.Resource.Room?.RoomName ??
          null,
        serialNo: row.Resource.Item?.ItemID ?? null,
        kind: row.Resource.Room ? 'room' : 'equipment',
        tier: tryMapTier(row.Resource.BorrowRuleInfo.RuleName),
        creditWeight:
          row.Resource.Item?.Item.CreditWeight ??
          row.Resource.Room?.CreditWeight ??
          0,
      },
      startTime: toIso(row.StartTime),
      endTime: toIso(row.EndTime),
      reason: row.Reason,
      requestedAt: toIso(row.ActionTime),
      expiresAt:
        row.ApproveStatus === 'Approved' && usage === null
          ? toIso(row.ReservationExpiration)
          : null,
      approval: {
        route,
        status: row.ApproveStatus,
        approvedBy: row.ApprovedByUser
          ? {
              accountKey: row.ApprovedByUser.AccountKey,
              userId: row.ApprovedByUser.UserID,
              fullName:
                `${row.ApprovedByUser.UserFName} ${row.ApprovedByUser.UserLName}`.trim(),
              creditScore: row.ApprovedByUser.UserCredit,
            }
          : null,
        autoApproved: row.AutoApproved,
        approvedAt: row.ApprovedAt ? toIso(row.ApprovedAt) : null,
        resolvedAt: row.ResolvedAt ? toIso(row.ResolvedAt) : null,
      },
      usageKey: usage?.UsageKey ?? null,
      cancellable:
        (row.ApproveStatus === 'Pending' || row.ApproveStatus === 'Approved') &&
        usage === null,
    };
  }

  private statusOf(row: RequestRow): RequestStatus {
    if (row.ApproveStatus === 'Rejected') return 'rejected';
    if (row.ApproveStatus === 'Canceled') return 'cancelled';

    const usage = row.UsageLogs[0] ?? null;
    if (usage === null) {
      return row.ApproveStatus === 'Approved' ? 'approved' : 'pending';
    }
    switch (usage.CurrentStatus) {
      case 'Pending':
        return 'preparing';
      case 'Prepared':
        return 'ready';
      case 'Lended':
        return 'inUse';
      case 'Returned':
        return 'returned';
      case 'Inspected':
        return 'done';
    }
  }

  /**
   * The route a request took, recomputed rather than stored.
   *
   * Storing it would be a third copy of the policy table to keep in step with
   * approval-policy.ts. Recomputing costs the requester's credit band, which
   * the row already carries.
   *
   * One consequence worth knowing: a borrower whose credit slips from D1 to D2
   * while a request sits in the queue moves from the staff desk to the
   * supervisor's. That is the intended reading of CREDIT_BAND_POLICY - the
   * question is "may this person be trusted with it", asked at the moment
   * somebody answers it.
   */
  private routeOf(
    row: RequestRow,
    toBand: (creditScore: number) => CreditTier,
  ): ApprovalRoute {
    if (row.AutoApproved) return 'auto';
    return routeFor({
      tier: tryMapTier(row.Resource.BorrowRuleInfo.RuleName),
      creditTier: toBand(row.ReservedByUser.UserCredit),
    });
  }
}
