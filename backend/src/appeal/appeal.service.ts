import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { StaffScopeService } from '../common/authority/staff-scope.service';
import { BusinessError } from '../common/errors/business-error';
import {
  addDays,
  toIso,
  toIsoNullable,
} from '../common/schemas/datetime.schema';
import { toPage, toSkipTake } from '../common/schemas/pagination.schema';
import { toBorrowerRef } from '../loan/loan.schema';
import {
  NotificationService,
  resourceName,
} from '../notification/notification.service';
import type { TrpcUser } from '../trpc/context';
import {
  APPEAL_WINDOW_DAYS,
  type AppealStatus,
  type CreateAppealInput,
  type DecideAppealInput,
  type ListAppealsInput,
  type ListMyAppealsInput,
} from './appeal.schema';

const BORROWER_SELECT = {
  AccountKey: true,
  UserID: true,
  UserFName: true,
  UserLName: true,
  UserCredit: true,
} as const;

const PENALTY_SELECT = {
  PenaltyKey: true,
  Reason: true,
  CreditDeducted: true,
  ActionTime: true,
  ExpirationTime: true,
  InEffect: true,
} as const;

const APPEAL_SELECT = {
  AppealKey: true,
  AppealReason: true,
  ApproveStatus: true,
  ActionTime: true,
  ResolvedAt: true,
  FiledBy: true,
  FiledByUser: { select: BORROWER_SELECT },
  ResolvedByUser: { select: BORROWER_SELECT },
  OriginalPenaltyInfo: { select: PENALTY_SELECT },
  NewPenaltyInfo: { select: PENALTY_SELECT },
  // Only the inspector: this is what CANNOT_DECIDE_OWN_INSPECTION compares
  // against, and pulling the whole inspection would drag its condition log and
  // photos into every row of the queue.
  Inspections: { select: { InspectorKey: true } },
} as const;

type AppealRow = Prisma.AppealInfoGetPayload<{ select: typeof APPEAL_SELECT }>;
type PenaltyRow = Prisma.PenaltyInfoGetPayload<{
  select: typeof PENALTY_SELECT;
}>;

/** DB enum -> the contract's string (ว-10). */
function toAppealStatus(status: AppealRow['ApproveStatus']): AppealStatus {
  switch (status) {
    case 'Approved':
      return 'approved';
    case 'Rejected':
      return 'rejected';
    default:
      // `Canceled` shares the column with the borrowing queue but no path in
      // this domain writes it — an appeal is withdrawn by being rejected, not
      // cancelled. Reading it as still-open is the safe direction: it keeps
      // the row in the queue where a person will look at it.
      return 'pending';
  }
}

function toPenaltyOutput(row: PenaltyRow) {
  return {
    penaltyKey: row.PenaltyKey,
    reason: row.Reason,
    creditDeducted: row.CreditDeducted,
    issuedAt: toIsoNullable(row.ActionTime),
    expiresAt: toIso(row.ExpirationTime),
    inEffect: row.InEffect ?? false,
  };
}

function toAppealOutput(row: AppealRow) {
  const original = row.OriginalPenaltyInfo.CreditDeducted ?? 0;
  const replacement = row.NewPenaltyInfo?.CreditDeducted ?? 0;

  return {
    appealKey: row.AppealKey,
    status: toAppealStatus(row.ApproveStatus),
    appealReason: row.AppealReason,
    filedAt: toIsoNullable(row.ActionTime),
    resolvedAt: toIsoNullable(row.ResolvedAt),
    filedBy: toBorrowerRef(row.FiledByUser),
    resolvedBy: row.ResolvedByUser ? toBorrowerRef(row.ResolvedByUser) : null,
    penalty: toPenaltyOutput(row.OriginalPenaltyInfo),
    replacementPenalty: row.NewPenaltyInfo
      ? toPenaltyOutput(row.NewPenaltyInfo)
      : null,
    // Derived rather than stored: the two penalty rows already say it, and a
    // third column holding the difference is a column that can disagree with
    // them.
    creditRestored:
      row.ApproveStatus === 'Approved' ? original - replacement : 0,
    inspectorKeys: [
      ...new Set(row.Inspections.map((inspection) => inspection.InspectorKey)),
    ],
  };
}

/** Contract string -> DB enum, for the `status` filter on both list queries. */
const STATUS_FILTER = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
} as const;

/**
 * Appeals against a credit penalty (§5.8 "ขออุทธรณ์").
 *
 * The rule the whole desk exists for is `assertDifferentReviewer`: whoever
 * rules on an appeal must not be the borrower who filed it, and must not be
 * the inspector whose grade produced the penalty. An appeal reviewed by the
 * person being appealed against is not a review.
 */
@Injectable()
export class AppealService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: StaffScopeService,
    private readonly notifications: NotificationService,
  ) {}

  // =========================================================================
  // Borrower
  // =========================================================================

  /**
   * The penalties this borrower may still appeal.
   *
   * Three conditions, all of them here rather than on the client: in force,
   * not already appealed, and inside the window. The button on the credit page
   * is drawn from this list, so a penalty missing from it is a button that is
   * never offered rather than one that fails when pressed.
   */
  async listAppealable(user: TrpcUser) {
    const rows = await this.prisma.penaltyInfo.findMany({
      where: {
        AccountKey: user.accountKey,
        InEffect: true,
        ExpirationTime: { gt: new Date() },
        // `is: null` rather than `Appealed: false`: the unique relation is the
        // real constraint, and `Appealed` is a nullable boolean that a legacy
        // row may have left unset.
        OriginalAppeal: { is: null },
        ActionTime: { gte: addDays(new Date(), -APPEAL_WINDOW_DAYS) },
      },
      select: PENALTY_SELECT,
      orderBy: { ActionTime: 'desc' },
    });

    return rows.map((row) => ({
      ...toPenaltyOutput(row),
      appealableUntil: toIso(this.deadlineFor(row.ActionTime)),
    }));
  }

  /**
   * File an appeal (§5.8).
   *
   * Writes two rows in one transaction: the appeal, and `Appealed: true` on
   * the penalty it argues with. The flag is what `credit.me` reads to mark the
   * deduction as disputed on the borrower's own page, so a penalty with an
   * open appeal that still reads `Appealed: false` shows the borrower nothing
   * happened.
   */
  async create(user: TrpcUser, input: CreateAppealInput) {
    const penalty = await this.prisma.penaltyInfo.findUnique({
      where: { PenaltyKey: input.penaltyKey },
      select: {
        ...PENALTY_SELECT,
        AccountKey: true,
        UsageKey: true,
        OriginalAppeal: { select: { AppealKey: true } },
      },
    });

    if (!penalty) {
      throw new BusinessError('PENALTY_NOT_FOUND', {
        penaltyKey: input.penaltyKey,
      });
    }
    if (penalty.AccountKey !== user.accountKey) {
      throw new BusinessError('NOT_YOUR_PENALTY', {
        penaltyKey: input.penaltyKey,
      });
    }
    if (penalty.OriginalAppeal) {
      throw new BusinessError('ALREADY_APPEALED', {
        penaltyKey: input.penaltyKey,
        appealKey: penalty.OriginalAppeal.AppealKey,
      });
    }
    if (!penalty.InEffect || penalty.ExpirationTime <= new Date()) {
      // Nothing to overturn: the deduction has already been given back, so an
      // appeal could only produce a second refund.
      throw new BusinessError('PENALTY_NOT_IN_EFFECT', {
        penaltyKey: input.penaltyKey,
        expiresAt: toIso(penalty.ExpirationTime),
      });
    }

    const deadline = this.deadlineFor(penalty.ActionTime);
    if (new Date() > deadline) {
      throw new BusinessError('APPEAL_WINDOW_CLOSED', {
        penaltyKey: input.penaltyKey,
        appealableUntil: toIso(deadline),
        windowDays: APPEAL_WINDOW_DAYS,
      });
    }

    const appealKey = await this.prisma.$transaction(async (tx) => {
      const created = await tx.appealInfo.create({
        data: {
          OriginalPenalty: input.penaltyKey,
          FiledBy: user.accountKey,
          AppealReason: input.appealReason,
          ApproveStatus: 'Pending',
          ActionTime: new Date(),
        },
        select: { AppealKey: true },
      });

      await tx.penaltyInfo.update({
        where: { PenaltyKey: input.penaltyKey },
        data: { Appealed: true },
      });

      // Point the grading back at the appeal. `Inspection.AppealKey` is how the
      // desk gets from an appeal to the photos and notes that justified the
      // penalty — without it a supervisor rules on the borrower's account of
      // the damage and nothing else.
      await tx.inspection.updateMany({
        where: { PenaltyKey: input.penaltyKey },
        data: { AppealKey: created.AppealKey },
      });

      return created.AppealKey;
    });

    return this.getById(user, appealKey);
  }

  async listMine(user: TrpcUser, input: ListMyAppealsInput) {
    const where: Prisma.AppealInfoWhereInput = {
      FiledBy: user.accountKey,
      ...(input.status ? { ApproveStatus: STATUS_FILTER[input.status] } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.appealInfo.findMany({
        where,
        select: APPEAL_SELECT,
        orderBy: { ActionTime: 'desc' },
        ...toSkipTake(input),
      }),
      this.prisma.appealInfo.count({ where }),
    ]);

    return toPage(rows.map(toAppealOutput), total, input);
  }

  /**
   * One appeal.
   *
   * Readable by the borrower who filed it and by any staff member. The two are
   * not split into separate procedures because the payload is the same and the
   * ownership test is one line — what must not happen is a borrower reading
   * somebody else's, and that is the check below.
   */
  async getById(user: TrpcUser, appealKey: number) {
    const row = await this.prisma.appealInfo.findUnique({
      where: { AppealKey: appealKey },
      select: APPEAL_SELECT,
    });

    if (!row) {
      throw new BusinessError('APPEAL_NOT_FOUND', { appealKey });
    }
    if (user.role === 'borrower' && row.FiledBy !== user.accountKey) {
      // Same answer as "no such appeal", so the key space cannot be walked to
      // find out who has been penalised.
      throw new BusinessError('APPEAL_NOT_FOUND', { appealKey });
    }

    return toAppealOutput(row);
  }

  // =========================================================================
  // Supervisor
  // =========================================================================

  /**
   * The appeals queue, oldest first.
   *
   * Scoped like every other staff list: an appeal is visible when the penalty
   * came from a unit the caller's department manages. Penalties with no usage
   * behind them — an administrative borrowing ban — have no department, so
   * they are shown to everyone with the role rather than to nobody.
   */
  async listQueue(user: TrpcUser, input: ListAppealsInput) {
    const groups = await this.scope.resolveGroupKeys(user);

    const where: Prisma.AppealInfoWhereInput = {
      ...(input.status
        ? { ApproveStatus: STATUS_FILTER[input.status] }
        : // The default is the working queue. A desk opens on what needs doing.
          { ApproveStatus: 'Pending' }),
      ...(groups === null
        ? {}
        : {
            OriginalPenaltyInfo: {
              OR: [
                { UsageKey: null },
                { Usage: { Resource: { ManagedBy: { in: groups } } } },
              ],
            },
          }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.appealInfo.findMany({
        where,
        select: APPEAL_SELECT,
        orderBy: { ActionTime: 'asc' },
        ...toSkipTake(input),
      }),
      this.prisma.appealInfo.count({ where }),
    ]);

    return toPage(rows.map(toAppealOutput), total, input);
  }

  /**
   * Rule on an appeal (§5.8).
   *
   * Approving lifts the original penalty and gives the credit back. It does not
   * edit the original row beyond `InEffect: false` — the deduction that was
   * made stays on the record, and the appeal is what says it was overturned.
   *
   * `reducedCreditDeducted` writes a second, smaller penalty and links it as
   * `NewPenalty`, so the borrower is refunded the difference rather than the
   * whole amount. The replacement inherits the original's expiry: the point is
   * that the penalty was too large, not that its clock should restart.
   */
  async decide(user: TrpcUser, input: DecideAppealInput) {
    const appeal = await this.prisma.appealInfo.findUnique({
      where: { AppealKey: input.appealKey },
      select: {
        ...APPEAL_SELECT,
        OriginalPenaltyInfo: {
          select: {
            ...PENALTY_SELECT,
            AccountKey: true,
            UsageKey: true,
            Usage: {
              select: {
                ResourceKey: true,
                Resource: {
                  select: {
                    Item: { select: { Item: { select: { ItemName: true } } } },
                    Room: { select: { RoomName: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!appeal) {
      throw new BusinessError('APPEAL_NOT_FOUND', {
        appealKey: input.appealKey,
      });
    }
    if (appeal.ApproveStatus !== 'Pending') {
      throw new BusinessError('APPEAL_ALREADY_RESOLVED', {
        appealKey: input.appealKey,
        status: toAppealStatus(appeal.ApproveStatus),
        resolvedAt: toIsoNullable(appeal.ResolvedAt),
      });
    }

    this.assertDifferentReviewer(user, appeal);

    const penalty = appeal.OriginalPenaltyInfo;
    if (penalty.Usage) {
      await this.scope.assertResourceInScope(user, penalty.Usage.ResourceKey);
    }

    const now = new Date();

    if (input.decision === 'reject') {
      await this.prisma.$transaction(async (tx) => {
        await tx.appealInfo.update({
          where: { AppealKey: input.appealKey },
          data: {
            ApproveStatus: 'Rejected',
            ResolvedBy: user.accountKey,
            ResolvedAt: now,
          },
        });

        await this.notifications.appealRejected(tx, {
          accountKey: penalty.AccountKey,
          appealKey: input.appealKey,
          itemName: penalty.Usage
            ? resourceName(penalty.Usage.Resource)
            : undefined,
          reason: input.note,
        });
      });

      return this.getById(user, input.appealKey);
    }

    const deducted = penalty.CreditDeducted ?? 0;
    const reduced = input.reducedCreditDeducted ?? 0;
    if (reduced >= deducted) {
      // An appeal that leaves the borrower no better off is a rejection with
      // extra rows. Refusing it here keeps the desk from producing a penalty
      // pair that says "overturned" and costs the same.
      throw new BusinessError('INVALID_APPEAL_REDUCTION', {
        appealKey: input.appealKey,
        original: deducted,
        reduced,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // The original stops applying whatever happens next. Written before the
      // replacement so that a failure mid-transaction cannot leave two penalties
      // in force for one incident.
      await tx.penaltyInfo.update({
        where: { PenaltyKey: penalty.PenaltyKey },
        data: { InEffect: false },
      });

      let newPenaltyKey: number | null = null;
      if (reduced > 0) {
        const replacement = await tx.penaltyInfo.create({
          data: {
            AccountKey: penalty.AccountKey,
            UsageKey: penalty.UsageKey,
            Reason: penalty.Reason,
            CreditDeducted: reduced,
            ActionTime: penalty.ActionTime,
            ExpirationTime: penalty.ExpirationTime,
            Appealed: true,
            InEffect: true,
          },
          select: { PenaltyKey: true },
        });
        newPenaltyKey = replacement.PenaltyKey;
      }

      // One increment for the net difference, not a refund followed by a fresh
      // deduction: two writes would leave a moment where the borrower's score
      // is higher than it ever should have been, which is exactly when a
      // concurrent request reads it to decide what they may borrow.
      const restored = deducted - reduced;
      if (restored > 0) {
        await tx.accountInfo.update({
          where: { AccountKey: penalty.AccountKey },
          data: { UserCredit: { increment: restored } },
        });
      }

      await tx.appealInfo.update({
        where: { AppealKey: input.appealKey },
        data: {
          ApproveStatus: 'Approved',
          ResolvedBy: user.accountKey,
          ResolvedAt: now,
          ...(newPenaltyKey === null ? {} : { NewPenalty: newPenaltyKey }),
        },
      });

      await this.notifications.appealApproved(tx, {
        accountKey: penalty.AccountKey,
        appealKey: input.appealKey,
        creditRestored: restored,
        itemName: penalty.Usage
          ? resourceName(penalty.Usage.Resource)
          : undefined,
        note: input.note,
      });
    });

    return this.getById(user, input.appealKey);
  }

  // =========================================================================
  // Internals
  // =========================================================================

  /**
   * §5.8: "คนตรวจสอบต้องไม่ใช่คนเดิม".
   *
   * Two people are disqualified, for the same reason in two shapes:
   *
   *  - the borrower who filed it, because nobody rules on their own case;
   *  - the inspector who graded the return, because the appeal *is* against
   *    that grade, and letting them decide makes the appeal a request to
   *    reconsider addressed to the person who already decided.
   *
   * The second is the one the proposal spells out, and it is why
   * `Inspection.AppealKey` is written when the appeal is filed — without that
   * link there is no way to know who graded it.
   */
  private assertDifferentReviewer(user: TrpcUser, appeal: AppealRow): void {
    if (appeal.FiledBy === user.accountKey) {
      throw new BusinessError('CANNOT_DECIDE_OWN_APPEAL', {
        appealKey: appeal.AppealKey,
      });
    }

    const inspectorKeys = appeal.Inspections.map((row) => row.InspectorKey);
    if (inspectorKeys.includes(user.accountKey)) {
      throw new BusinessError('CANNOT_DECIDE_OWN_INSPECTION', {
        appealKey: appeal.AppealKey,
        inspectorKey: user.accountKey,
      });
    }
  }

  /**
   * The last moment a penalty may be appealed.
   *
   * Counted from `ActionTime` — when the penalty took effect — rather than
   * from the return, because that is the moment the borrower was told about
   * it. A null ActionTime means nothing recorded when it started, and the
   * honest reading of that is "the window is open", not "it closed at the
   * epoch".
   */
  private deadlineFor(actionTime: Date | null): Date {
    if (!actionTime) return addDays(new Date(), APPEAL_WINDOW_DAYS);
    return addDays(actionTime, APPEAL_WINDOW_DAYS);
  }
}
