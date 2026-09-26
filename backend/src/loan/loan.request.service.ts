import { toBorrowerRef } from './loan.schema';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreditTierService } from '../common/credit/credit-tier.service';
import { EligibilityService } from '../common/authority/eligibility.service';
import {
  routeFor,
  type ApprovalRoute,
} from '../common/approval/approval-policy';
import {
  HOLDING_APPROVE_STATES,
  clashingWindowFilter,
  collectDeadline,
  heldUsageFilter,
  pickupOpensAt,
  resourcesFreeInWindow,
  runSerializable,
  withBuffer,
} from '../common/booking/booking-window';
import {
  MAX_ACTIVE_ROOM_BOOKINGS,
  assertRoomWindow,
  slotsToWindow,
  toRoomHours,
} from '../common/booking/room-slots';
import { BusinessError } from '../common/errors/business-error';
import {
  NotificationService,
  resourceName,
  supervisorsForGroup,
} from '../notification/notification.service';
import {
  addDays,
  daysBetween,
  localTimeToUtc,
  toIso,
  toLocalDayKey,
} from '../common/schemas/datetime.schema';
import { toPage, toSkipTake } from '../common/schemas/pagination.schema';
import {
  tryMapTier,
  type CreditTier,
  type ResourceTier,
} from '../common/schemas/status.schema';
import type { TrpcUser } from '../trpc/context';
import type {
  CancelRequestInput,
  CreateRequestInput,
  CreateRoomBookingInput,
  ListMyRequestsInput,
  RequestStatus,
} from './loan.schema';

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
      // ItemKey names the type, for finding siblings of the same ItemInfo
      // when a T1 unit turns out not to be free (FR-RSV-04).
      ItemKey: true,
      Item: { select: { ItemName: true, CreditWeight: true } },
    },
  },
  Room: {
    select: {
      RoomName: true,
      CreditWeight: true,
      OpenTime: true,
      CloseTime: true,
      BreakStart: true,
      BreakEnd: true,
    },
  },
} satisfies Prisma.ResourceInfoSelect;

type ResourceRow = Prisma.ResourceInfoGetPayload<{
  select: typeof RESOURCE_SELECT;
}>;

const REQUEST_SELECT = {
  ReservationKey: true,
  ReservedBy: true,
  Reason: true,
  DecisionNote: true,
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
    select: { UsageKey: true, CurrentStatus: true, DueTime: true },
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
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
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
          detail: error.details,
        });
      }
    }

    return {
      created: created.map((row) => this.toRequest(row, toBand)),
      rejected,
    };
  }

  /**
   * Book a room from a run of half-hour slots (§5.5, T3).
   *
   * Thin on purpose. It turns chips into a window and hands the result to
   * `create`, which owns every rule a booking has to pass. The two things it
   * does own are the ones only rooms have: that the key names a room at all,
   * and that the slots form one unbroken run — `slotsToWindow` throws
   * ROOM_SLOTS_NOT_CONTIGUOUS for a pair the lunch break separates, which is
   * the case a plain start/end window cannot express.
   */
  async createRoomBooking(user: TrpcUser, input: CreateRoomBookingInput) {
    const room = await this.prisma.roomInfo.findUnique({
      where: { RoomKey: input.roomKey },
      select: {
        OpenTime: true,
        CloseTime: true,
        BreakStart: true,
        BreakEnd: true,
        Resource: { select: { ResourceKey: true } },
      },
    });
    if (!room) {
      throw new BusinessError('ROOM_NOT_FOUND', { id: input.roomKey });
    }

    const { startTime, endTime } = slotsToWindow(
      toRoomHours(room),
      input.date,
      input.slots,
    );

    return this.create(user, {
      startTime: toIso(startTime),
      endTime: toIso(endTime),
      lines: [{ resourceKey: room.Resource.ResourceKey, reason: input.reason }],
    });
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

    // Same rule whether the window came from chips or from raw instants.
    if (resource.Room) {
      assertRoomWindow(toRoomHours(resource.Room), startTime, endTime);
    }

    const tier = tryMapTier(resource.BorrowRuleInfo.RuleName);
    if (tier === null) {
      throw new BusinessError('TIER_NOT_CONFIGURED', {
        resourceKey,
        borrowRuleKey: resource.BorrowRule,
      });
    }

    // How far ahead this tier may be reserved (FR-RSV-03, FR-RSV-01). Cheap
    // and tier-only, so it runs before any DB round trip that would be wasted
    // on a window the tier cannot use at all.
    this.assertReservationHorizon(tier, startTime, endTime);

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

    // FR-RSV-04 (G1, T1): a T1 unit that is not free for the window is swapped
    // for a free sibling rather than refused outright. T2 binds a specific
    // serial (FR-RSV-05), so it only gets a clearer refusal; everything else
    // (T0, T3) just takes the plain check.
    let target: ResourceRow = resource;
    if (tier === 'T1') {
      target = await this.resolveT1Target(resource, startTime, endTime);
    } else if (tier === 'T2') {
      target = await this.assertWindowFreeForSerial(
        resource,
        startTime,
        endTime,
      );
    } else {
      await this.assertWindowFree(resource, startTime, endTime);
    }

    const route = routeFor({ tier, creditTier });
    const now = new Date();
    const approved = route === 'auto';

    const key = await runSerializable(this.prisma, async (tx) => {
      // Re-check inside the transaction. Two people submitting the same unit
      // for the same hours a moment apart both pass the check above; only one
      // may come out of here holding it.
      const { from, to } = withBuffer(startTime, endTime, target.BufferTime);
      const taken = await tx.reservations.count({
        where: clashingWindowFilter(target.ResourceKey, from, to),
      });
      if (taken > 0) {
        throw new BusinessError('WINDOW_NOT_AVAILABLE', {
          resourceKey: target.ResourceKey,
          from: toIso(from),
          to: toIso(to),
        });
      }

      if (target.Room) {
        const holding = await tx.reservations.count({
          where: {
            ReservedBy: user.accountKey,
            ApproveStatus: { in: [...HOLDING_APPROVE_STATES] },
            EndTime: { gt: new Date() },
            Resource: { ResourceType: 'Room' },
          },
        });
        if (holding >= MAX_ACTIVE_ROOM_BOOKINGS) {
          throw new BusinessError('ROOM_BOOKING_LIMIT_REACHED', {
            limit: MAX_ACTIVE_ROOM_BOOKINGS,
            holding,
          });
        }
      }

      const row = await tx.reservations.create({
        data: {
          ResourceKey: target.ResourceKey,
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
            ? collectDeadline(startTime, now)
            : // Nothing is being held yet, so the field carries the end of the
              // requested window rather than a collection deadline.
              endTime,
        },
        select: { ReservationKey: true },
      });

      if (approved) {
        await this.notifications.itemToPrepare(tx, {
          manageGroupKey: target.ManagedBy,
          reservationKey: row.ReservationKey,
          itemName: resourceName(target),
        });
      }

      // FR-NTF-04: T2, or T1 from a D2/D3 borrower, sits on a supervisor's
      // desk until decided — tell every supervisor with authority over the
      // department, not just the one who happens to open the queue next.
      if (route === 'supervisor') {
        const supervisors = await supervisorsForGroup(tx, target.ManagedBy);
        await Promise.all(
          supervisors
            .filter((s) => s.AccountKey !== user.accountKey)
            .map((s) =>
              this.notifications.requestNeedsSupervisor(tx, {
                accountKey: s.AccountKey,
                reservationKey: row.ReservationKey,
                itemName: resourceName(target),
              }),
            ),
        );
      }

      return row.ReservationKey;
    });

    // One row per reservation opened, after the write commits.
    await this.audit.record(
      { accountKey: user.accountKey },
      'create',
      `reservation/${key}`,
      `Requested ${target.Item ? target.Item.Item.ItemName : (target.Room?.RoomName ?? 'resource')} (resourceKey ${target.ResourceKey})${approved ? ', auto-approved' : ''}`,
    );

    return this.read(key);
  }

  /**
   * How far ahead this tier may be reserved.
   *
   * FR-RSV-03: T0 is stock borrowed on the spot ("ยืมได้ทันทีตามของคงเหลือ"),
   * not reserved for a future day - a T0 line is refused once its start falls
   * on a later Bangkok day than today. `assertWindowShape` already refused a
   * start in the past, so what is left to catch here is only "later", not
   * "earlier".
   *
   * FR-RSV-01: T1/T2 may be reserved ahead, but only to the end of the current
   * term. `TERM_END_DATE` is read here, at call time, rather than into a
   * module-level constant at import time, so changing it takes effect on the
   * next request instead of needing a restart. Left unset, this half of the
   * check is skipped - the 90-day cap a borrower sees on the request screen
   * (`BUSINESS.RESERVATION_MAX_DAYS`) is enforced there only, same as before
   * this method existed.
   */
  private assertReservationHorizon(
    tier: ResourceTier,
    startTime: Date,
    endTime: Date,
  ): void {
    if (tier === 'T0') {
      if (toLocalDayKey(startTime) > toLocalDayKey(new Date())) {
        throw new BusinessError('T0_NOT_RESERVABLE', {
          startTime: toIso(startTime),
        });
      }
      return;
    }

    if (tier !== 'T1' && tier !== 'T2') return;

    const termEnd = process.env.TERM_END_DATE;
    if (!termEnd) return;

    // Midnight Bangkok the day after TERM_END_DATE - the first instant that
    // no longer belongs to the current term.
    const termEndExclusive = addDays(localTimeToUtc(termEnd, '00:00'), 1);
    if (endTime.getTime() >= termEndExclusive.getTime()) {
      throw new BusinessError('RESERVATION_PAST_TERM_END', {
        termEnd: toIso(new Date(termEndExclusive.getTime() - 1)),
      });
    }
  }

  /**
   * FR-RSV-04 (G1, T1): the requested unit, unless it turns out not to be
   * free - then another unit of the same ItemInfo, in the same department,
   * that IS free for the whole window. T1 stock is interchangeable within its
   * item type, so this is a straight swap rather than a refusal: the response
   * already returns the created request's own resource, so the borrower sees
   * which unit they got.
   *
   * If nothing else qualifies, the original refusal is what surfaces -
   * WINDOW_NOT_AVAILABLE with `nextAvailableAt`, or WINDOW_CROSSES_RESERVATION
   * with `maxEndTime` (FR-RSV-06) - unchanged.
   */
  private async resolveT1Target(
    resource: ResourceRow,
    startTime: Date,
    endTime: Date,
  ): Promise<ResourceRow> {
    try {
      await this.assertWindowFree(resource, startTime, endTime);
      return resource;
    } catch (error) {
      if (!(error instanceof BusinessError)) throw error;
      const sibling = await this.findFreeSibling(resource, startTime, endTime);
      if (!sibling) throw error;
      return sibling;
    }
  }

  /** Other units of the same ItemInfo, in the same department, free for the whole window. */
  private async findFreeSibling(
    resource: ResourceRow,
    startTime: Date,
    endTime: Date,
  ): Promise<ResourceRow | null> {
    if (!resource.Item) return null;

    const siblings = await this.prisma.resourceInfo.findMany({
      where: {
        ManagedBy: resource.ManagedBy,
        AllowBorrow: true,
        ResourceStatus: { not: 'Missing' },
        ResourceKey: { not: resource.ResourceKey },
        Item: { ItemKey: resource.Item.ItemKey },
      },
      select: RESOURCE_SELECT,
    });
    if (siblings.length === 0) return null;

    const free = await resourcesFreeInWindow(
      this.prisma,
      siblings.map((s) => ({
        ResourceKey: s.ResourceKey,
        BufferTime: s.BufferTime,
      })),
      startTime,
      endTime,
    );

    // Lowest key first - a stable, arbitrary tie-break among units that are
    // all equally free right now.
    return (
      siblings
        .filter((s) => free.has(s.ResourceKey))
        .sort((a, b) => a.ResourceKey - b.ResourceKey)[0] ?? null
    );
  }

  /**
   * FR-RSV-05 (G1, T2): still refuses, but a T2 serial has no sibling to move
   * to the way T1 does, so the plain "unit not free" refusal is recast into a
   * code that tells the borrower what to do about it - choose another serial
   * number - rather than reading like the whole time period is closed.
   *
   * WINDOW_CROSSES_RESERVATION (G2) is left as-is: it already carries its own
   * next step (shorten the loan), which applies here too.
   */
  private async assertWindowFreeForSerial(
    resource: ResourceRow,
    startTime: Date,
    endTime: Date,
  ): Promise<ResourceRow> {
    try {
      await this.assertWindowFree(resource, startTime, endTime);
      return resource;
    } catch (error) {
      if (
        error instanceof BusinessError &&
        (error.businessCode === 'WINDOW_NOT_AVAILABLE' ||
          error.businessCode === 'ITEM_UNAVAILABLE')
      ) {
        throw new BusinessError(
          'SERIAL_NOT_AVAILABLE',
          error.details ?? undefined,
        );
      }
      throw error;
    }
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
   * The borrower confirms that a prepared unit has physically been received.
   * Kept separate from the existing staff-counter confirmation so both flows
   * retain their own authorization and ownership rules.
   */
  async confirmMyPickup(user: TrpcUser, usageKey: number) {
    const usage = await this.prisma.usageLog.findUnique({
      where: { UsageKey: usageKey },
      select: {
        UsageKey: true,
        AccountKey: true,
        ResourceKey: true,
        ReservationKey: true,
        CurrentStatus: true,
        CheckoutTime: true,
      },
    });

    if (
      !usage ||
      usage.AccountKey !== user.accountKey ||
      usage.ReservationKey === null
    ) {
      throw new BusinessError('LOAN_NOT_FOUND', { usageKey });
    }
    if (usage.CurrentStatus !== 'Prepared') {
      throw new BusinessError('WRONG_LOAN_STATE', {
        usageKey,
        status: usage.CurrentStatus,
        expected: 'Prepared',
      });
    }

    // Until the pickup window opens, only staff can hand it over (early).
    // allocate() writes the booked pickup time into CheckoutTime.
    const opensAt = pickupOpensAt(usage.CheckoutTime);
    if (new Date() < opensAt) {
      throw new BusinessError('PICKUP_NOT_OPEN', {
        usageKey,
        opensAt: toIso(opensAt),
      });
    }

    const photo = await this.prisma.images.findFirst({
      where: {
        UsageKey: usageKey,
        SubmittedBy: user.accountKey,
        SubmissionType: 'BeforePicture',
      },
      select: { ImageKey: true },
    });
    if (!photo) {
      throw new BusinessError('PICKUP_PHOTO_REQUIRED', { usageKey });
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.usageLog.updateMany({
        where: {
          UsageKey: usageKey,
          AccountKey: user.accountKey,
          CurrentStatus: 'Prepared',
        },
        data: { CurrentStatus: 'Lended', CheckoutTime: now },
      });
      if (changed.count !== 1) {
        throw new BusinessError('WRONG_LOAN_STATE', {
          usageKey,
          expected: 'Prepared',
        });
      }

      await tx.resourceInfo.update({
        where: { ResourceKey: usage.ResourceKey },
        data: { ResourceStatus: 'Lended' },
      });
    });

    await this.audit.record(
      { accountKey: user.accountKey },
      'update',
      `loan/${usage.UsageKey}`,
      'Borrower confirmed self-pickup',
    );

    return this.toRequest(
      await this.read(usage.ReservationKey),
      await this.creditTiers.tierMapper(),
    );
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
        DecisionNote: input.reason ?? null,
      },
    });

    await this.audit.record(
      { accountKey: user.accountKey },
      'update',
      `reservation/${input.reservationKey}`,
      `Borrower cancelled the request${input.reason ? `: ${input.reason}` : ''}`,
    );

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
      // FR-RSV-06 (G2): the unit is free right at the requested start, but a
      // later reservation already claims part of the window - the borrower
      // can still have it up to just before that reservation's own prep
      // buffer, so this is offered as a shorter window instead of a flat
      // refusal. A clash starting at or before the requested start leaves no
      // usable window at all, which is the plain WINDOW_NOT_AVAILABLE case.
      if (clash.StartTime.getTime() > startTime.getTime()) {
        throw new BusinessError('WINDOW_CROSSES_RESERVATION', {
          resourceKey: resource.ResourceKey,
          maxEndTime: toIso(addDays(clash.StartTime, -resource.BufferTime)),
        });
      }
      throw new BusinessError('WINDOW_NOT_AVAILABLE', {
        resourceKey: resource.ResourceKey,
        nextAvailableAt: toIso(addDays(clash.EndTime, resource.BufferTime)),
      });
    }

    // A unit that is physically out on an older loan blocks the window too,
    // even with no reservation row behind it - a walk-in loan recorded at the
    // counter is exactly that case.
    const held = await this.prisma.usageLog.findFirst({
      where: heldUsageFilter(resource.ResourceKey, from),
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
      decisionNote: row.DecisionNote,
      requestedAt: toIso(row.ActionTime),
      expiresAt:
        row.ApproveStatus === 'Approved' && usage === null
          ? toIso(row.ReservationExpiration)
          : null,
      approval: {
        route,
        status: row.ApproveStatus,
        approvedBy: row.ApprovedByUser
          ? toBorrowerRef(row.ApprovedByUser)
          : null,
        autoApproved: row.AutoApproved,
        approvedAt: row.ApprovedAt ? toIso(row.ApprovedAt) : null,
        resolvedAt: row.ResolvedAt ? toIso(row.ResolvedAt) : null,
      },
      usageKey: usage?.UsageKey ?? null,
      dueAt: usage ? toIso(usage.DueTime) : null,
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
