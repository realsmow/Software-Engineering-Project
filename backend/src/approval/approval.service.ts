import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { StaffScopeService } from '../common/authority/staff-scope.service';
import { CreditTierService } from '../common/credit/credit-tier.service';
import {
  canDecide,
  routeFor,
  type ApprovalRoute,
} from '../common/approval/approval-policy';
import {
  clashingWindowFilter,
  withBuffer,
} from '../common/booking/booking-window';
import { BusinessError } from '../common/errors/business-error';
import { addDays, daysBetween, toIso } from '../common/schemas/datetime.schema';
import { toPage, toSkipTake } from '../common/schemas/pagination.schema';
import { tryMapTier, type CreditTier } from '../common/schemas/status.schema';
import { LoanRequestService } from '../loan/loan.request.service';
import {
  NotificationService,
  resourceName,
} from '../notification/notification.service';
import type { TrpcUser } from '../trpc/context';
import type {
  DecideApprovalInput,
  ListApprovalQueueInput,
} from './approval.schema';

/** Matches COLLECT_WITHIN_DAYS in loan.request.service.ts (§5.9). */
const COLLECT_WITHIN_DAYS = 1;

const BORROWER_SELECT = {
  AccountKey: true,
  UserID: true,
  UserFName: true,
  UserLName: true,
  UserCredit: true,
} as const;

const QUEUE_SELECT = {
  ReservationKey: true,
  ReservedBy: true,
  Reason: true,
  StartTime: true,
  EndTime: true,
  ActionTime: true,
  ApproveStatus: true,
  ReservedByUser: { select: BORROWER_SELECT },
  Resource: {
    select: {
      ResourceKey: true,
      ManagedBy: true,
      BufferTime: true,
      BorrowRuleInfo: { select: { RuleName: true } },
      Item: { select: { ItemID: true, Item: { select: { ItemName: true } } } },
      Room: { select: { RoomName: true } },
    },
  },
} satisfies Prisma.ReservationsSelect;

type QueueRow = Prisma.ReservationsGetPayload<{ select: typeof QUEUE_SELECT }>;

/**
 * Deciding requests (proposal §5.4).
 *
 * Two rules make this more than an UPDATE:
 *
 *   1. The desk is not the same for every request. `approval-policy.ts` routes
 *      by tier and by the borrower's credit band, and a staff member may not
 *      clear what belongs to a supervisor.
 *   2. Approving one request cancels its rivals. A unit can only be in one
 *      place, so the moment one booking is confirmed every other pending
 *      request whose window touches it - buffer included - is refused, in the
 *      same transaction. Leaving them Pending would let a second approval hand
 *      the same unit out twice.
 */
@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: StaffScopeService,
    private readonly creditTiers: CreditTierService,
    private readonly requests: LoanRequestService,
    private readonly notifications: NotificationService,
  ) {}

  // =========================================================================
  // The queue
  // =========================================================================

  async listQueue(user: TrpcUser, input: ListApprovalQueueInput) {
    const rows = await this.prisma.reservations.findMany({
      where: {
        ApproveStatus: 'Pending',
        Resource: await this.scope.resourceScope(user),
        ...(input.q
          ? {
              ReservedByUser: {
                OR: [
                  { UserID: { contains: input.q, mode: 'insensitive' } },
                  { UserFName: { contains: input.q, mode: 'insensitive' } },
                  { UserLName: { contains: input.q, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      // Oldest first: a queue that shows the newest request at the top is a
      // queue where the oldest is never reached.
      orderBy: { ActionTime: 'asc' },
      select: QUEUE_SELECT,
    });

    const toBand = await this.creditTiers.tierMapper();
    const decidable = rows
      .map((row) => ({ row, route: this.routeOf(row, toBand) }))
      .filter(({ route }) => canDecide(route, this.deciderRole(user)))
      .filter(({ route }) => input.route === undefined || route === input.route)
      .filter(
        ({ row }) =>
          input.tier === undefined ||
          tryMapTier(row.Resource.BorrowRuleInfo.RuleName) === input.tier,
      );

    const { skip, take } = toSkipTake(input);
    const page = decidable.slice(skip, skip + take);

    const rendered = await Promise.all(
      page.map(({ row, route }) => this.toQueueRow(row, route, toBand)),
    );
    return toPage(rendered, decidable.length, input);
  }

  /** The dashboard figures. Polled, so it counts rather than reads rows. */
  async counts(user: TrpcUser) {
    const scope = await this.scope.resourceScope(user);
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);

    const [pending, autoApprovedToday] = await this.prisma.$transaction([
      this.prisma.reservations.findMany({
        where: { ApproveStatus: 'Pending', Resource: scope },
        select: {
          StartTime: true,
          ReservedByUser: { select: { UserCredit: true } },
          Resource: {
            select: { BorrowRuleInfo: { select: { RuleName: true } } },
          },
        },
      }),
      this.prisma.reservations.count({
        where: {
          AutoApproved: true,
          ApprovedAt: { gte: startOfToday },
          Resource: scope,
        },
      }),
    ]);

    const toBand = await this.creditTiers.tierMapper();
    let staff = 0;
    let supervisor = 0;
    let overdueToDecide = 0;
    for (const row of pending) {
      const route = routeFor({
        tier: tryMapTier(row.Resource.BorrowRuleInfo.RuleName),
        creditTier: toBand(row.ReservedByUser.UserCredit),
      });
      if (route === 'supervisor') supervisor += 1;
      else staff += 1;
      // Nobody decided in time and the borrower's window has already opened.
      if (row.StartTime < now) overdueToDecide += 1;
    }

    return {
      staff,
      supervisor,
      overdueToDecide,
      autoApprovedToday,
      asOf: toIso(now),
    };
  }

  // =========================================================================
  // Deciding
  // =========================================================================

  async decide(user: TrpcUser, input: DecideApprovalInput) {
    const row = await this.prisma.reservations.findUnique({
      where: { ReservationKey: input.reservationKey },
      select: { ...QUEUE_SELECT, AutoApproved: true, ResolvedAt: true },
    });
    if (!row) {
      throw new BusinessError('RESERVATION_NOT_FOUND', {
        reservationKey: input.reservationKey,
      });
    }
    await this.scope.assertResourceInScope(user, row.Resource.ResourceKey);

    if (row.ReservedBy === user.accountKey) {
      // §5.9. Staff and supervisors borrow equipment too, and the one thing
      // they may not do is sign their own request.
      throw new BusinessError('CANNOT_APPROVE_OWN_REQUEST', {
        reservationKey: input.reservationKey,
      });
    }
    if (row.ApproveStatus !== 'Pending') {
      throw new BusinessError(
        row.AutoApproved ? 'ALREADY_AUTO_APPROVED' : 'ALREADY_DECIDED',
        {
          reservationKey: input.reservationKey,
          status: row.ApproveStatus,
          decidedAt: row.ResolvedAt ? toIso(row.ResolvedAt) : null,
        },
      );
    }

    const toBand = await this.creditTiers.tierMapper();
    const route = this.routeOf(row, toBand);
    if (!canDecide(route, this.deciderRole(user))) {
      throw new BusinessError('APPROVAL_NEEDS_SUPERVISOR', {
        reservationKey: input.reservationKey,
        route,
        tier: tryMapTier(row.Resource.BorrowRuleInfo.RuleName),
      });
    }

    const now = new Date();

    if (input.decision === 'reject') {
      // In a transaction only so the borrower's notification cannot outlive a
      // rejection that failed to write. "คำขอถูกปฏิเสธ" for a request still
      // sitting in the queue is worse than no notification.
      await this.prisma.$transaction(async (tx) => {
        await tx.reservations.update({
          where: { ReservationKey: input.reservationKey },
          data: {
            ApproveStatus: 'Rejected',
            ApprovedBy: user.accountKey,
            ApprovedAt: now,
            ResolvedAt: now,
            Reason: input.reason ?? row.Reason,
          },
        });

        await this.notifications.requestRejected(tx, {
          accountKey: row.ReservedBy,
          reservationKey: input.reservationKey,
          itemName: resourceName(row.Resource),
          reason: input.reason,
        });
      });

      return {
        request: await this.requests.getAsDecider(input.reservationKey),
        cancelled: [],
      };
    }

    // Approving. Everything below happens together or not at all: a unit
    // promised to two people is the one outcome this desk cannot undo.
    const { from, to } = withBuffer(
      row.StartTime,
      row.EndTime,
      row.Resource.BufferTime,
    );

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const clashes = await tx.reservations.findMany({
        where: {
          ...clashingWindowFilter(
            row.Resource.ResourceKey,
            from,
            to,
            row.ReservationKey,
          ),
          // Only the undecided ones. An already-approved clash means somebody
          // approved two overlapping requests, which the check below refuses.
          ApproveStatus: 'Pending',
        },
        select: {
          ReservationKey: true,
          StartTime: true,
          EndTime: true,
          ReservedByUser: { select: BORROWER_SELECT },
        },
      });

      const alreadyApproved = await tx.reservations.count({
        where: {
          ...clashingWindowFilter(
            row.Resource.ResourceKey,
            from,
            to,
            row.ReservationKey,
          ),
          ApproveStatus: 'Approved',
        },
      });
      if (alreadyApproved > 0) {
        // Someone else got there first while this decision was being made.
        throw new BusinessError('WINDOW_NOT_AVAILABLE', {
          resourceKey: row.Resource.ResourceKey,
          reservationKey: row.ReservationKey,
        });
      }

      // The clock on collecting it starts now, not when it was asked for.
      const collectBy = addDays(now, COLLECT_WITHIN_DAYS);

      await tx.reservations.update({
        where: { ReservationKey: row.ReservationKey },
        data: {
          ApproveStatus: 'Approved',
          ApprovedBy: user.accountKey,
          AutoApproved: false,
          ApprovedAt: now,
          ResolvedAt: now,
          ReservationExpiration: collectBy,
        },
      });

      const itemName = resourceName(row.Resource);

      await this.notifications.requestApproved(tx, {
        accountKey: row.ReservedBy,
        reservationKey: row.ReservationKey,
        itemName,
        collectBy,
      });

      if (clashes.length > 0) {
        await tx.reservations.updateMany({
          where: {
            ReservationKey: { in: clashes.map((c) => c.ReservationKey) },
          },
          data: {
            ApproveStatus: 'Canceled',
            ResolvedAt: now,
          },
        });

        // The losers find out here or not at all. Their request is gone from
        // the queue and nothing else in the system will ever mention it again,
        // so silence would leave them waiting on a decision already made.
        for (const clash of clashes) {
          await this.notifications.requestRejected(tx, {
            accountKey: clash.ReservedByUser.AccountKey,
            reservationKey: clash.ReservationKey,
            itemName,
            reason: 'อุปกรณ์ถูกจองในช่วงเวลาที่ทับซ้อนกันแล้ว',
          });
        }
      }

      return clashes;
    });

    return {
      request: await this.requests.getAsDecider(input.reservationKey),
      cancelled: cancelled.map((c) => ({
        reservationKey: c.ReservationKey,
        borrower: this.toBorrower(c.ReservedByUser),
        startTime: toIso(c.StartTime),
        endTime: toIso(c.EndTime),
      })),
    };
  }

  // =========================================================================
  // Internals
  // =========================================================================

  /**
   * The role the caller decides with.
   *
   * `StaffMiddleware` already refused anyone below staff, so the only question
   * left is whether they carry a supervisor's signature.
   */
  private deciderRole(user: TrpcUser): 'staff' | 'supervisor' | 'admin' {
    return user.role === 'admin' || user.role === 'supervisor'
      ? user.role
      : 'staff';
  }

  private routeOf(
    row: Pick<QueueRow, 'Resource' | 'ReservedByUser'>,
    toBand: (creditScore: number) => CreditTier,
  ): ApprovalRoute {
    return routeFor({
      tier: tryMapTier(row.Resource.BorrowRuleInfo.RuleName),
      creditTier: toBand(row.ReservedByUser.UserCredit),
    });
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
      userId: row.UserID,
      fullName: `${row.UserFName} ${row.UserLName}`.trim(),
      creditScore: row.UserCredit,
    };
  }

  private async toQueueRow(
    row: QueueRow,
    route: ApprovalRoute,
    toBand: (creditScore: number) => CreditTier,
  ) {
    const { from, to } = withBuffer(
      row.StartTime,
      row.EndTime,
      row.Resource.BufferTime,
    );
    const clashes = await this.prisma.reservations.findMany({
      where: {
        ...clashingWindowFilter(
          row.Resource.ResourceKey,
          from,
          to,
          row.ReservationKey,
        ),
        ApproveStatus: 'Pending',
      },
      select: {
        ReservationKey: true,
        StartTime: true,
        EndTime: true,
        ReservedByUser: { select: { UserFName: true, UserLName: true } },
      },
    });

    return {
      reservationKey: row.ReservationKey,
      requestedAt: toIso(row.ActionTime),
      borrower: this.toBorrower(row.ReservedByUser),
      creditTier: toBand(row.ReservedByUser.UserCredit),
      route,
      resourceKey: row.Resource.ResourceKey,
      itemName:
        row.Resource.Item?.Item.ItemName ?? row.Resource.Room?.RoomName ?? null,
      serialNo: row.Resource.Item?.ItemID ?? null,
      kind: (row.Resource.Room ? 'room' : 'equipment') as 'equipment' | 'room',
      tier: tryMapTier(row.Resource.BorrowRuleInfo.RuleName),
      startTime: toIso(row.StartTime),
      endTime: toIso(row.EndTime),
      requestedDays: daysBetween(row.StartTime, row.EndTime),
      reason: row.Reason,
      clashesWith: clashes.map((c) => ({
        reservationKey: c.ReservationKey,
        borrowerName:
          `${c.ReservedByUser.UserFName} ${c.ReservedByUser.UserLName}`.trim(),
        startTime: toIso(c.StartTime),
        endTime: toIso(c.EndTime),
      })),
    };
  }
}
