import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { StaffScopeService } from '../common/authority/staff-scope.service';
import { ImageService } from '../image/image.service';
import { PenaltyService } from '../common/penalty/penalty.service';
import { BusinessError, notImplemented } from '../common/errors/business-error';
import {
  daysBetween,
  toIso,
  toIsoNullable,
} from '../common/schemas/datetime.schema';
import { toPage, toSkipTake } from '../common/schemas/pagination.schema';
import {
  DAMAGE_CONDITION,
  tryMapDamageLevel,
  tryMapTier,
  type ConditionType,
  type DamageLevel,
} from '../common/schemas/status.schema';
import type { TrpcUser } from '../trpc/context';
import type {
  CreateInspectionInput,
  FinishRepairInput,
  ListInspectionQueueInput,
  ListInspectionsForResourceInput,
  ListRepairsInput,
  ProposeDecommissionInput,
  RecordRoomCheckInput,
  StartRepairInput,
} from './inspection.schema';

/** Grades that take a unit out of the pool until somebody fixes or writes it off. */
const UNUSABLE_CONDITIONS: ConditionType[] = [
  'MajorDamage',
  'Broken',
  'Missing',
];

const RESOURCE_SELECT = {
  ResourceKey: true,
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

type ResourceRow = Prisma.ResourceInfoGetPayload<{
  select: typeof RESOURCE_SELECT;
}>;

const SUBJECT_SELECT = {
  UsageKey: true,
  CurrentStatus: true,
  DueTime: true,
  CheckoutTime: true,
  CheckInTime: true,
  Account: {
    select: {
      AccountKey: true,
      UserID: true,
      UserFName: true,
      UserLName: true,
      UserCredit: true,
    },
  },
  Resource: { select: RESOURCE_SELECT },
  CheckoutConditionLog: { select: { Condition: true, Notes: true } },
  Inspections: { take: 1, select: { InspectionKey: true } },
} satisfies Prisma.UsageLogSelect;

type SubjectRow = Prisma.UsageLogGetPayload<{ select: typeof SUBJECT_SELECT }>;

/**
 * The inspection desk (proposal §5.7, §5.9).
 *
 * Grading, the penalty it produces, and what happens to the unit afterwards are
 * one transaction. A ConditionLog without its penalty would let damage go
 * uncharged; a penalty without its ConditionLog would leave the borrower unable
 * to see, or appeal, what they were charged for.
 */
@Injectable()
export class InspectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: StaffScopeService,
    private readonly penalties: PenaltyService,
    // Evidence photos are stored relative and served absolute, same as the
    // catalogue ones — see image.schema.ts.
    private readonly images: ImageService,
  ) {}

  // =========================================================================
  // Queue and detail
  // =========================================================================

  async listQueue(user: TrpcUser, input: ListInspectionQueueInput) {
    const now = new Date();
    const resourceWhere: Prisma.ResourceInfoWhereInput =
      await this.scope.resourceScope(user);
    if (input.tier) {
      resourceWhere.BorrowRuleInfo = {
        RuleName: { equals: input.tier, mode: 'insensitive' },
      };
    }

    const where: Prisma.UsageLogWhereInput = {
      // Returned but not graded. `Inspected` is what grading sets, so this
      // needs no separate "done" flag.
      CurrentStatus: 'Returned',
      Resource: resourceWhere,
    };

    if (input.q) {
      where.OR = [
        { Account: { UserID: { contains: input.q, mode: 'insensitive' } } },
        { Account: { UserFName: { contains: input.q, mode: 'insensitive' } } },
        { Account: { UserLName: { contains: input.q, mode: 'insensitive' } } },
        {
          Resource: {
            Item: { ItemID: { contains: input.q, mode: 'insensitive' } },
          },
        },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.usageLog.findMany({
        where,
        // Oldest return first: an item sitting ungraded is an item nobody can
        // borrow, so the backlog is worked front to back.
        orderBy: { CheckInTime: 'asc' },
        ...toSkipTake(input),
        select: {
          ...SUBJECT_SELECT,
          Images: { select: { SubmissionType: true } },
        },
      }),
      this.prisma.usageLog.count({ where }),
    ]);

    const items = rows.map((row) => ({
      usageKey: row.UsageKey,
      borrowerName: `${row.Account.UserFName} ${row.Account.UserLName}`,
      borrowerStudentId: row.Account.UserID,
      itemName: this.nameOf(row.Resource),
      serialNo: row.Resource.Item?.ItemID ?? null,
      resourceKey: row.Resource.ResourceKey,
      tier: tryMapTier(row.Resource.BorrowRuleInfo.RuleName),
      checkoutCondition: row.CheckoutConditionLog.Condition,
      returnedAt: toIsoNullable(row.CheckInTime),
      overdueDays: daysBetween(row.DueTime, row.CheckInTime ?? now),
      beforeImageCount: row.Images.filter(
        (i) => i.SubmissionType === 'BeforePicture',
      ).length,
      afterImageCount: row.Images.filter(
        (i) => i.SubmissionType === 'AfterPicture',
      ).length,
    }));

    return toPage(items, total, input);
  }

  /** Everything needed to grade one return, including the side-by-side photos. */
  async getSubject(user: TrpcUser, usageKey: number) {
    const usage = await this.readSubject(usageKey);
    await this.scope.assertResourceInScope(user, usage.Resource.ResourceKey);

    const [images, history] = await this.prisma.$transaction([
      this.prisma.images.findMany({
        where: { UsageKey: usageKey },
        orderBy: { ImageKey: 'asc' },
        select: {
          ImageKey: true,
          ImageURL: true,
          SubmissionType: true,
          ActionTime: true,
        },
      }),
      this.prisma.conditionLog.findMany({
        where: { ResourceKey: usage.Resource.ResourceKey },
        orderBy: { ConditionKey: 'desc' },
        // Enough to spot a unit that keeps coming back damaged, without
        // dragging its whole life story into a grading screen.
        take: 10,
        select: {
          ConditionKey: true,
          Condition: true,
          Notes: true,
          LoggedAt: true,
        },
      }),
    ]);

    const toEvidence = (row: (typeof images)[number]) => ({
      imageKey: row.ImageKey,
      url: this.images.toPublicUrl(row.ImageURL) ?? row.ImageURL,
      submittedAt: toIsoNullable(row.ActionTime),
    });

    return {
      usageKey: usage.UsageKey,
      resourceKey: usage.Resource.ResourceKey,
      itemName: this.nameOf(usage.Resource),
      serialNo: usage.Resource.Item?.ItemID ?? null,
      tier: tryMapTier(usage.Resource.BorrowRuleInfo.RuleName),
      creditWeight: this.creditWeightOf(usage.Resource),
      borrowerAccountKey: usage.Account.AccountKey,
      borrowerName: `${usage.Account.UserFName} ${usage.Account.UserLName}`,
      borrowerStudentId: usage.Account.UserID,
      borrowerCreditScore: usage.Account.UserCredit,
      checkoutCondition: usage.CheckoutConditionLog.Condition,
      checkoutConditionNote: usage.CheckoutConditionLog.Notes,
      checkoutAt: toIso(usage.CheckoutTime),
      dueAt: toIso(usage.DueTime),
      returnedAt: toIsoNullable(usage.CheckInTime),
      overdueDays: daysBetween(usage.DueTime, usage.CheckInTime ?? new Date()),
      beforeImages: images
        .filter((i) => i.SubmissionType === 'BeforePicture')
        .map(toEvidence),
      afterImages: images
        .filter((i) => i.SubmissionType === 'AfterPicture')
        .map(toEvidence),
      unitHistory: history.map((row) => ({
        conditionKey: row.ConditionKey,
        condition: row.Condition,
        note: row.Notes,
        loggedAt: toIsoNullable(row.LoggedAt),
      })),
      existingInspectionKey: usage.Inspections[0]?.InspectionKey ?? null,
    };
  }

  // =========================================================================
  // Grading
  // =========================================================================

  async createInspection(user: TrpcUser, input: CreateInspectionInput) {
    const usage = await this.readSubject(input.usageKey);
    await this.scope.assertResourceInScope(user, usage.Resource.ResourceKey);

    if (usage.CurrentStatus !== 'Returned') {
      throw new BusinessError('WRONG_LOAN_STATE', {
        usageKey: input.usageKey,
        actual: usage.CurrentStatus,
        expected: ['Returned'],
      });
    }
    if (usage.Inspections.length > 0) {
      // Re-grading would silently stack a second penalty on the same return.
      // A grade the borrower disputes is changed by an appeal, not by a redo.
      throw new BusinessError('ALREADY_INSPECTED', {
        usageKey: input.usageKey,
        inspectionKey: usage.Inspections[0].InspectionKey,
      });
    }

    const level: DamageLevel = input.level;
    const condition = DAMAGE_CONDITION[level];
    const unusable = UNUSABLE_CONDITIONS.includes(condition);
    const now = new Date();

    const quote = await this.penalties.quoteDamage(
      usage.Resource.BorrowRule,
      this.creditWeightOf(usage.Resource),
      level,
    );

    const inspectionKey = await this.prisma.$transaction(async (tx) => {
      const conditionLog = await tx.conditionLog.create({
        data: {
          ResourceKey: usage.Resource.ResourceKey,
          LoggedBy: user.accountKey,
          Condition: condition,
          Notes: input.note ?? null,
          LoggedAt: now,
        },
        select: { ConditionKey: true },
      });

      const penaltyKey = await this.penalties.apply(tx, quote, {
        accountKey: usage.Account.AccountKey,
        usageKey: usage.UsageKey,
        // Damage is settled the day it is found; the loan is already back.
        effectiveFrom: now,
        note: input.note,
      });

      const inspection = await tx.inspection.create({
        data: {
          UsageKey: usage.UsageKey,
          ResourceKey: usage.Resource.ResourceKey,
          InspectorKey: user.accountKey,
          ConditionKey: conditionLog.ConditionKey,
          PenaltyKey: penaltyKey,
          ActionTime: now,
          Notes: input.note ?? null,
        },
        select: { InspectionKey: true },
      });

      await tx.usageLog.update({
        where: { UsageKey: usage.UsageKey },
        // `Inspected` is what ends the loan's hold on the unit — see
        // UNAVAILABLE_USAGE_STATES.
        data: {
          CurrentStatus: 'Inspected',
          CheckInCondition: conditionLog.ConditionKey,
        },
      });

      await tx.resourceInfo.update({
        where: { ResourceKey: usage.Resource.ResourceKey },
        data: {
          ConditionKey: conditionLog.ConditionKey,
          ...(condition === 'Missing'
            ? { ResourceStatus: 'Missing' as const }
            : {}),
          // B0 and B1 go back on the shelf; anything worse waits for a repair
          // decision, because lending out a unit with known major damage makes
          // the next borrower's grade meaningless.
          ...(unusable ? { AllowBorrow: false } : {}),
        },
      });

      if (input.imageUrls.length > 0) {
        await tx.images.createMany({
          data: input.imageUrls.map((url) => ({
            SubmittedBy: user.accountKey,
            UsageKey: usage.UsageKey,
            ResourceKey: usage.Resource.ResourceKey,
            InspectionKey: inspection.InspectionKey,
            ImageURL: this.images.toStoredUrl(url),
            SubmissionType: 'InspectionPicture' as const,
            ActionTime: now,
          })),
        });
      }

      return inspection.InspectionKey;
    });

    return this.readInspectionOutput(inspectionKey, !unusable);
  }

  /**
   * Damage history for one unit.
   *
   * The proposal keys history to the serial ("แต่ละหมายเลขจะเก็บอายุการใช้งาน
   * ประวัติการยืม และประวัติความเสียหายที่ผ่านมา"), which is what makes a repeat
   * offender — a unit or a borrower — visible at grading time.
   */
  async listForResource(
    user: TrpcUser,
    input: ListInspectionsForResourceInput,
  ) {
    await this.scope.assertResourceInScope(user, input.resourceKey);

    const rows = await this.prisma.inspection.findMany({
      where: { ResourceKey: input.resourceKey },
      orderBy: { InspectionKey: 'desc' },
      take: input.limit,
      select: {
        InspectionKey: true,
        UsageKey: true,
        Notes: true,
        ActionTime: true,
        Condition: { select: { Condition: true } },
        Inspector: { select: { UserFName: true, UserLName: true } },
        Usage: { select: { Account: { select: { UserID: true } } } },
      },
    });

    return rows.map((row) => {
      const condition = row.Condition.Condition;
      return {
        inspectionKey: row.InspectionKey,
        usageKey: row.UsageKey,
        condition,
        level: tryMapDamageLevel(condition),
        note: row.Notes,
        inspectedAt: toIsoNullable(row.ActionTime),
        inspectorName: `${row.Inspector.UserFName} ${row.Inspector.UserLName}`,
        borrowerStudentId: row.Usage.Account.UserID,
      };
    });
  }

  // =========================================================================
  // Rooms
  // =========================================================================

  async recordRoomCheck(user: TrpcUser, input: RecordRoomCheckInput) {
    await this.scope.assertResourceInScope(user, input.resourceKey);

    const resource = await this.prisma.resourceInfo.findUnique({
      where: { ResourceKey: input.resourceKey },
      select: { ResourceKey: true, ResourceType: true },
    });
    if (!resource) {
      throw new BusinessError('RESOURCE_NOT_FOUND', {
        resourceKey: input.resourceKey,
      });
    }
    if (resource.ResourceType !== 'Room') {
      throw new BusinessError('UNIT_DOES_NOT_MATCH_REQUEST', {
        resourceKey: input.resourceKey,
        expected: 'Room',
        actual: resource.ResourceType,
      });
    }

    const now = new Date();
    const unusable = UNUSABLE_CONDITIONS.includes(input.condition);

    const conditionKey = await this.prisma.$transaction(async (tx) => {
      const log = await tx.conditionLog.create({
        data: {
          ResourceKey: input.resourceKey,
          LoggedBy: user.accountKey,
          Condition: input.condition,
          Notes: input.note ?? null,
          LoggedAt: now,
        },
        select: { ConditionKey: true },
      });

      await tx.resourceInfo.update({
        where: { ResourceKey: input.resourceKey },
        data: {
          ConditionKey: log.ConditionKey,
          // A round that finds the room fine does not re-open a room somebody
          // closed for another reason, so this only ever closes.
          ...(unusable ? { AllowBorrow: false } : {}),
        },
      });

      return log.ConditionKey;
    });

    return {
      resourceKey: input.resourceKey,
      conditionKey,
      condition: input.condition,
      note: input.note ?? null,
      checkedAt: toIso(now),
      stillBookable: !unusable,
    };
  }

  // =========================================================================
  // Repair
  // =========================================================================

  async listRepairs(user: TrpcUser, input: ListRepairsInput) {
    const resourceWhere = await this.scope.resourceScope(user);

    const where: Prisma.RepairLogWhereInput = {
      Resource: resourceWhere,
      ...(input.openOnly ? { EndRepairDate: null } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.repairLog.findMany({
        where,
        orderBy: { BeginRepairDate: 'asc' },
        ...toSkipTake(input),
        select: {
          RepairKey: true,
          ResourceKey: true,
          BeginRepairDate: true,
          EndRepairDate: true,
          RepairedByUser: { select: { UserFName: true, UserLName: true } },
          ConditionBefore: { select: { Condition: true } },
          ConditionAfter: { select: { Condition: true } },
          Resource: { select: RESOURCE_SELECT },
        },
      }),
      this.prisma.repairLog.count({ where }),
    ]);

    const items = rows.map((row) => ({
      repairKey: row.RepairKey,
      resourceKey: row.ResourceKey,
      itemName: this.nameOf(row.Resource),
      serialNo: row.Resource.Item?.ItemID ?? null,
      repairedByName: `${row.RepairedByUser.UserFName} ${row.RepairedByUser.UserLName}`,
      conditionBefore: row.ConditionBefore.Condition,
      conditionAfter: row.ConditionAfter?.Condition ?? null,
      beganAt: toIso(row.BeginRepairDate),
      finishedAt: toIsoNullable(row.EndRepairDate),
    }));

    return toPage(items, total, input);
  }

  /** Send a damaged unit to repair. Keeps it out of the pool while it is away. */
  async startRepair(user: TrpcUser, input: StartRepairInput) {
    await this.scope.assertResourceInScope(user, input.resourceKey);

    const resource = await this.prisma.resourceInfo.findUnique({
      where: { ResourceKey: input.resourceKey },
      select: { ResourceKey: true, ConditionKey: true },
    });
    if (!resource) {
      throw new BusinessError('RESOURCE_NOT_FOUND', {
        resourceKey: input.resourceKey,
      });
    }

    const now = new Date();

    const repairKey = await this.prisma.$transaction(async (tx) => {
      // RepairLog.ConditionBeforeRepair is required, and a unit whose condition
      // was never logged has nothing to point at — record the state it is going
      // in with rather than refusing the repair.
      const before =
        resource.ConditionKey ??
        (
          await tx.conditionLog.create({
            data: {
              ResourceKey: input.resourceKey,
              LoggedBy: user.accountKey,
              Condition: 'MinorDamage',
              Notes: input.note ?? 'condition at start of repair',
              LoggedAt: now,
            },
            select: { ConditionKey: true },
          })
        ).ConditionKey;

      const repair = await tx.repairLog.create({
        data: {
          RepairedBy: user.accountKey,
          ResourceKey: input.resourceKey,
          BeginRepairDate: now,
          ConditionBeforeRepair: before,
        },
        select: { RepairKey: true },
      });

      await tx.resourceInfo.update({
        where: { ResourceKey: input.resourceKey },
        data: { AllowBorrow: false },
      });

      return repair.RepairKey;
    });

    return this.readRepair(repairKey);
  }

  /** Close a repair. A `Normal` result is what puts the unit back on the shelf. */
  async finishRepair(user: TrpcUser, input: FinishRepairInput) {
    const repair = await this.prisma.repairLog.findUnique({
      where: { RepairKey: input.repairKey },
      select: { RepairKey: true, ResourceKey: true, EndRepairDate: true },
    });
    if (!repair) {
      throw new BusinessError('RESOURCE_NOT_FOUND', {
        repairKey: input.repairKey,
      });
    }
    await this.scope.assertResourceInScope(user, repair.ResourceKey);

    if (repair.EndRepairDate !== null) {
      throw new BusinessError('ALREADY_DECIDED', {
        repairKey: input.repairKey,
        decidedAt: toIso(repair.EndRepairDate),
      });
    }

    const now = new Date();
    const usable = !UNUSABLE_CONDITIONS.includes(input.condition);

    await this.prisma.$transaction(async (tx) => {
      const after = await tx.conditionLog.create({
        data: {
          ResourceKey: repair.ResourceKey,
          LoggedBy: user.accountKey,
          Condition: input.condition,
          Notes: input.note ?? null,
          LoggedAt: now,
        },
        select: { ConditionKey: true },
      });

      await tx.repairLog.update({
        where: { RepairKey: input.repairKey },
        data: { EndRepairDate: now, ConditionAfterRepair: after.ConditionKey },
      });

      await tx.resourceInfo.update({
        where: { ResourceKey: repair.ResourceKey },
        data: {
          ConditionKey: after.ConditionKey,
          AllowBorrow: usable,
          ...(usable ? { ResourceStatus: 'InStorage' as const } : {}),
        },
      });
    });

    return this.readRepair(input.repairKey);
  }

  // =========================================================================
  // Decommission — declared, not storable
  // =========================================================================

  async proposeDecommission(user: TrpcUser, input: ProposeDecommissionInput) {
    await this.scope.assertResourceInScope(user, input.resourceKey);

    notImplemented(
      [
        'DecommissionRequest (resourceKey, proposedBy, reason, status, decidedBy, decidedAt)',
        'AuditLog (the proposal requires the approval to be recorded)',
      ],
      'Staff propose and a supervisor approves a retirement (§5.9). Today the ' +
        'nearest available action is item.setUnitCondition + item.setUnitLendable, ' +
        'which withdraws the unit but records no decision and no approver.',
    );
  }

  // =========================================================================
  // Internals
  // =========================================================================

  private async readSubject(usageKey: number): Promise<SubjectRow> {
    const usage = await this.prisma.usageLog.findUnique({
      where: { UsageKey: usageKey },
      select: SUBJECT_SELECT,
    });
    if (!usage) {
      throw new BusinessError('LOAN_NOT_FOUND', { usageKey });
    }
    return usage;
  }

  private async readInspectionOutput(
    inspectionKey: number,
    returnedToPool: boolean,
  ) {
    const row = await this.prisma.inspection.findUnique({
      where: { InspectionKey: inspectionKey },
      select: {
        InspectionKey: true,
        UsageKey: true,
        ResourceKey: true,
        InspectorKey: true,
        Notes: true,
        ActionTime: true,
        Condition: { select: { Condition: true } },
        Penalty: {
          select: {
            PenaltyKey: true,
            CreditDeducted: true,
            ExpirationTime: true,
          },
        },
      },
    });
    if (!row) {
      throw new BusinessError('INSPECTION_NOT_FOUND', { inspectionKey });
    }

    const condition = row.Condition.Condition;

    return {
      inspectionKey: row.InspectionKey,
      usageKey: row.UsageKey,
      resourceKey: row.ResourceKey,
      inspectorAccountKey: row.InspectorKey,
      level: tryMapDamageLevel(condition),
      condition,
      note: row.Notes,
      inspectedAt: toIsoNullable(row.ActionTime),
      penalty: row.Penalty
        ? {
            penaltyKey: row.Penalty.PenaltyKey,
            creditDeducted: row.Penalty.CreditDeducted ?? 0,
            expiresAt: toIso(row.Penalty.ExpirationTime),
          }
        : null,
      returnedToPool,
    };
  }

  private async readRepair(repairKey: number) {
    const row = await this.prisma.repairLog.findUniqueOrThrow({
      where: { RepairKey: repairKey },
      select: {
        RepairKey: true,
        ResourceKey: true,
        BeginRepairDate: true,
        EndRepairDate: true,
        RepairedByUser: { select: { UserFName: true, UserLName: true } },
        ConditionBefore: { select: { Condition: true } },
        ConditionAfter: { select: { Condition: true } },
        Resource: { select: RESOURCE_SELECT },
      },
    });

    return {
      repairKey: row.RepairKey,
      resourceKey: row.ResourceKey,
      itemName: this.nameOf(row.Resource),
      serialNo: row.Resource.Item?.ItemID ?? null,
      repairedByName: `${row.RepairedByUser.UserFName} ${row.RepairedByUser.UserLName}`,
      conditionBefore: row.ConditionBefore.Condition,
      conditionAfter: row.ConditionAfter?.Condition ?? null,
      beganAt: toIso(row.BeginRepairDate),
      finishedAt: toIsoNullable(row.EndRepairDate),
    };
  }

  private creditWeightOf(resource: ResourceRow): number {
    return resource.Item?.Item.CreditWeight ?? resource.Room?.CreditWeight ?? 0;
  }

  private nameOf(resource: ResourceRow): string | null {
    return resource.Item?.Item.ItemName ?? resource.Room?.RoomName ?? null;
  }
}
