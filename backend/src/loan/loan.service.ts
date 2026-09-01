import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { StaffScopeService } from '../common/authority/staff-scope.service';
import { PenaltyService } from '../common/penalty/penalty.service';
import { BusinessError } from '../common/errors/business-error';
import {
  daysBetween,
  toIso,
  toIsoNullable,
} from '../common/schemas/datetime.schema';
import { toPage, toSkipTake } from '../common/schemas/pagination.schema';
import { tryMapTier, type ResourceTier } from '../common/schemas/status.schema';
import { UNAVAILABLE_USAGE_STATES } from '../common/usage/usage-states';
import type { TrpcUser } from '../trpc/context';
import type {
  AllocateLoanInput,
  ConfirmPickupInput,
  DecideExtensionInput,
  ListStaffQueueInput,
  MarkLostInput,
  RecordReturnInput,
  SwapUnitInput,
} from './loan.schema';

/**
 * How long past due before a thing counts as lost (proposal §5.7:
 * "หากไม่นำอุปกรณ์มาคืนภายใน 2 สัปดาห์หลังหมดกำหนดยืม จะถือว่าอุปกรณ์สูญหาย").
 *
 * The same number the daily "mark lost" job needs. It lives here rather than in
 * that job because the counter can reach the decision first, and the two must
 * not disagree about when.
 */
const LOST_AFTER_OVERDUE_DAYS = 14;

/** Borrower fields every queue row and loan detail carries. */
const BORROWER_SELECT = {
  AccountKey: true,
  UserID: true,
  UserFName: true,
  UserLName: true,
  UserCredit: true,
} as const;

/**
 * Enough of a resource to label it at the counter and to price a penalty.
 *
 * `Item` and `Room` are both selected because a ResourceInfo is exactly one of
 * the two, and which one decides where the name and the credit weight come from.
 */
const RESOURCE_SELECT = {
  ResourceKey: true,
  ManagedBy: true,
  BufferTime: true,
  BorrowRule: true,
  BorrowRuleInfo: { select: { RuleName: true } },
  Item: {
    select: {
      ItemKey: true,
      ItemID: true,
      Item: { select: { ItemName: true, CreditWeight: true } },
    },
  },
  Room: { select: { RoomName: true, CreditWeight: true } },
} satisfies Prisma.ResourceInfoSelect;

type ResourceRow = Prisma.ResourceInfoGetPayload<{
  select: typeof RESOURCE_SELECT;
}>;

const USAGE_SELECT = {
  UsageKey: true,
  ReservationKey: true,
  CurrentStatus: true,
  DueTime: true,
  CheckoutTime: true,
  CheckInTime: true,
  PendingExtension: true,
  Account: { select: BORROWER_SELECT },
  Resource: { select: RESOURCE_SELECT },
  CheckoutConditionLog: { select: { Condition: true, Notes: true } },
  CheckInConditionLog: { select: { Condition: true } },
} satisfies Prisma.UsageLogSelect;

type UsageRow = Prisma.UsageLogGetPayload<{ select: typeof USAGE_SELECT }>;

/**
 * The handover desk (proposal §5.9 daily tasks).
 *
 * Each mutation asserts the state it expects before writing, and every write
 * that touches more than one table runs in a transaction — a UsageLog that says
 * "lent" beside a ResourceInfo that says "in storage" is the failure this desk
 * cannot recover from by hand.
 */
@Injectable()
export class LoanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: StaffScopeService,
    private readonly penalties: PenaltyService,
  ) {}

  // =========================================================================
  // The work queue
  // =========================================================================

  async listStaffQueue(user: TrpcUser, input: ListStaffQueueInput) {
    const now = new Date();
    const resourceWhere = await this.resourceWhereForScope(user, input.tier);

    if (input.bucket === 'toPrepare') {
      return this.listToPrepare(resourceWhere, input);
    }

    const where: Prisma.UsageLogWhereInput = {
      Resource: resourceWhere,
      CurrentStatus: input.bucket === 'toHandover' ? 'Prepared' : 'Lended',
      ...(input.bucket === 'overdue' ? { DueTime: { lt: now } } : {}),
    };

    if (input.q) {
      where.OR = this.searchClauses(input.q);
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.usageLog.findMany({
        where,
        // Oldest first in every bucket: this is a queue, and the counter works
        // it from the top. `sort` is not offered for that reason.
        orderBy: { DueTime: 'asc' },
        ...toSkipTake(input),
        select: USAGE_SELECT,
      }),
      this.prisma.usageLog.count({ where }),
    ]);

    return toPage(
      rows.map((row) => this.toQueueRow(row, now)),
      total,
      input,
    );
  }

  /** Dashboard tiles — counts only, so the poll stays cheap. */
  async getQueueCounts(user: TrpcUser) {
    const now = new Date();
    const resourceWhere = await this.scope.resourceScope(user);

    const [
      toPrepare,
      toHandover,
      onLoan,
      overdue,
      toInspect,
      extensionsToInspect,
    ] = await this.prisma.$transaction([
      this.prisma.reservations.count({
        where: {
          ApproveStatus: 'Approved',
          UsageLogs: { none: {} },
          Resource: resourceWhere,
        },
      }),
      this.prisma.usageLog.count({
        where: { CurrentStatus: 'Prepared', Resource: resourceWhere },
      }),
      this.prisma.usageLog.count({
        where: { CurrentStatus: 'Lended', Resource: resourceWhere },
      }),
      this.prisma.usageLog.count({
        where: {
          CurrentStatus: 'Lended',
          DueTime: { lt: now },
          Resource: resourceWhere,
        },
      }),
      this.prisma.usageLog.count({
        where: { CurrentStatus: 'Returned', Resource: resourceWhere },
      }),
      this.prisma.extensionRequest.count({
        where: {
          ApproveStatus: 'Pending',
          Usage: { Resource: resourceWhere },
          NOT: {
            Usage: {
              Resource: {
                BorrowRuleInfo: {
                  RuleName: { equals: 'T2', mode: 'insensitive' },
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      toPrepare,
      toHandover,
      onLoan,
      overdue,
      toInspect,
      extensionsToInspect,
    };
  }

  async getLoanById(user: TrpcUser, usageKey: number) {
    const usage = await this.readUsage(usageKey);
    await this.scope.assertResourceInScope(user, usage.Resource.ResourceKey);
    return this.toLoan(usage, new Date());
  }

  // =========================================================================
  // Preparing and handing over
  // =========================================================================

  /**
   * Sets a unit aside for an approved request and opens the UsageLog.
   *
   * The UsageLog is created here rather than at pickup because the schema needs
   * a CheckoutCondition to create one at all, and the condition staff record
   * while preparing is precisely the baseline the return is measured against.
   * The row starts in `Prepared`, which keeps the unit off everyone else's
   * catalogue without claiming the borrower has it.
   */
  async allocate(user: TrpcUser, input: AllocateLoanInput) {
    const reservation = await this.prisma.reservations.findUnique({
      where: { ReservationKey: input.reservationKey },
      select: {
        ReservationKey: true,
        ReservedBy: true,
        ApproveStatus: true,
        StartTime: true,
        EndTime: true,
        Resource: { select: RESOURCE_SELECT },
        UsageLogs: { take: 1, select: { UsageKey: true } },
      },
    });

    if (!reservation) {
      throw new BusinessError('RESERVATION_NOT_FOUND', {
        reservationKey: input.reservationKey,
      });
    }
    await this.scope.assertResourceInScope(
      user,
      reservation.Resource.ResourceKey,
    );

    if (reservation.ApproveStatus !== 'Approved') {
      // Preparing a request the supervisor has not cleared would put a T2
      // oscilloscope on the counter before anybody agreed it should be lent.
      throw new BusinessError('NOT_APPROVED_YET', {
        reservationKey: input.reservationKey,
        status: reservation.ApproveStatus,
      });
    }
    if (reservation.UsageLogs.length > 0) {
      throw new BusinessError('WRONG_LOAN_STATE', {
        reservationKey: input.reservationKey,
        usageKey: reservation.UsageLogs[0].UsageKey,
        expected: 'not yet prepared',
      });
    }

    const target =
      input.resourceKey === undefined ||
      input.resourceKey === reservation.Resource.ResourceKey
        ? reservation.Resource
        : await this.resolveSwapTarget(
            user,
            reservation.Resource,
            input.resourceKey,
          );

    await this.assertUnitFree(target.ResourceKey);

    const usageKey = await this.prisma.$transaction(async (tx) => {
      const condition = await tx.conditionLog.create({
        data: {
          ResourceKey: target.ResourceKey,
          LoggedBy: user.accountKey,
          Condition: input.condition,
          Notes: input.note ?? null,
          LoggedAt: new Date(),
        },
        select: { ConditionKey: true },
      });

      const usage = await tx.usageLog.create({
        data: {
          ReservationKey: reservation.ReservationKey,
          AccountKey: reservation.ReservedBy,
          ResourceKey: target.ResourceKey,
          CurrentStatus: 'Prepared',
          DueTime: reservation.EndTime,
          // The agreed collection time, overwritten with the real one at pickup.
          // The column is not nullable, so it cannot simply be left empty.
          CheckoutTime: reservation.StartTime,
          CheckoutCondition: condition.ConditionKey,
        },
        select: { UsageKey: true },
      });

      await tx.resourceInfo.update({
        where: { ResourceKey: target.ResourceKey },
        data: { ConditionKey: condition.ConditionKey },
      });

      if (target.ResourceKey !== reservation.Resource.ResourceKey) {
        // Point the reservation at what the borrower will actually receive, so
        // their own view of the request matches the label on the box.
        await tx.reservations.update({
          where: { ReservationKey: reservation.ReservationKey },
          data: { ResourceKey: target.ResourceKey },
        });
      }

      return usage.UsageKey;
    });

    return this.toLoan(await this.readUsage(usageKey), new Date());
  }

  /**
   * Swaps the prepared unit for another of the same type.
   *
   * T1 only: the proposal lets a borrower ask for a different unit at the
   * counter for that tier alone ("ผู้ยืมสามารถขอเปลี่ยนอุปกรณ์ได้ตอนรับ (เฉพาะ T1)"),
   * because a T2 request named its serial and a supervisor approved that serial.
   */
  async swapUnit(user: TrpcUser, input: SwapUnitInput) {
    const usage = await this.readUsage(input.usageKey);
    await this.scope.assertResourceInScope(user, usage.Resource.ResourceKey);
    this.assertState(usage, ['Prepared']);

    const tier = tryMapTier(usage.Resource.BorrowRuleInfo.RuleName);
    if (tier !== 'T1') {
      throw new BusinessError('UNIT_SWAP_NOT_ALLOWED', {
        usageKey: input.usageKey,
        tier,
      });
    }

    const target = await this.resolveSwapTarget(
      user,
      usage.Resource,
      input.resourceKey,
    );
    await this.assertUnitFree(target.ResourceKey);

    await this.prisma.$transaction(async (tx) => {
      const condition = await tx.conditionLog.create({
        data: {
          ResourceKey: target.ResourceKey,
          LoggedBy: user.accountKey,
          // Carry the baseline over from the unit being replaced rather than
          // assuming Normal: the swap is about the borrower's preference, not
          // a fresh assessment.
          Condition: usage.CheckoutConditionLog.Condition,
          Notes: input.reason ?? null,
          LoggedAt: new Date(),
        },
        select: { ConditionKey: true },
      });

      await tx.usageLog.update({
        where: { UsageKey: input.usageKey },
        data: {
          ResourceKey: target.ResourceKey,
          CheckoutCondition: condition.ConditionKey,
        },
      });

      await tx.resourceInfo.update({
        where: { ResourceKey: target.ResourceKey },
        data: { ConditionKey: condition.ConditionKey },
      });

      if (usage.ReservationKey !== null) {
        await tx.reservations.update({
          where: { ReservationKey: usage.ReservationKey },
          data: { ResourceKey: target.ResourceKey },
        });
      }
    });

    return this.toLoan(await this.readUsage(input.usageKey), new Date());
  }

  /** The borrower walks off with it (§5.9 "ส่งมอบ"). */
  async confirmPickup(user: TrpcUser, input: ConfirmPickupInput) {
    const usage = await this.readUsage(input.usageKey);
    await this.scope.assertResourceInScope(user, usage.Resource.ResourceKey);
    this.assertState(usage, ['Prepared']);

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.usageLog.update({
        where: { UsageKey: input.usageKey },
        data: {
          CurrentStatus: 'Lended',
          // Overwrite the planned collection time with the real one: the late
          // calculation reads DueTime, but any question about "when did this
          // actually leave" has to be answerable from the row itself.
          CheckoutTime: now,
        },
      });

      await tx.resourceInfo.update({
        where: { ResourceKey: usage.Resource.ResourceKey },
        data: { ResourceStatus: 'Lended' },
      });

      if (input.note) {
        await tx.conditionLog.create({
          data: {
            ResourceKey: usage.Resource.ResourceKey,
            LoggedBy: user.accountKey,
            Condition: usage.CheckoutConditionLog.Condition,
            Notes: input.note,
            LoggedAt: now,
          },
        });
      }
    });

    return this.toLoan(await this.readUsage(input.usageKey), now);
  }

  /**
   * The thing comes back (§5.9 "รับคืน", grading deferred to `inspection.create`).
   *
   * Applies the late penalty and nothing else. Lateness is decided by the clock,
   * so settling it now means a busy counter can take the item, free the
   * borrower, and grade the damage later without the penalty drifting by a day
   * in the meantime.
   */
  async recordReturn(user: TrpcUser, input: RecordReturnInput) {
    const usage = await this.readUsage(input.usageKey);
    await this.scope.assertResourceInScope(user, usage.Resource.ResourceKey);
    this.assertState(usage, ['Lended']);

    const now = new Date();
    const overdueDays = this.penalties.overdueDays(usage.DueTime, now);
    const quote = await this.penalties.quoteLate(
      usage.Resource.BorrowRule,
      this.creditWeightOf(usage.Resource),
      overdueDays,
    );

    const penaltyKey = await this.prisma.$transaction(async (tx) => {
      await tx.usageLog.update({
        where: { UsageKey: input.usageKey },
        data: { CurrentStatus: 'Returned', CheckInTime: now },
      });

      // Back on the shelf, but still not available: UNAVAILABLE_USAGE_STATES
      // includes `Returned`, so nothing can be lent out again before it is
      // graded.
      await tx.resourceInfo.update({
        where: { ResourceKey: usage.Resource.ResourceKey },
        data: { ResourceStatus: 'InStorage' },
      });

      if (input.note) {
        await tx.conditionLog.create({
          data: {
            ResourceKey: usage.Resource.ResourceKey,
            LoggedBy: user.accountKey,
            Condition: usage.CheckoutConditionLog.Condition,
            Notes: input.note,
            LoggedAt: now,
          },
        });
      }

      return this.penalties.apply(tx, quote, {
        accountKey: usage.Account.AccountKey,
        usageKey: usage.UsageKey,
        // The proposal starts the penalty's clock at the return, not at the
        // deadline: "จะเริ่มนับอายุของบทลงโทษเมื่อนำอุปกรณ์มาคืนแล้ว".
        effectiveFrom: now,
      });
    });

    const loan = this.toLoan(await this.readUsage(input.usageKey), now);

    if (penaltyKey === null) {
      return { loan, latePenalty: null };
    }

    const penalty = await this.prisma.penaltyInfo.findUniqueOrThrow({
      where: { PenaltyKey: penaltyKey },
      select: { PenaltyKey: true, CreditDeducted: true, ExpirationTime: true },
    });

    return {
      loan,
      latePenalty: {
        penaltyKey: penalty.PenaltyKey,
        creditDeducted: penalty.CreditDeducted ?? quote.amount,
        overdueDays,
        expiresAt: toIso(penalty.ExpirationTime),
      },
    };
  }

  /**
   * Writes a unit off (§5.7).
   *
   * Closes the UsageLog as `Inspected` with a Missing check-in condition. There
   * is no `Lost` state in the enum and adding one would change the schema, so
   * this is the encoding: the loan is settled, and the resource — not the loan
   * — carries the fact that the thing is gone. Whoever reverses this when the
   * item turns up looks for exactly that pair.
   */
  async markLost(user: TrpcUser, input: MarkLostInput) {
    const usage = await this.readUsage(input.usageKey);
    await this.scope.assertResourceInScope(user, usage.Resource.ResourceKey);
    this.assertState(usage, ['Lended']);

    const now = new Date();
    const overdueDays = this.penalties.overdueDays(usage.DueTime, now);

    if (!input.reportedByBorrower && overdueDays < LOST_AFTER_OVERDUE_DAYS) {
      throw new BusinessError('NOT_YET_LOST', {
        usageKey: input.usageKey,
        overdueDays,
        requiredDays: LOST_AFTER_OVERDUE_DAYS,
      });
    }

    const quote = await this.penalties.quoteLost(
      usage.Resource.BorrowRule,
      this.creditWeightOf(usage.Resource),
      overdueDays,
    );

    await this.prisma.$transaction(async (tx) => {
      const condition = await tx.conditionLog.create({
        data: {
          ResourceKey: usage.Resource.ResourceKey,
          LoggedBy: user.accountKey,
          Condition: 'Missing',
          Notes: input.reason ?? null,
          LoggedAt: now,
        },
        select: { ConditionKey: true },
      });

      await tx.usageLog.update({
        where: { UsageKey: input.usageKey },
        data: {
          CurrentStatus: 'Inspected',
          CheckInTime: now,
          CheckInCondition: condition.ConditionKey,
        },
      });

      await tx.resourceInfo.update({
        where: { ResourceKey: usage.Resource.ResourceKey },
        data: {
          ResourceStatus: 'Missing',
          ConditionKey: condition.ConditionKey,
          AllowBorrow: false,
        },
      });

      await this.penalties.apply(tx, quote, {
        accountKey: usage.Account.AccountKey,
        usageKey: usage.UsageKey,
        effectiveFrom: now,
        note: input.reportedByBorrower ? 'reported by borrower' : undefined,
      });
    });

    return this.toLoan(await this.readUsage(input.usageKey), now);
  }

  // =========================================================================
  // Extensions settled at the counter
  // =========================================================================

  async listExtensionReviews(
    user: TrpcUser,
    input: { page: number; pageSize: number },
  ) {
    const resourceWhere = await this.scope.resourceScope(user);

    const where: Prisma.ExtensionRequestWhereInput = {
      ApproveStatus: 'Pending',
      Usage: { Resource: resourceWhere },
      // T2 extensions belong to the supervisor queue (§5.4). Filtering them out
      // here rather than refusing later keeps staff from seeing work that is
      // not theirs to do.
      NOT: {
        Usage: {
          Resource: {
            BorrowRuleInfo: { RuleName: { equals: 'T2', mode: 'insensitive' } },
          },
        },
      },
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.extensionRequest.findMany({
        where,
        orderBy: { RequestedAt: 'asc' },
        ...toSkipTake(input),
        select: {
          ExtensionKey: true,
          UsageKey: true,
          ExtendNo: true,
          PreviousDueTime: true,
          RequestedDueTime: true,
          RequestedAt: true,
          ApproveStatus: true,
          RequestedByUser: { select: BORROWER_SELECT },
          Usage: { select: { Resource: { select: RESOURCE_SELECT } } },
        },
      }),
      this.prisma.extensionRequest.count({ where }),
    ]);

    const items = rows.map((row) => ({
      extensionKey: row.ExtensionKey,
      usageKey: row.UsageKey,
      borrower: this.toBorrower(row.RequestedByUser),
      itemName: this.nameOf(row.Usage.Resource),
      serialNo: row.Usage.Resource.Item?.ItemID ?? null,
      tier: tryMapTier(row.Usage.Resource.BorrowRuleInfo.RuleName),
      extendNo: row.ExtendNo,
      previousDueAt: toIso(row.PreviousDueTime),
      requestedDueAt: toIso(row.RequestedDueTime),
      requestedAt: toIso(row.RequestedAt),
      status: row.ApproveStatus,
    }));

    return toPage(items, total, input);
  }

  /**
   * Settles an extension the borrower had to bring the item in for (§5.9
   * "ต่ออายุแบบตรวจสภาพ").
   *
   * Approving writes the condition found on the counter — that check is the
   * whole reason this extension is not an online one — and moves the due date.
   */
  async decideExtension(user: TrpcUser, input: DecideExtensionInput) {
    const request = await this.prisma.extensionRequest.findUnique({
      where: { ExtensionKey: input.extensionKey },
      select: {
        ExtensionKey: true,
        UsageKey: true,
        ApproveStatus: true,
        RequestedDueTime: true,
        ResolvedAt: true,
        Usage: {
          select: { UsageKey: true, Resource: { select: RESOURCE_SELECT } },
        },
      },
    });

    if (!request) {
      throw new BusinessError('EXTENSION_NOT_FOUND', {
        extensionKey: input.extensionKey,
      });
    }
    await this.scope.assertResourceInScope(
      user,
      request.Usage.Resource.ResourceKey,
    );

    if (request.ApproveStatus !== 'Pending') {
      throw new BusinessError('ALREADY_DECIDED', {
        extensionKey: input.extensionKey,
        decidedAt: toIsoNullable(request.ResolvedAt),
        status: request.ApproveStatus,
      });
    }

    const tier = tryMapTier(request.Usage.Resource.BorrowRuleInfo.RuleName);
    if (tier === 'T2') {
      throw new BusinessError('EXTENSION_NEEDS_SUPERVISOR', {
        extensionKey: input.extensionKey,
        tier,
      });
    }

    const now = new Date();
    const approved = input.decision === 'approve';

    await this.prisma.$transaction(async (tx) => {
      const condition = await tx.conditionLog.create({
        data: {
          ResourceKey: request.Usage.Resource.ResourceKey,
          LoggedBy: user.accountKey,
          Condition: input.condition,
          Notes: input.note ?? null,
          LoggedAt: now,
        },
        select: { ConditionKey: true },
      });

      await tx.resourceInfo.update({
        where: { ResourceKey: request.Usage.Resource.ResourceKey },
        data: { ConditionKey: condition.ConditionKey },
      });

      await tx.extensionRequest.update({
        where: { ExtensionKey: input.extensionKey },
        data: {
          ApproveStatus: approved ? 'Approved' : 'Rejected',
          ApprovedBy: user.accountKey,
          ResolvedAt: now,
        },
      });

      await tx.usageLog.update({
        where: { UsageKey: request.UsageKey },
        data: {
          // Clear the pointer either way: the request is settled, so nothing is
          // pending on this loan any more.
          PendingExtension: null,
          ...(approved ? { DueTime: request.RequestedDueTime } : {}),
        },
      });
    });

    return this.toLoan(await this.readUsage(request.UsageKey), now);
  }

  // =========================================================================
  // Internals
  // =========================================================================

  private async listToPrepare(
    resourceWhere: Prisma.ResourceInfoWhereInput,
    input: ListStaffQueueInput,
  ) {
    const where: Prisma.ReservationsWhereInput = {
      ApproveStatus: 'Approved',
      // No UsageLog yet is exactly what "not prepared" means — there is no flag
      // on the reservation that says so.
      UsageLogs: { none: {} },
      Resource: resourceWhere,
    };

    if (input.q) {
      where.OR = [
        {
          ReservedByUser: {
            UserID: { contains: input.q, mode: 'insensitive' },
          },
        },
        {
          ReservedByUser: {
            UserFName: { contains: input.q, mode: 'insensitive' },
          },
        },
        {
          ReservedByUser: {
            UserLName: { contains: input.q, mode: 'insensitive' },
          },
        },
        {
          Resource: {
            Item: {
              Item: { ItemName: { contains: input.q, mode: 'insensitive' } },
            },
          },
        },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.reservations.findMany({
        where,
        orderBy: { StartTime: 'asc' },
        ...toSkipTake(input),
        select: {
          ReservationKey: true,
          StartTime: true,
          EndTime: true,
          ReservedByUser: { select: BORROWER_SELECT },
          Resource: { select: RESOURCE_SELECT },
        },
      }),
      this.prisma.reservations.count({ where }),
    ]);

    const items = rows.map((row) => ({
      usageKey: null,
      reservationKey: row.ReservationKey,
      status: null,
      borrower: this.toBorrower(row.ReservedByUser),
      itemName: this.nameOf(row.Resource),
      // The reservation already points at a unit, but staff have not confirmed
      // it yet — the serial is shown as a suggestion by `item.listManagedUnits`, not
      // as a fact about this request.
      serialNo: null,
      resourceKey: row.Resource.ResourceKey,
      tier: tryMapTier(row.Resource.BorrowRuleInfo.RuleName),
      prepDays: row.Resource.BufferTime,
      pickupAt: toIso(row.StartTime),
      dueAt: toIso(row.EndTime),
      overdueDays: 0,
      lostEligible: false,
    }));

    return toPage(items, total, input);
  }

  private searchClauses(q: string): Prisma.UsageLogWhereInput[] {
    return [
      { Account: { UserID: { contains: q, mode: 'insensitive' } } },
      { Account: { UserFName: { contains: q, mode: 'insensitive' } } },
      { Account: { UserLName: { contains: q, mode: 'insensitive' } } },
      { Resource: { Item: { ItemID: { contains: q, mode: 'insensitive' } } } },
      {
        Resource: {
          Item: { Item: { ItemName: { contains: q, mode: 'insensitive' } } },
        },
      },
      {
        Resource: { Room: { RoomName: { contains: q, mode: 'insensitive' } } },
      },
    ];
  }

  private async resourceWhereForScope(
    user: TrpcUser,
    tier?: ResourceTier,
  ): Promise<Prisma.ResourceInfoWhereInput> {
    const where: Prisma.ResourceInfoWhereInput =
      await this.scope.resourceScope(user);
    if (tier) {
      where.BorrowRuleInfo = {
        RuleName: { equals: tier, mode: 'insensitive' },
      };
    }
    return where;
  }

  private async readUsage(usageKey: number): Promise<UsageRow> {
    const usage = await this.prisma.usageLog.findUnique({
      where: { UsageKey: usageKey },
      select: USAGE_SELECT,
    });
    if (!usage) {
      throw new BusinessError('LOAN_NOT_FOUND', { usageKey });
    }
    return usage;
  }

  /**
   * Refuses to move a loan from any state but the expected one.
   *
   * The counter is the one place where the same button gets pressed twice, and
   * `cause` names both states so the frontend can say which — "already handed
   * over" and "not prepared yet" are different mistakes.
   */
  private assertState(
    usage: UsageRow,
    expected: UsageRow['CurrentStatus'][],
  ): void {
    if (!expected.includes(usage.CurrentStatus)) {
      throw new BusinessError('WRONG_LOAN_STATE', {
        usageKey: usage.UsageKey,
        actual: usage.CurrentStatus,
        expected,
      });
    }
  }

  /** The candidate must be a real unit of the same type, in the caller's scope. */
  private async resolveSwapTarget(
    user: TrpcUser,
    current: ResourceRow,
    resourceKey: number,
  ): Promise<ResourceRow> {
    await this.scope.assertResourceInScope(user, resourceKey);

    const target = await this.prisma.resourceInfo.findUnique({
      where: { ResourceKey: resourceKey },
      select: RESOURCE_SELECT,
    });
    if (!target) {
      throw new BusinessError('RESOURCE_NOT_FOUND', { resourceKey });
    }

    // Same type, not just same department: swapping an Arduino for an
    // oscilloscope would satisfy every other check here.
    if (
      !target.Item ||
      !current.Item ||
      target.Item.ItemKey !== current.Item.ItemKey
    ) {
      throw new BusinessError('UNIT_DOES_NOT_MATCH_REQUEST', {
        resourceKey,
        expectedItemKey: current.Item?.ItemKey ?? null,
        actualItemKey: target.Item?.ItemKey ?? null,
      });
    }

    return target;
  }

  /** On the shelf, offered, and not already promised to somebody. */
  private async assertUnitFree(resourceKey: number): Promise<void> {
    const resource = await this.prisma.resourceInfo.findUniqueOrThrow({
      where: { ResourceKey: resourceKey },
      select: {
        ResourceStatus: true,
        AllowBorrow: true,
        UsageLogs: {
          where: { CurrentStatus: { in: UNAVAILABLE_USAGE_STATES } },
          take: 1,
          select: { UsageKey: true, CurrentStatus: true },
        },
      },
    });

    const blocking = resource.UsageLogs[0];
    if (
      resource.ResourceStatus !== 'InStorage' ||
      !resource.AllowBorrow ||
      blocking
    ) {
      throw new BusinessError('ITEM_UNAVAILABLE', {
        resourceKey,
        status: resource.ResourceStatus,
        lendable: resource.AllowBorrow,
        blockedBy: blocking?.UsageKey ?? null,
        nextAvailableAt: null,
      });
    }
  }

  /** ItemInfo or RoomInfo, whichever this resource is. */
  private creditWeightOf(resource: ResourceRow): number {
    return resource.Item?.Item.CreditWeight ?? resource.Room?.CreditWeight ?? 0;
  }

  private nameOf(resource: ResourceRow): string | null {
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

  private toQueueRow(usage: UsageRow, now: Date) {
    const overdueDays = daysBetween(usage.DueTime, now);

    return {
      usageKey: usage.UsageKey,
      reservationKey: usage.ReservationKey,
      status: usage.CurrentStatus,
      borrower: this.toBorrower(usage.Account),
      itemName: this.nameOf(usage.Resource),
      serialNo: usage.Resource.Item?.ItemID ?? null,
      resourceKey: usage.Resource.ResourceKey,
      tier: tryMapTier(usage.Resource.BorrowRuleInfo.RuleName),
      prepDays: usage.Resource.BufferTime,
      pickupAt: toIso(usage.CheckoutTime),
      dueAt: toIso(usage.DueTime),
      overdueDays,
      lostEligible: overdueDays >= LOST_AFTER_OVERDUE_DAYS,
    };
  }

  private toLoan(usage: UsageRow, now: Date) {
    return {
      usageKey: usage.UsageKey,
      reservationKey: usage.ReservationKey,
      status: usage.CurrentStatus,
      borrower: this.toBorrower(usage.Account),
      itemName: this.nameOf(usage.Resource),
      serialNo: usage.Resource.Item?.ItemID ?? null,
      resourceKey: usage.Resource.ResourceKey,
      tier: tryMapTier(usage.Resource.BorrowRuleInfo.RuleName),
      checkoutCondition: usage.CheckoutConditionLog.Condition,
      checkoutConditionNote: usage.CheckoutConditionLog.Notes,
      checkinCondition: usage.CheckInConditionLog?.Condition ?? null,
      checkoutAt: toIso(usage.CheckoutTime),
      dueAt: toIso(usage.DueTime),
      returnedAt: toIsoNullable(usage.CheckInTime),
      // Measured against the return when there is one, so a settled loan stops
      // accruing days the moment it comes back.
      overdueDays: daysBetween(usage.DueTime, usage.CheckInTime ?? now),
      pendingExtensionKey: usage.PendingExtension,
    };
  }
}
