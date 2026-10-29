import { toBorrowerRef } from './loan.schema';
import { Injectable, Logger } from '@nestjs/common';
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
  assertPickupWindowOpen,
  assertResourceLendable,
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
  holdsRoomQuota,
  roomQuotaWhere,
  slotsToWindow,
  toRoomHours,
} from '../common/booking/room-slots';
import { BusinessError } from '../common/errors/business-error';
import { lockRow } from '../common/db/lock-row';
import {
  NotificationService,
  resourceName,
  supervisorsForGroup,
} from '../notification/notification.service';
import {
  addDays,
  daysBetween,
  localTimeToUtc,
  isClosedDay,
  rollDueOffClosedDays,
  openDayEndBefore,
  toIso,
  toLocalDayKey,
  withinWorkHours,
  workHours,
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
  CartKey: true,
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

/** The service's own client, or the cart transaction's (#236). */
type ReadClient = PrismaService | Prisma.TransactionClient;

/** A line that passed every check that does not depend on the rest of the cart. */
interface LinePlan {
  /** As requested; refusals are reported against it. */
  resourceKey: number;
  resource: ResourceRow;
  tier: ResourceTier;
  route: ApprovalRoute;
  reason: string | null;
  startTime: Date;
  /** Already rolled off closed days for equipment. */
  endTime: Date;
}

interface BookedLine {
  reservationKey: number;
  auditNote: string;
}

export interface LineRefusal {
  resourceKey: number;
  code: string;
  detail: Record<string, unknown> | null;
}

/** Carries a cart's refused lines out of its transaction, rolling it back. */
class CartRefused extends Error {
  constructor(readonly lines: LineRefusal[]) {
    super('CART_REFUSED');
  }
}

/**
 * The borrower's own view of the loan domain: opening a request, watching it
 * move, and calling it off.
 *
 * Separate from LoanService because the two answer to different people. That
 * one is the counter — every method takes a staff member and asserts
 * departmental scope. This one takes a borrower and asserts ownership: the
 * only rows it will ever touch are the caller's own.
 */
/**
 * P-10: how many days ahead a T1/T2 booking may end. Same number as the
 * request screen's BUSINESS.RESERVATION_MAX_DAYS (frontend/src/constants);
 * change both together.
 */
export const RESERVATION_MAX_DAYS = 90;

const termEndLogger = new Logger('ReservationHorizon');
let warnedTermEnd: string | null = null;

/** Once per distinct bad value, so a typo in TERM_END_DATE does not flood the log. */
function warnBadTermEnd(value: string): void {
  if (warnedTermEnd === value) return;
  warnedTermEnd = value;
  termEndLogger.warn(
    `TERM_END_DATE "${value}" is not a YYYY-MM-DD date; the term-end check is off, the ${RESERVATION_MAX_DAYS}-day cap still applies`,
  );
}

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
   * Opens one request per basket line, as one cart, whole or not at all.
   *
   * #236 (instructor item 1, team decision D-01): a cart is one borrow, so a
   * line that cannot be had refuses the whole cart instead of leaving half of
   * it booked. Every refused line is reported, so the borrower can fix them
   * all before sending again. The two checks that concern the *borrower*
   * rather than the item - credit block and window shape - are done once up
   * front and do throw, because they fail every line identically.
   *
   * Two passes. The checks that do not depend on the other lines (the unit
   * exists and is lendable, counter hours, tier, horizon, eligibility,
   * length) run first, outside any transaction, so a refusal there writes
   * nothing. Then every line is booked in order inside one serializable
   * transaction: a later line sees the units the earlier ones took, so two
   * lines of one type get two units, and one refusal rolls back the cart,
   * every line and every notice they wrote.
   */
  async create(user: TrpcUser, input: CreateRequestInput) {
    const startTime = new Date(input.startTime);
    const endTime = new Date(input.endTime);
    this.assertWindowShape(startTime, endTime);

    const band = await this.creditTiers.resolveTier(user.creditScore);
    const toBand = await this.creditTiers.tierMapper();
    const refusal = (resourceKey: number, error: BusinessError) => ({
      resourceKey,
      code: error.message,
      detail: error.details,
    });
    // Typed once so every return has the same shape, refused or not.
    const noRequests: ReturnType<typeof this.toRequest>[] = [];
    const noRefusals: LineRefusal[] = [];

    const plans: LinePlan[] = [];
    const rejected: LineRefusal[] = [];
    for (const line of input.lines) {
      try {
        plans.push(
          await this.planLine(
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
        rejected.push(refusal(line.resourceKey, error));
      }
    }
    if (rejected.length > 0) return { created: noRequests, rejected };

    let booked: BookedLine[];
    try {
      booked = await runSerializable(this.prisma, async (tx) => {
        // One cart per submit: its lines are approved and handled as one borrow.
        const cart = await tx.requestCart.create({
          data: {},
          select: { CartKey: true },
        });
        const lines: BookedLine[] = [];
        const refused: LineRefusal[] = [];
        for (const plan of plans) {
          try {
            lines.push(await this.bookLine(tx, user, plan, cart.CartKey));
          } catch (error) {
            if (!(error instanceof BusinessError)) throw error;
            refused.push(refusal(plan.resourceKey, error));
          }
        }
        // Thrown rather than returned, so the transaction rolls back.
        if (refused.length > 0) throw new CartRefused(refused);
        return lines;
      });
    } catch (error) {
      if (error instanceof CartRefused) {
        return { created: noRequests, rejected: error.lines };
      }
      throw error;
    }

    // One audit row per reservation opened, after the write commits.
    const created: RequestRow[] = [];
    for (const line of booked) {
      await this.audit.record(
        { accountKey: user.accountKey },
        'create',
        `reservation/${line.reservationKey}`,
        line.auditNote,
      );
      created.push(await this.read(line.reservationKey));
    }
    return {
      created: created.map((row) => this.toRequest(row, toBand)),
      rejected: noRefusals,
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

  /**
   * The checks on one line that do not depend on the rest of the cart. Reads
   * only, so a refusal here writes nothing (#236).
   */
  private async planLine(
    user: TrpcUser,
    creditTierKey: number,
    creditTier: Parameters<typeof routeFor>[0]['creditTier'],
    resourceKey: number,
    reason: string | null,
    startTime: Date,
    requestedEnd: Date,
  ): Promise<LinePlan> {
    let endTime = requestedEnd;
    const resource = await this.prisma.resourceInfo.findUnique({
      where: { ResourceKey: resourceKey },
      select: RESOURCE_SELECT,
    });
    if (!resource) {
      throw new BusinessError('RESOURCE_NOT_FOUND', { resourceKey });
    }
    assertResourceLendable(resourceKey, resource);

    // Same rule whether the window came from chips or from raw instants.
    if (resource.Room) {
      assertRoomWindow(toRoomHours(resource.Room), startTime, endTime);
    } else {
      // Items are collected and returned at the counter; rooms keep their own
      // opening hours above.
      for (const [edge, at] of [
        ['START', startTime],
        ['END', endTime],
      ] as const) {
        // A pickup on a closed day is refused too: the counter is shut. A
        // return then is fine, it rolls to the next open day (#178 weekends,
        // #234 holidays). A day the admin opened for this department counts
        // as open.
        const closedDay =
          edge === 'START' && isClosedDay(at, resource.ManagedBy);
        if (!withinWorkHours(at) || closedDay) {
          throw new BusinessError('OUTSIDE_WORK_HOURS', {
            edge,
            at: toIso(at),
            opensAt: workHours.start,
            closesAt: workHours.end,
            ...(closedDay ? { reason: 'CLOSED_DAY' } : {}),
          });
        }
      }
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
    // After the day limit: the borrower asked for a loan of open days, and
    // the weekend or holiday the counter is shut is not theirs to be charged
    // for.
    if (!resource.Room)
      endTime = rollDueOffClosedDays(endTime, resource.ManagedBy);

    return {
      resourceKey,
      resource,
      tier,
      route: routeFor({ tier, creditTier }),
      reason,
      startTime,
      endTime,
    };
  }

  /**
   * Books one planned line inside the cart's transaction (#236). Availability
   * is read through `tx`, so it sees the units the cart's earlier lines just
   * took; a refusal rolls back the whole cart.
   */
  private async bookLine(
    tx: Prisma.TransactionClient,
    user: TrpcUser,
    plan: LinePlan,
    cartKey: number,
  ): Promise<BookedLine> {
    const { resource, tier, reason, startTime, endTime } = plan;
    // FR-RSV-04 (G1, T1): a T1 unit that is not free for the window is swapped
    // for a free sibling rather than refused outright. T2 does the same now
    // that the borrower asks for a type and staff choose the unit (demo
    // feedback); the unit sent is only a placeholder, and refusing it while a
    // sibling is free turned a race between two borrowers into a false "not
    // available". With no sibling left T2 keeps its clearer refusal. T0 swaps
    // like T1 (#227): the screen always sends the first free unit, so a unit
    // taken a moment earlier refused a type that still had others. T3 (a
    // room) takes the plain check.
    let target: ResourceRow = resource;
    if (tier === 'T0' || tier === 'T1') {
      target = await this.resolveT1Target(resource, startTime, endTime, tx);
    } else if (tier === 'T2') {
      target = await this.assertWindowFreeForSerial(
        resource,
        startTime,
        endTime,
        tx,
      ).catch(async (error: unknown) => {
        if (
          !(error instanceof BusinessError) ||
          error.businessCode !== 'SERIAL_NOT_AVAILABLE'
        )
          throw error;
        const sibling = await this.findFreeSibling(
          resource,
          startTime,
          endTime,
          tx,
        );
        if (!sibling) throw error;
        return sibling;
      });
    } else {
      await this.assertWindowFree(resource, startTime, endTime, tx);
    }

    const route = plan.route;
    const now = new Date();
    const approved = route === 'auto';

    {
      // Counted once more just before writing. The check above already ran in
      // this serializable transaction, so two borrowers taking the same unit
      // a moment apart cannot both commit; this keeps the refusal explicit.
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
        // One definition, shared with the `holdsRoomQuota` flag every request
        // row carries, so the screen can close the button on exactly what this
        // would refuse (#215, #216).
        const holding = await tx.reservations.count({
          where: roomQuotaWhere(user.accountKey),
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
          CartKey: cartKey,
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

      return {
        reservationKey: row.ReservationKey,
        auditNote: `Requested ${target.Item ? target.Item.Item.ItemName : (target.Room?.RoomName ?? 'resource')} (resourceKey ${target.ResourceKey})${approved ? ', auto-approved' : ''}`,
      };
    }
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
   * next request instead of needing a restart. A value that is not a
   * YYYY-MM-DD date is logged and skipped rather than compared as NaN, which
   * used to switch the check off without a word.
   *
   * P-10: whatever the term, the booking may not end later than the 90th day
   * from today - the last day the request screen offers
   * (`BUSINESS.RESERVATION_MAX_DAYS`). Before this the cap lived only in the
   * screen, so with TERM_END_DATE unset (as on Render) a booking for 2031 was
   * accepted. The term check runs first because its message is the more
   * specific one when both apply.
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
    if (termEnd) {
      // Midnight Bangkok the day after TERM_END_DATE - the first instant that
      // no longer belongs to the current term.
      const termEndExclusive = addDays(localTimeToUtc(termEnd, '00:00'), 1);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(termEnd) ||
        Number.isNaN(termEndExclusive.getTime())
      ) {
        warnBadTermEnd(termEnd);
      } else if (endTime.getTime() >= termEndExclusive.getTime()) {
        throw new BusinessError('RESERVATION_PAST_TERM_END', {
          termEnd: toIso(new Date(termEndExclusive.getTime() - 1)),
        });
      }
    }

    const lastDay = toLocalDayKey(addDays(new Date(), RESERVATION_MAX_DAYS));
    const capExclusive = addDays(localTimeToUtc(lastDay, '00:00'), 1);
    if (endTime.getTime() >= capExclusive.getTime()) {
      throw new BusinessError('RESERVATION_TOO_FAR', {
        maxDays: RESERVATION_MAX_DAYS,
        lastDay,
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
    db: ReadClient = this.prisma,
  ): Promise<ResourceRow> {
    try {
      await this.assertWindowFree(resource, startTime, endTime, db);
      return resource;
    } catch (error) {
      if (!(error instanceof BusinessError)) throw error;
      const sibling = await this.findFreeSibling(
        resource,
        startTime,
        endTime,
        db,
      );
      if (!sibling) throw error;
      return sibling;
    }
  }

  /** Other units of the same ItemInfo and tier, in the same department, free for the whole window. */
  private async findFreeSibling(
    resource: ResourceRow,
    startTime: Date,
    endTime: Date,
    db: ReadClient = this.prisma,
  ): Promise<ResourceRow | null> {
    if (!resource.Item) return null;

    const siblings = await db.resourceInfo.findMany({
      where: {
        ManagedBy: resource.ManagedBy,
        AllowBorrow: true,
        ResourceStatus: { notIn: ['Missing', 'Retired'] },
        ResourceKey: { not: resource.ResourceKey },
        Item: { ItemKey: resource.Item.ItemKey },
        // #231: same tier only, so the approval route chosen from the unit
        // asked for is still right for the unit given.
        BorrowRule: resource.BorrowRule,
      },
      select: RESOURCE_SELECT,
    });
    if (siblings.length === 0) return null;

    const free = await resourcesFreeInWindow(
      db,
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
    db: ReadClient = this.prisma,
  ): Promise<ResourceRow> {
    try {
      await this.assertWindowFree(resource, startTime, endTime, db);
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
        DueTime: true,
        Resource: { select: { ResourceStatus: true, AllowBorrow: true } },
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
    // #212: and not after it has closed. Half an hour is the whole of a room's
    // window, so this edge is reached in ordinary use rather than only by
    // somebody who forgot about their booking for a week.
    assertPickupWindowOpen(usageKey, usage.DueTime, new Date());
    // #213: the unit was judged lendable when the booking was made and set
    // aside when it was prepared, and neither of those moments is this one. A
    // room sent to repair in between must not be walked into.
    assertResourceLendable(usage.ResourceKey, usage.Resource);

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
   * Allowed until the borrower collects it (FR-REQ-10, revised 29 Oct 2569):
   * pending, approved, or prepared and waiting at the counter. A prepared row
   * is removed with its pickup photos, exactly as the no-show job does, which
   * frees the unit's hours; staff are told to put a prepared item back on the
   * shelf. A room counts from preparation until check-in (#162), and
   * preparing one moves nothing, so there is nothing to tell the counter.
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
    const usage = row.UsageLogs[0] ?? null;
    if (usage && !LoanRequestService.awaitingCollection(row)) {
      throw new BusinessError('CANNOT_CANCEL', {
        reservationKey: input.reservationKey,
        usageKey: usage.UsageKey,
        reason: 'ALREADY_COLLECTED',
      });
    }

    const cancelled = {
      ApproveStatus: 'Canceled' as const,
      ResolvedAt: new Date(),
      DecisionNote: input.reason ?? null,
    };
    const released = await this.prisma.$transaction(async (tx) => {
      // #220: lock, then re-check under the lock. The loan row goes first when
      // there is one, the order a handover and a unit swap use (they lock it,
      // then touch the request), so a cancel racing a handover waits for it
      // and then sees "collected" instead of deleting a loan already lent.
      // The request lock serialises the cancel with staff preparing it.
      if (usage) await lockRow(tx, 'UsageLog', usage.UsageKey);
      await lockRow(tx, 'Reservations', input.reservationKey);
      const fresh = await tx.reservations.findUniqueOrThrow({
        where: { ReservationKey: input.reservationKey },
        select: {
          ApproveStatus: true,
          UsageLogs: { select: { UsageKey: true, CurrentStatus: true } },
          Resource: {
            select: {
              ManagedBy: true,
              Item: {
                select: { ItemID: true, Item: { select: { ItemName: true } } },
              },
              Room: { select: { RoomName: true } },
            },
          },
        },
      });
      if (
        fresh.ApproveStatus === 'Canceled' ||
        fresh.ApproveStatus === 'Rejected'
      ) {
        throw new BusinessError('ALREADY_DECIDED', {
          reservationKey: input.reservationKey,
          status: fresh.ApproveStatus,
        });
      }
      const freshUsage = fresh.UsageLogs[0];
      if (freshUsage) {
        // Already held when the read above saw it (locking again is a no-op);
        // its first lock when staff prepared it in between. Read its state
        // under the lock either way.
        await lockRow(tx, 'UsageLog', freshUsage.UsageKey);
        const { CurrentStatus } = await tx.usageLog.findUniqueOrThrow({
          where: { UsageKey: freshUsage.UsageKey },
          select: { CurrentStatus: true },
        });
        if (CurrentStatus !== 'Prepared') {
          throw new BusinessError('CANNOT_CANCEL', {
            reservationKey: input.reservationKey,
            usageKey: freshUsage.UsageKey,
            reason: 'ALREADY_COLLECTED',
          });
        }
        await tx.images.deleteMany({
          where: { UsageKey: freshUsage.UsageKey },
        });
        await tx.usageLog.delete({ where: { UsageKey: freshUsage.UsageKey } });
      }
      await tx.reservations.update({
        where: { ReservationKey: input.reservationKey },
        data: cancelled,
      });
      if (freshUsage && fresh.Resource.Item) {
        await this.notifications.preparedUnitReleased(tx, {
          manageGroupKey: fresh.Resource.ManagedBy,
          reservationKey: input.reservationKey,
          itemName: resourceName(fresh.Resource),
          serialNo: fresh.Resource.Item.ItemID,
        });
      }
      return freshUsage !== undefined;
    });

    await this.audit.record(
      { accountKey: user.accountKey },
      'update',
      `reservation/${input.reservationKey}`,
      `Borrower cancelled the request${released ? ' after it was prepared (unit released)' : ''}${input.reason ? `: ${input.reason}` : ''}`,
    );

    return this.toRequest(
      await this.read(input.reservationKey),
      await this.creditTiers.tierMapper(),
    );
  }

  // =========================================================================
  // Internals
  // =========================================================================

  /**
   * Set aside at the counter but not yet collected (a room: not yet checked
   * into), so still the borrower's to cancel.
   */
  private static awaitingCollection(row: RequestRow): boolean {
    return row.UsageLogs[0]?.CurrentStatus === 'Prepared';
  }

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
    resource: { ResourceKey: number; BufferTime: number; ManagedBy: number },
    startTime: Date,
    endTime: Date,
    db: ReadClient = this.prisma,
  ): Promise<void> {
    const { from, to } = withBuffer(startTime, endTime, resource.BufferTime);

    const clash = await db.reservations.findFirst({
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
          maxEndTime: toIso(
            openDayEndBefore(
              addDays(clash.StartTime, -resource.BufferTime),
              startTime,
              resource.ManagedBy,
            ),
          ),
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
    const held = await db.usageLog.findFirst({
      where: heldUsageFilter(resource.ResourceKey, from, to),
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
      cartKey: row.CartKey,
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
        (usage === null || LoanRequestService.awaitingCollection(row)),
      holdsRoomQuota: holdsRoomQuota({
        ApproveStatus: row.ApproveStatus,
        EndTime: row.EndTime,
        isRoom: row.Resource.Room !== null,
      }),
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
