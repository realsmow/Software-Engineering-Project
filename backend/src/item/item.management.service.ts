import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { StaffScopeService } from '../common/authority/staff-scope.service';
import { ImageService } from '../image/image.service';
import {
  HELD_USAGE_STATES,
  UNAVAILABLE_USAGE_STATES,
} from '../common/usage/usage-states';
import { HOLDING_APPROVE_STATES } from '../common/booking/booking-window';
import {
  DEFAULT_ROOM_HOURS,
  assertValidRoomHours,
  type RoomHours,
} from '../common/booking/room-slots';
import { suggestTierFromPrice } from '../common/pricing/suggest-tier';
import {
  NotificationService,
  supervisorsForGroup,
} from '../notification/notification.service';
import { BusinessError } from '../common/errors/business-error';
import { toIso, toIsoNullable } from '../common/schemas/datetime.schema';
import {
  toOrderBy,
  toPage,
  toSkipTake,
} from '../common/schemas/pagination.schema';
import {
  conditionType as conditionTypeSchema,
  tryMapTier,
  type ResourceTier,
} from '../common/schemas/status.schema';
import type { TrpcUser } from '../trpc/context';
import type {
  CreateItemTypeInput,
  CreateItemUnitInput,
  CreateRoomInput,
  DeleteItemTypeInput,
  DeleteResourceInput,
  EligibilityTargetInput,
  ListManagedItemsInput,
  ListManagedRoomsInput,
  ListManagedUnitsInput,
  RequestRetirementInput,
  RetirementRequestIdInput,
  SetEligibilityInput,
  SetUnitConditionInput,
  SetUnitLendableInput,
  UpdateItemTypeInput,
  UpdateItemUnitInput,
  UpdateRoomInput,
} from './item.schema';

/** Sort keys the client may send, mapped to real columns (never passed through raw). */
const ITEM_TYPE_SORT_COLUMNS = {
  id: 'ItemKey',
  name: 'ItemName',
  creditWeight: 'CreditWeight',
} as const;

const ROOM_SORT_COLUMNS = {
  id: 'RoomKey',
  name: 'RoomName',
  location: 'RoomLocation',
} as const;

/** Everything the unit mapper needs, selected in one place so the two agree. */
const UNIT_SELECT = {
  IndivKey: true,
  ItemKey: true,
  ItemID: true,
  ImageURL: true,
  Resource: {
    select: {
      ResourceKey: true,
      ResourceStatus: true,
      AllowBorrow: true,
      BufferTime: true,
      ManagedBy: true,
      BorrowRuleInfo: { select: { RuleName: true } },
      CurrentCondition: {
        select: { Condition: true, Notes: true, LoggedAt: true },
      },
      ManagementGroup: {
        select: {
          ManageGroupKey: true,
          GroupType: true,
          Branch: { select: { BranchName: true } },
          Club: { select: { ClubName: true } },
        },
      },
      UsageLogs: {
        // Anything that keeps the unit off the shelf, so `availableUnits` and
        // `currentDueAt` are answered by one join rather than two.
        where: { CurrentStatus: { in: UNAVAILABLE_USAGE_STATES } },
        take: 1,
        orderBy: { UsageKey: 'desc' },
        select: { DueTime: true },
      },
    },
  },
} satisfies Prisma.ItemIndivSelect;

type UnitRow = Prisma.ItemIndivGetPayload<{ select: typeof UNIT_SELECT }>;

const ROOM_SELECT = {
  RoomKey: true,
  RoomName: true,
  RoomDesc: true,
  RoomLocation: true,
  ImageURL: true,
  CreditWeight: true,
  Capacity: true,
  OpenTime: true,
  CloseTime: true,
  BreakStart: true,
  BreakEnd: true,
  Resource: {
    select: {
      ResourceKey: true,
      ResourceStatus: true,
      AllowBorrow: true,
      BorrowRuleInfo: { select: { RuleName: true } },
      CurrentCondition: { select: { Condition: true } },
      ManagementGroup: {
        select: {
          ManageGroupKey: true,
          GroupType: true,
          Branch: { select: { BranchName: true } },
          Club: { select: { ClubName: true } },
        },
      },
    },
  },
} satisfies Prisma.RoomInfoSelect;

type RoomRow = Prisma.RoomInfoGetPayload<{ select: typeof ROOM_SELECT }>;

type GroupRow = UnitRow['Resource']['ManagementGroup'];

const STAFF_REF_SELECT = {
  AccountKey: true,
  UserID: true,
  UserFName: true,
  UserLName: true,
} satisfies Prisma.AccountInfoSelect;

type StaffRefRow = Prisma.AccountInfoGetPayload<{
  select: typeof STAFF_REF_SELECT;
}>;

function toStaffRef(row: StaffRefRow) {
  return {
    accountKey: row.AccountKey,
    userId: row.UserID,
    name: `${row.UserFName} ${row.UserLName}`.trim(),
  };
}

/**
 * Everything a retirement request's output needs, in one place so
 * `item.requestRetirement`/`cancelRetirement` and
 * `approval.retirementQueue`/`decideRetirement` cannot describe the same row
 * two different ways.
 */
export const RETIREMENT_REQUEST_SELECT = {
  RequestKey: true,
  ResourceKey: true,
  Reason: true,
  ApproveStatus: true,
  RequestedAt: true,
  DecidedAt: true,
  DecisionNote: true,
  RequestedByUser: { select: STAFF_REF_SELECT },
  DecidedByUser: { select: STAFF_REF_SELECT },
  Resource: {
    select: {
      ResourceType: true,
      ManagedBy: true,
      Item: {
        select: { ItemID: true, Item: { select: { ItemName: true } } },
      },
      Room: { select: { RoomName: true } },
    },
  },
} satisfies Prisma.RetirementRequestSelect;

export type RetirementRequestRow = Prisma.RetirementRequestGetPayload<{
  select: typeof RETIREMENT_REQUEST_SELECT;
}>;

export function toRetirementRequestOutput(row: RetirementRequestRow) {
  return {
    requestKey: row.RequestKey,
    resourceKey: row.ResourceKey,
    kind: row.Resource.ResourceType === 'Room' ? 'room' : 'equipment',
    resourceName:
      row.Resource.Item?.Item.ItemName ?? row.Resource.Room?.RoomName ?? null,
    serialNo: row.Resource.Item?.ItemID ?? null,
    reason: row.Reason,
    status: row.ApproveStatus,
    requestedBy: toStaffRef(row.RequestedByUser),
    requestedAt: toIso(row.RequestedAt),
    decidedBy: row.DecidedByUser ? toStaffRef(row.DecidedByUser) : null,
    decidedAt: toIsoNullable(row.DecidedAt),
    decisionNote: row.DecisionNote,
  };
}

/**
 * The catalogue as staff maintain it (proposal §5.9, setup tasks).
 *
 * Every read is filtered by the caller's departments and every write checks
 * the same thing before touching a row — see StaffScopeService for why that is
 * done here rather than in middleware.
 */
@Injectable()
export class ItemManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: StaffScopeService,
    // Image URLs are stored relative and served absolute, so every read and
    // write of an ImageURL column goes through here — see image.schema.ts.
    private readonly images: ImageService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  // =========================================================================
  // Item types
  // =========================================================================

  async listManagedItems(user: TrpcUser, input: ListManagedItemsInput) {
    const resourceWhere = await this.resourceWhereForScope(user, input.tier);

    const where: Prisma.ItemInfoWhereInput = {
      // A type is "mine" when at least one of its units is. Filtering the
      // relation rather than the type is what keeps two departments that stock
      // the same model of multimeter out of each other's lists.
      Items: { some: { Resource: resourceWhere } },
    };

    if (input.q) {
      where.OR = [
        { ItemName: { contains: input.q, mode: 'insensitive' } },
        { ItemDesc: { contains: input.q, mode: 'insensitive' } },
        {
          Items: {
            some: { ItemID: { contains: input.q, mode: 'insensitive' } },
          },
        },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.itemInfo.findMany({
        where,
        orderBy: toOrderBy(input, ITEM_TYPE_SORT_COLUMNS, 'ItemKey'),
        ...toSkipTake(input),
        select: {
          ItemKey: true,
          ItemName: true,
          ItemDesc: true,
          ImageURL: true,
          CreditWeight: true,
          Price: true,
          // Only the in-scope units, so the counts describe what the caller
          // can actually act on rather than the university's whole stock.
          Items: { where: { Resource: resourceWhere }, select: UNIT_SELECT },
        },
      }),
      this.prisma.itemInfo.count({ where }),
    ]);

    const summaries = rows
      .map((row) => this.toItemTypeSummary(row, row.Items))
      .filter((summary) => !input.availableOnly || summary.availableUnits > 0);

    // `total` still counts pre-filter rows when availableOnly is on: the count
    // would need the same per-unit aggregation as the page, and paying for
    // that on every keystroke is not worth an exact page count here.
    return toPage(summaries, total, input);
  }

  async getManagedItemById(user: TrpcUser, itemKey: number) {
    const resourceWhere = await this.resourceWhereForScope(user);

    const row = await this.prisma.itemInfo.findUnique({
      where: { ItemKey: itemKey },
      select: {
        ItemKey: true,
        ItemName: true,
        ItemDesc: true,
        ImageURL: true,
        CreditWeight: true,
        Price: true,
        Items: { where: { Resource: resourceWhere }, select: UNIT_SELECT },
        // Distinguishes "another department's stock" from "no stock anywhere",
        // which the scoped `Items` list above cannot tell apart on its own.
        _count: { select: { Items: true } },
      },
    });

    if (!row) {
      throw new BusinessError('ITEM_TYPE_NOT_FOUND', { itemKey });
    }
    if (row.Items.length === 0 && row._count.Items > 0) {
      // The type exists and holds stock, none of it this caller's. Saying "not
      // in your scope" rather than "not found" is the honest answer, and the
      // type key is not a secret — it is in every borrower's catalogue.
      throw new BusinessError('OUT_OF_MANAGEMENT_SCOPE', { itemKey });
    }

    return {
      ...this.toItemTypeSummary(row, row.Items),
      units: row.Items.map((unit) => this.toItemUnit(unit)),
    };
  }

  async createItemType(user: TrpcUser, input: CreateItemTypeInput) {
    // ItemInfo has no department, so there is no group to check against. What
    // can be checked is the same thing every other staff write requires: the
    // caller administers some department. A staff account attached to none
    // was creating catalogue entries (FR-AUTH-05). Admins are unscoped.
    await this.scope.resolveGroupKeys(user);

    const created = await this.prisma.itemInfo.create({
      data: {
        ItemName: input.name,
        ItemDesc: input.description ?? null,
        ImageURL: this.images.toStoredUrl(input.imageUrl) ?? null,
        CreditWeight: input.creditWeight,
        Price: input.price ?? null,
      },
      select: {
        ItemKey: true,
        ItemName: true,
        ItemDesc: true,
        ImageURL: true,
        CreditWeight: true,
        Price: true,
      },
    });

    await this.audit.record(
      { accountKey: user.accountKey },
      'create',
      `item/${created.ItemKey}`,
      `Created item type "${created.ItemName}"`,
    );

    // A type with no units yet: the counts are zero and there are no tiers,
    // because a tier lives on the unit. `item.createUnit` is the next call.
    return {
      id: created.ItemKey,
      name: created.ItemName,
      description: created.ItemDesc,
      imageUrl: this.images.toPublicUrl(created.ImageURL),
      creditWeight: created.CreditWeight,
      tiers: [] as ResourceTier[],
      totalUnits: 0,
      availableUnits: 0,
      price: created.Price ?? null,
      suggestedTier: suggestTierFromPrice(created.Price),
      units: [],
    };
  }

  async updateItemType(user: TrpcUser, input: UpdateItemTypeInput) {
    await this.scopedResourceKeysOfType(user, input.itemKey);

    const data: Prisma.ItemInfoUpdateInput = {};
    if (input.name !== undefined) data.ItemName = input.name;
    if (input.description !== undefined) data.ItemDesc = input.description;
    if (input.imageUrl !== undefined)
      data.ImageURL = this.images.toStoredUrl(input.imageUrl);
    if (input.creditWeight !== undefined)
      data.CreditWeight = input.creditWeight;
    if (input.price !== undefined) data.Price = input.price;

    await this.prisma.itemInfo.update({
      where: { ItemKey: input.itemKey },
      data,
    });

    await this.audit.record(
      { accountKey: user.accountKey },
      'update',
      `item/${input.itemKey}`,
      `Updated item type fields: ${Object.keys(data).join(', ') || 'none'}`,
    );

    return this.getManagedItemById(user, input.itemKey);
  }

  // =========================================================================
  // Units
  // =========================================================================

  async listManagedUnits(user: TrpcUser, input: ListManagedUnitsInput) {
    const resourceWhere = await this.resourceWhereForScope(user);

    if (input.status) resourceWhere.ResourceStatus = input.status;
    if (input.lendable !== undefined)
      resourceWhere.AllowBorrow = input.lendable;

    const rows = await this.prisma.itemIndiv.findMany({
      where: { ItemKey: input.itemKey, Resource: resourceWhere },
      orderBy: { IndivKey: 'asc' },
      select: UNIT_SELECT,
    });

    return rows.map((row) => this.toItemUnit(row));
  }

  /**
   * Registers one or more physical units of a type (proposal §5.9
   * "ลงทะเบียนชิ้นอุปกรณ์"). Both tracked tiers carry a serial — T2 the
   * one printed on the unit, T1 a per-unit tag derived from the batch — while
   * T0 is counted and gets a generated placeholder. See `buildSerials`.
   *
   * Both rows are written in one transaction because ItemIndiv.ResourceKey is
   * required and unique — a ResourceInfo created without its ItemIndiv is an
   * orphan that shows up in no list and can never be reached again.
   */
  async createItemUnits(user: TrpcUser, input: CreateItemUnitInput) {
    await this.scope.assertGroupInScope(user, input.manageGroupKey);

    const itemType = await this.prisma.itemInfo.findUnique({
      where: { ItemKey: input.itemKey },
      select: { ItemKey: true, ItemName: true },
    });
    if (!itemType) {
      throw new BusinessError('ITEM_TYPE_NOT_FOUND', {
        itemKey: input.itemKey,
      });
    }

    const borrowRuleKey = await this.resolveTierRuleKey(input.tier);
    const existing = await this.prisma.itemIndiv.findMany({
      where: { ItemKey: input.itemKey },
      select: { ItemID: true },
    });
    const serials = this.buildSerials(
      input,
      itemType.ItemName,
      existing.map((row) => row.ItemID),
    );
    await this.assertSerialsFree(input.itemKey, serials);

    const created = await this.prisma.$transaction(async (tx) => {
      const keys: number[] = [];

      // Who may already borrow this type here. Rules hang off each unit rather
      // than the type, so without this a unit added to a type staff had
      // already opened would be closed to everyone, and nothing would say so:
      // the editor shows the type's rules, which the new unit silently lacks.
      //
      // Same department only. A type can have units in several departments
      // with different rules, and inheriting across them would open this
      // department's new unit to another department's students.
      const inherited = await tx.eligibility.findMany({
        where: {
          Resource: {
            ManagedBy: input.manageGroupKey,
            Item: { is: { ItemKey: input.itemKey } },
          },
        },
        select: { GroupKey: true, RoleKey: true },
        distinct: ['GroupKey', 'RoleKey'],
      });

      for (const serial of serials) {
        const resource = await tx.resourceInfo.create({
          data: {
            ManagedBy: input.manageGroupKey,
            BorrowRule: borrowRuleKey,
            ResourceStatus: 'InStorage',
            ResourceType: 'Item',
            BufferTime: input.prepDays,
            AllowBorrow: input.lendable,
          },
          select: { ResourceKey: true },
        });

        await tx.itemIndiv.create({
          data: {
            ResourceKey: resource.ResourceKey,
            ItemKey: input.itemKey,
            ItemID: serial,
            ImageURL: this.images.toStoredUrl(input.imageUrl) ?? null,
          },
        });

        keys.push(resource.ResourceKey);
      }

      if (inherited.length > 0) {
        await tx.eligibility.createMany({
          data: keys.flatMap((ResourceKey) =>
            inherited.map((rule) => ({ ResourceKey, ...rule })),
          ),
          skipDuplicates: true,
        });
      }

      return keys;
    });

    const rows = await this.prisma.itemIndiv.findMany({
      where: { ResourceKey: { in: created } },
      orderBy: { IndivKey: 'asc' },
      select: UNIT_SELECT,
    });

    await this.audit.record(
      { accountKey: user.accountKey },
      'create',
      `item/${input.itemKey}`,
      `Registered ${serials.length} unit(s) (${serials.join(', ')}), tier ${input.tier}`,
    );

    return rows.map((row) => this.toItemUnit(row));
  }

  async updateItemUnit(user: TrpcUser, input: UpdateItemUnitInput) {
    await this.scope.assertResourceInScope(user, input.resourceKey);

    const unit = await this.prisma.itemIndiv.findUnique({
      where: { ResourceKey: input.resourceKey },
      select: { IndivKey: true, ItemKey: true },
    });
    if (!unit) {
      throw new BusinessError('RESOURCE_NOT_FOUND', {
        resourceKey: input.resourceKey,
      });
    }

    if (input.serialNo !== undefined) {
      await this.assertSerialsFree(
        unit.ItemKey,
        [input.serialNo],
        unit.IndivKey,
      );
    }

    const borrowRuleKey =
      input.tier === undefined
        ? undefined
        : await this.resolveTierRuleKey(input.tier);

    await this.prisma.$transaction(async (tx) => {
      if (input.serialNo !== undefined || input.imageUrl !== undefined) {
        await tx.itemIndiv.update({
          where: { IndivKey: unit.IndivKey },
          data: {
            ...(input.serialNo !== undefined ? { ItemID: input.serialNo } : {}),
            ...(input.imageUrl !== undefined
              ? { ImageURL: this.images.toStoredUrl(input.imageUrl) }
              : {}),
          },
        });
      }

      if (borrowRuleKey !== undefined || input.prepDays !== undefined) {
        await tx.resourceInfo.update({
          where: { ResourceKey: input.resourceKey },
          data: {
            ...(borrowRuleKey !== undefined
              ? { BorrowRule: borrowRuleKey }
              : {}),
            ...(input.prepDays !== undefined
              ? { BufferTime: input.prepDays }
              : {}),
          },
        });
      }
    });

    await this.audit.record(
      { accountKey: user.accountKey },
      'update',
      `unit/${input.resourceKey}`,
      `Updated unit${input.serialNo !== undefined ? `, serial ${input.serialNo}` : ''}${input.tier !== undefined ? `, tier ${input.tier}` : ''}`,
    );

    return this.readUnit(input.resourceKey);
  }

  /** Withdraw a unit from the pool, or put it back (§5.9 "ปรับสถานะชั่วคราว"). */
  async setUnitLendable(user: TrpcUser, input: SetUnitLendableInput) {
    await this.scope.assertResourceInScope(user, input.resourceKey);

    const resource = await this.prisma.resourceInfo.findUnique({
      where: { ResourceKey: input.resourceKey },
      select: {
        ResourceKey: true,
        ConditionKey: true,
        UsageLogs: {
          // HELD, not UNAVAILABLE: a unit that is back but ungraded is exactly
          // the one staff want to pull out for repair.
          where: { CurrentStatus: { in: HELD_USAGE_STATES } },
          take: 1,
          select: { UsageKey: true, CurrentStatus: true },
        },
      },
    });
    if (!resource) {
      throw new BusinessError('RESOURCE_NOT_FOUND', {
        resourceKey: input.resourceKey,
      });
    }

    const openUsage = resource.UsageLogs[0];
    if (!input.lendable && openUsage) {
      // Withdrawing a unit someone is holding would strand the return: the
      // check-in flow needs a lendable, findable unit to write against. Wait
      // for it to come back, then take it out.
      throw new BusinessError('RESOURCE_IN_USE', {
        resourceKey: input.resourceKey,
        usageKey: openUsage.UsageKey,
        state: openUsage.CurrentStatus,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.resourceInfo.update({
        where: { ResourceKey: input.resourceKey },
        data: { AllowBorrow: input.lendable },
      });

      if (input.reason) {
        // ConditionLog is the only place a free-text note about a unit
        // survives, so a stated reason goes there rather than being dropped.
        // The condition itself is unchanged — this is an availability
        // decision, not a damage assessment.
        const current = resource.ConditionKey
          ? await tx.conditionLog.findUnique({
              where: { ConditionKey: resource.ConditionKey },
              select: { Condition: true },
            })
          : null;

        await tx.conditionLog.create({
          data: {
            ResourceKey: input.resourceKey,
            LoggedBy: user.accountKey,
            Condition: current?.Condition ?? 'Normal',
            Notes: input.reason,
            LoggedAt: new Date(),
          },
        });
      }
    });

    await this.audit.record(
      { accountKey: user.accountKey },
      'update',
      `unit/${input.resourceKey}`,
      `Set lendable = ${input.lendable}${input.reason ? `: ${input.reason}` : ''}`,
    );

    return this.readUnit(input.resourceKey);
  }

  /**
   * Records a condition outside the return flow — a unit found broken on the
   * shelf, or one written off as missing.
   *
   * Damage found *during* a return belongs to `inspection.create`, which also
   * charges the borrower. This one deliberately charges nobody.
   */
  async setUnitCondition(user: TrpcUser, input: SetUnitConditionInput) {
    await this.scope.assertResourceInScope(user, input.resourceKey);

    const condition = conditionTypeSchema.parse(input.condition);
    const unusable = condition === 'Broken' || condition === 'Missing';

    await this.prisma.$transaction(async (tx) => {
      const log = await tx.conditionLog.create({
        data: {
          ResourceKey: input.resourceKey,
          LoggedBy: user.accountKey,
          Condition: condition,
          Notes: input.note ?? null,
          LoggedAt: new Date(),
        },
        select: { ConditionKey: true },
      });

      await tx.resourceInfo.update({
        where: { ResourceKey: input.resourceKey },
        data: {
          ConditionKey: log.ConditionKey,
          ...(condition === 'Missing'
            ? { ResourceStatus: 'Missing' as const }
            : {}),
          // A unit nobody can use must leave the pool, or the next borrower
          // gets handed it and the damage becomes theirs on paper.
          ...(unusable ? { AllowBorrow: false } : {}),
        },
      });
    });

    await this.audit.record(
      { accountKey: user.accountKey },
      'update',
      `unit/${input.resourceKey}`,
      `Set condition ${condition}${input.note ? `: ${input.note}` : ''}`,
    );

    return this.readUnit(input.resourceKey);
  }

  // =========================================================================
  // Rooms (T3)
  // =========================================================================

  async listManagedRooms(user: TrpcUser, input: ListManagedRoomsInput) {
    const resourceWhere = await this.resourceWhereForScope(user);
    resourceWhere.ResourceType = 'Room';
    if (input.lendable !== undefined)
      resourceWhere.AllowBorrow = input.lendable;

    const where: Prisma.RoomInfoWhereInput = { Resource: resourceWhere };
    if (input.q) {
      where.OR = [
        { RoomName: { contains: input.q, mode: 'insensitive' } },
        { RoomLocation: { contains: input.q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.roomInfo.findMany({
        where,
        orderBy: toOrderBy(input, ROOM_SORT_COLUMNS, 'RoomKey'),
        ...toSkipTake(input),
        select: ROOM_SELECT,
      }),
      this.prisma.roomInfo.count({ where }),
    ]);

    return toPage(
      rows.map((row) => this.toRoom(row)),
      total,
      input,
    );
  }

  async createRoom(user: TrpcUser, input: CreateRoomInput) {
    await this.scope.assertGroupInScope(user, input.manageGroupKey);

    // Rooms are the T3 tier by definition — the proposal has no other kind of
    // fixed-location resource, so the caller does not get to choose.
    const borrowRuleKey = await this.resolveTierRuleKey('T3');

    // Omitting hours entirely reproduces the grid every room used to share
    // (FR-EQP-04); the create input's own refine() already rejects half a pair.
    const hours: RoomHours = {
      openMinutes: input.openMinutes ?? DEFAULT_ROOM_HOURS.openMinutes,
      closeMinutes: input.closeMinutes ?? DEFAULT_ROOM_HOURS.closeMinutes,
      breakStartMinutes:
        input.breakStartMinutes !== undefined
          ? input.breakStartMinutes
          : DEFAULT_ROOM_HOURS.breakStartMinutes,
      breakEndMinutes:
        input.breakEndMinutes !== undefined
          ? input.breakEndMinutes
          : DEFAULT_ROOM_HOURS.breakEndMinutes,
    };
    assertValidRoomHours(hours);

    const resourceKey = await this.prisma.$transaction(async (tx) => {
      const resource = await tx.resourceInfo.create({
        data: {
          ManagedBy: input.manageGroupKey,
          BorrowRule: borrowRuleKey,
          ResourceStatus: 'InStorage',
          ResourceType: 'Room',
          // A room needs no turnaround time: the next booking starts when the
          // last one ends.
          BufferTime: 0,
          AllowBorrow: input.lendable,
        },
        select: { ResourceKey: true },
      });

      await tx.roomInfo.create({
        data: {
          ResourceKey: resource.ResourceKey,
          RoomName: input.name,
          RoomDesc: input.description ?? null,
          RoomLocation: input.location ?? null,
          ImageURL: this.images.toStoredUrl(input.imageUrl) ?? null,
          CreditWeight: input.creditWeight,
          Capacity: input.capacity ?? null,
          OpenTime: hours.openMinutes,
          CloseTime: hours.closeMinutes,
          BreakStart: hours.breakStartMinutes,
          BreakEnd: hours.breakEndMinutes,
        },
      });

      return resource.ResourceKey;
    });

    await this.audit.record(
      { accountKey: user.accountKey },
      'create',
      `room/${resourceKey}`,
      `Created room "${input.name}"`,
    );

    return this.readRoom(resourceKey);
  }

  async updateRoom(user: TrpcUser, input: UpdateRoomInput) {
    await this.scope.assertResourceInScope(user, input.resourceKey);

    const room = await this.prisma.roomInfo.findUnique({
      where: { ResourceKey: input.resourceKey },
      select: {
        RoomKey: true,
        OpenTime: true,
        CloseTime: true,
        BreakStart: true,
        BreakEnd: true,
      },
    });
    if (!room) {
      throw new BusinessError('RESOURCE_NOT_FOUND', {
        resourceKey: input.resourceKey,
      });
    }

    // Only re-derive and validate the hours when at least one of the four
    // fields was actually sent — an edit that only touches the name must not
    // fail because of hours nobody asked to change.
    const hoursTouched =
      input.openMinutes !== undefined ||
      input.closeMinutes !== undefined ||
      input.breakStartMinutes !== undefined ||
      input.breakEndMinutes !== undefined;
    let hoursData: Partial<
      Pick<RoomHours, 'openMinutes' | 'closeMinutes'> & {
        breakStartMinutes: number | null;
        breakEndMinutes: number | null;
      }
    > = {};
    if (hoursTouched) {
      const hours: RoomHours = {
        openMinutes: input.openMinutes ?? room.OpenTime,
        closeMinutes: input.closeMinutes ?? room.CloseTime,
        breakStartMinutes:
          input.breakStartMinutes !== undefined
            ? input.breakStartMinutes
            : room.BreakStart,
        breakEndMinutes:
          input.breakEndMinutes !== undefined
            ? input.breakEndMinutes
            : room.BreakEnd,
      };
      assertValidRoomHours(hours);
      hoursData = hours;
    }

    await this.prisma.roomInfo.update({
      where: { RoomKey: room.RoomKey },
      data: {
        ...(input.name !== undefined ? { RoomName: input.name } : {}),
        ...(input.description !== undefined
          ? { RoomDesc: input.description }
          : {}),
        ...(input.location !== undefined
          ? { RoomLocation: input.location }
          : {}),
        ...(input.imageUrl !== undefined
          ? { ImageURL: this.images.toStoredUrl(input.imageUrl) }
          : {}),
        ...(input.creditWeight !== undefined
          ? { CreditWeight: input.creditWeight }
          : {}),
        // `null` is a value here, not an absence: it is how staff take a wrong
        // capacity back out. Hence `!== undefined` rather than a truthiness
        // check, which would silently drop the clear.
        ...(input.capacity !== undefined ? { Capacity: input.capacity } : {}),
        ...(hoursTouched
          ? {
              OpenTime: hoursData.openMinutes,
              CloseTime: hoursData.closeMinutes,
              BreakStart: hoursData.breakStartMinutes,
              BreakEnd: hoursData.breakEndMinutes,
            }
          : {}),
      },
    });

    await this.audit.record(
      { accountKey: user.accountKey },
      'update',
      `room/${input.resourceKey}`,
      `Updated room${input.name !== undefined ? ` name to "${input.name}"` : ''}`,
    );

    return this.readRoom(input.resourceKey);
  }

  // =========================================================================
  // Eligibility and reference data
  // =========================================================================

  async listEligibility(user: TrpcUser, target: EligibilityTargetInput) {
    const resourceKeys = await this.scopedResourceKeysOfTarget(user, target);

    const rules = await this.prisma.eligibility.findMany({
      where: { ResourceKey: { in: resourceKeys } },
      select: {
        GroupKey: true,
        RoleKey: true,
        Role: { select: { AuthorityName: true } },
        Group: {
          select: {
            Branch: { select: { BranchName: true } },
            Club: { select: { ClubName: true } },
          },
        },
      },
    });

    // Collapse per-unit rows back into the per-type rule staff think in terms
    // of, keeping the unit count so a partially applied rule is visible. A
    // room is one resource, so each of its rules collapses to a count of 1.
    const byRule = new Map<string, ReturnType<typeof buildRule>>();
    function buildRule(row: (typeof rules)[number]) {
      return {
        groupKey: row.GroupKey,
        groupName:
          row.Group.Branch?.BranchName ?? row.Group.Club?.ClubName ?? null,
        authorityRoleKey: row.RoleKey,
        authorityRoleName: row.Role.AuthorityName,
        appliesToUnits: 0,
      };
    }

    for (const row of rules) {
      const id = `${row.GroupKey}:${row.RoleKey}`;
      const existing = byRule.get(id) ?? buildRule(row);
      existing.appliesToUnits += 1;
      byRule.set(id, existing);
    }

    return [...byRule.values()];
  }

  /**
   * Replaces the whole rule set for a type, across every unit in scope, or for
   * one room.
   */
  async setEligibility(user: TrpcUser, input: SetEligibilityInput) {
    const resourceKeys = await this.scopedResourceKeysOfTarget(user, input);

    // One transaction, because the delete on its own leaves the type open to
    // nobody — a failure between the two halves would silently withdraw an
    // item from every borrower who was entitled to it.
    await this.prisma.$transaction(async (tx) => {
      await tx.eligibility.deleteMany({
        where: { ResourceKey: { in: resourceKeys } },
      });

      if (input.rules.length === 0) return;

      await tx.eligibility.createMany({
        data: resourceKeys.flatMap((resourceKey) =>
          input.rules.map((rule) => ({
            ResourceKey: resourceKey,
            GroupKey: rule.groupKey,
            RoleKey: rule.authorityRoleKey,
          })),
        ),
        skipDuplicates: true,
      });
    });

    const target =
      'roomKey' in input ? `room/${input.roomKey}` : `item/${input.itemKey}`;
    await this.audit.record(
      { accountKey: user.accountKey },
      'update',
      target,
      `Set eligibility to ${input.rules.length} rule(s)`,
    );

    return this.listEligibility(user, input);
  }

  /** BorrowRule rows that map to T0–T3, for the tier picker in the forms. */
  async listTiers() {
    const rules = await this.prisma.borrowRule.findMany({
      select: { BorrowRuleKey: true, RuleName: true },
      orderBy: { BorrowRuleKey: 'asc' },
    });

    return (
      rules
        .map((rule) => ({
          borrowRuleKey: rule.BorrowRuleKey,
          tier: tryMapTier(rule.RuleName),
          name: rule.RuleName,
        }))
        // Rules that are not one of the four tiers exist (a department may add
        // its own); they are just not tier options.
        .filter(
          (
            option,
          ): option is {
            borrowRuleKey: number;
            tier: ResourceTier;
            name: string | null;
          } => option.tier !== null,
        )
    );
  }

  /** The departments and clubs the caller may register equipment into. */
  async listManagementGroups(user: TrpcUser) {
    const groupKeys = await this.scope.resolveGroupKeys(user);

    const groups = await this.prisma.managementGroup.findMany({
      where: groupKeys === null ? {} : { ManageGroupKey: { in: groupKeys } },
      orderBy: { ManageGroupKey: 'asc' },
      select: {
        ManageGroupKey: true,
        GroupType: true,
        Branch: { select: { BranchName: true } },
        Club: { select: { ClubName: true } },
      },
    });

    return groups.map((group) => this.toGroupRef(group));
  }

  /** AuthorityRole rows, for the eligibility editor. */
  async listAuthorityRoles() {
    const roles = await this.prisma.authorityRole.findMany({
      orderBy: { AuthorityRoleKey: 'asc' },
      select: {
        AuthorityRoleKey: true,
        AuthorityName: true,
        AuthorityLevel: true,
      },
    });

    return roles.map((role) => ({
      authorityRoleKey: role.AuthorityRoleKey,
      name: role.AuthorityName,
      level: role.AuthorityLevel,
    }));
  }

  // =========================================================================
  // Delete (FR-EQP-05) — only a record with no history
  // =========================================================================

  /** Counts that decide whether a resource has "history" for FR-EQP-05. */
  private async resourceHistoryCounts(resourceKey: number) {
    const [reservations, usageLogs, images, inspections, repairLogs] =
      await this.prisma.$transaction([
        this.prisma.reservations.count({ where: { ResourceKey: resourceKey } }),
        this.prisma.usageLog.count({ where: { ResourceKey: resourceKey } }),
        this.prisma.images.count({ where: { ResourceKey: resourceKey } }),
        this.prisma.inspection.count({ where: { ResourceKey: resourceKey } }),
        this.prisma.repairLog.count({ where: { ResourceKey: resourceKey } }),
      ]);
    return { reservations, usageLogs, images, inspections, repairLogs };
  }

  /**
   * Removes a resource with no history: its own ConditionLog, Eligibility and
   * RetirementRequest rows first (all RESTRICT-linked to ResourceInfo — see
   * schema.prisma), then the resource itself. RoomCheckRound rows cascade on
   * their own.
   *
   * RetirementRequest is cleared unconditionally, cancelled/rejected rows
   * included: a paper trail that only ever said "not retired" is not the
   * history FR-EQP-05 means to protect, and leaving it behind turned a
   * perfectly fresh unit's delete into a raw FK violation (caught live —
   * request, then cancel, then delete used to 500).
   */
  private async wipeAndDeleteResource(
    tx: Prisma.TransactionClient,
    resourceKey: number,
  ): Promise<void> {
    await tx.retirementRequest.deleteMany({
      where: { ResourceKey: resourceKey },
    });
    await tx.conditionLog.deleteMany({ where: { ResourceKey: resourceKey } });
    await tx.eligibility.deleteMany({ where: { ResourceKey: resourceKey } });
    await tx.resourceInfo.delete({ where: { ResourceKey: resourceKey } });
  }

  /** A type may be deleted only once every one of its units already has been. */
  async deleteItemType(user: TrpcUser, input: DeleteItemTypeInput) {
    // Same floor as createItemType: ItemInfo has no owner of its own, so the
    // only thing to check is that the caller administers something at all.
    await this.scope.resolveGroupKeys(user);

    const type = await this.prisma.itemInfo.findUnique({
      where: { ItemKey: input.itemKey },
      select: {
        ItemName: true,
        _count: { select: { Items: true } },
      },
    });
    if (!type) {
      throw new BusinessError('ITEM_TYPE_NOT_FOUND', {
        itemKey: input.itemKey,
      });
    }
    if (type._count.Items > 0) {
      throw new BusinessError('HAS_HISTORY', {
        itemKey: input.itemKey,
        units: type._count.Items,
      });
    }

    await this.prisma.itemInfo.delete({ where: { ItemKey: input.itemKey } });

    await this.audit.record(
      { accountKey: user.accountKey },
      'delete',
      `item/${input.itemKey}`,
      `Deleted item type "${type.ItemName}" (no units left)`,
    );

    return { itemKey: input.itemKey };
  }

  async deleteItemUnit(user: TrpcUser, input: DeleteResourceInput) {
    await this.scope.assertResourceInScope(user, input.resourceKey);

    const unit = await this.prisma.itemIndiv.findUnique({
      where: { ResourceKey: input.resourceKey },
      select: { IndivKey: true, ItemID: true },
    });
    if (!unit) {
      throw new BusinessError('RESOURCE_NOT_FOUND', {
        resourceKey: input.resourceKey,
      });
    }

    const counts = await this.resourceHistoryCounts(input.resourceKey);
    if (Object.values(counts).some((count) => count > 0)) {
      throw new BusinessError('HAS_HISTORY', {
        resourceKey: input.resourceKey,
        ...counts,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.itemIndiv.delete({ where: { IndivKey: unit.IndivKey } });
      await this.wipeAndDeleteResource(tx, input.resourceKey);
    });

    await this.audit.record(
      { accountKey: user.accountKey },
      'delete',
      `unit/${input.resourceKey}`,
      `Deleted unit, serial ${unit.ItemID} (no history)`,
    );

    return { resourceKey: input.resourceKey };
  }

  async deleteRoom(user: TrpcUser, input: DeleteResourceInput) {
    await this.scope.assertResourceInScope(user, input.resourceKey);

    const room = await this.prisma.roomInfo.findUnique({
      where: { ResourceKey: input.resourceKey },
      select: { RoomKey: true, RoomName: true },
    });
    if (!room) {
      throw new BusinessError('RESOURCE_NOT_FOUND', {
        resourceKey: input.resourceKey,
      });
    }

    const counts = await this.resourceHistoryCounts(input.resourceKey);
    if (Object.values(counts).some((count) => count > 0)) {
      throw new BusinessError('HAS_HISTORY', {
        resourceKey: input.resourceKey,
        ...counts,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.roomInfo.delete({ where: { RoomKey: room.RoomKey } });
      await this.wipeAndDeleteResource(tx, input.resourceKey);
    });

    await this.audit.record(
      { accountKey: user.accountKey },
      'delete',
      `room/${input.resourceKey}`,
      `Deleted room "${room.RoomName}" (no history)`,
    );

    return { resourceKey: input.resourceKey };
  }

  // =========================================================================
  // Retirement (FR-EQP-08) — staff requests, a supervisor decides
  // =========================================================================

  /**
   * Refuses while the resource is out on loan, or has an upcoming
   * approved/pending reservation. Same check on request and on approval — the
   * state can change in between — so `ApprovalService.decideRetirement` calls
   * this too rather than keeping its own copy.
   */
  async assertNotActive(resourceKey: number): Promise<void> {
    const now = new Date();
    const [held, upcoming] = await Promise.all([
      this.prisma.usageLog.findFirst({
        where: {
          ResourceKey: resourceKey,
          CurrentStatus: { in: HELD_USAGE_STATES },
        },
        select: { UsageKey: true, CurrentStatus: true },
      }),
      this.prisma.reservations.findFirst({
        where: {
          ResourceKey: resourceKey,
          ApproveStatus: { in: [...HOLDING_APPROVE_STATES] },
          EndTime: { gt: now },
        },
        select: { ReservationKey: true, StartTime: true, EndTime: true },
      }),
    ]);

    if (held || upcoming) {
      throw new BusinessError('RETIREMENT_BLOCKED_BY_ACTIVITY', {
        resourceKey,
        heldUsage: held
          ? { usageKey: held.UsageKey, status: held.CurrentStatus }
          : null,
        upcomingReservation: upcoming
          ? {
              reservationKey: upcoming.ReservationKey,
              startTime: toIso(upcoming.StartTime),
              endTime: toIso(upcoming.EndTime),
            }
          : null,
      });
    }
  }

  async requestRetirement(user: TrpcUser, input: RequestRetirementInput) {
    await this.scope.assertResourceInScope(user, input.resourceKey);

    const resource = await this.prisma.resourceInfo.findUnique({
      where: { ResourceKey: input.resourceKey },
      select: { ResourceStatus: true, ManagedBy: true },
    });
    if (!resource) {
      throw new BusinessError('RESOURCE_NOT_FOUND', {
        resourceKey: input.resourceKey,
      });
    }
    if (resource.ResourceStatus === 'Retired') {
      throw new BusinessError('RESOURCE_ALREADY_RETIRED', {
        resourceKey: input.resourceKey,
      });
    }

    const pending = await this.prisma.retirementRequest.findFirst({
      where: { ResourceKey: input.resourceKey, ApproveStatus: 'Pending' },
      select: { RequestKey: true },
    });
    if (pending) {
      throw new BusinessError('RETIREMENT_ALREADY_PENDING', {
        resourceKey: input.resourceKey,
        requestKey: pending.RequestKey,
      });
    }

    await this.assertNotActive(input.resourceKey);

    const requestKey = await this.prisma.$transaction(async (tx) => {
      const created = await tx.retirementRequest.create({
        data: {
          ResourceKey: input.resourceKey,
          RequestedBy: user.accountKey,
          Reason: input.reason,
          ApproveStatus: 'Pending',
        },
        select: { RequestKey: true },
      });

      const row = await tx.retirementRequest.findUniqueOrThrow({
        where: { RequestKey: created.RequestKey },
        select: RETIREMENT_REQUEST_SELECT,
      });
      const output = toRetirementRequestOutput(row);

      // FR-EQP-08: every supervisor who could act on this in
      // `approval.retirementQueue` — the same department, same role — should
      // hear about it existing, not just find it by opening the queue.
      const supervisors = await supervisorsForGroup(tx, resource.ManagedBy);
      await Promise.all(
        supervisors.map((supervisor) =>
          this.notifications.retirementRequested(tx, {
            accountKey: supervisor.AccountKey,
            requestKey: created.RequestKey,
            resourceName: output.resourceName ?? 'อุปกรณ์',
            requestedBy: output.requestedBy.name,
            reason: input.reason,
          }),
        ),
      );

      return created.RequestKey;
    });

    await this.audit.record(
      { accountKey: user.accountKey },
      'create',
      `retirement/${requestKey}`,
      `Requested retirement of resource ${input.resourceKey}: ${input.reason}`,
    );

    return this.readRetirementRequest(requestKey);
  }

  /** Withdraws a still-pending request — only the staff member who filed it may. */
  async cancelRetirement(user: TrpcUser, input: RetirementRequestIdInput) {
    const request = await this.prisma.retirementRequest.findUnique({
      where: { RequestKey: input.requestKey },
      select: { ResourceKey: true, RequestedBy: true, ApproveStatus: true },
    });
    if (!request) {
      throw new BusinessError('RETIREMENT_REQUEST_NOT_FOUND', {
        requestKey: input.requestKey,
      });
    }
    await this.scope.assertResourceInScope(user, request.ResourceKey);

    if (request.RequestedBy !== user.accountKey) {
      throw new BusinessError('NOT_YOUR_RETIREMENT_REQUEST', {
        requestKey: input.requestKey,
      });
    }
    if (request.ApproveStatus !== 'Pending') {
      throw new BusinessError('RETIREMENT_ALREADY_DECIDED', {
        requestKey: input.requestKey,
        status: request.ApproveStatus,
      });
    }

    await this.prisma.retirementRequest.update({
      where: { RequestKey: input.requestKey },
      data: { ApproveStatus: 'Canceled', DecidedAt: new Date() },
    });

    await this.audit.record(
      { accountKey: user.accountKey },
      'update',
      `retirement/${input.requestKey}`,
      'Cancelled own retirement request',
    );

    return this.readRetirementRequest(input.requestKey);
  }

  /** Shared by every retirement procedure so the output shape never drifts. */
  async readRetirementRequest(requestKey: number) {
    const row = await this.prisma.retirementRequest.findUnique({
      where: { RequestKey: requestKey },
      select: RETIREMENT_REQUEST_SELECT,
    });
    if (!row) {
      throw new BusinessError('RETIREMENT_REQUEST_NOT_FOUND', { requestKey });
    }
    return toRetirementRequestOutput(row);
  }

  // =========================================================================
  // Internals
  // =========================================================================

  /** The scope filter, optionally narrowed to one tier. */
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

  /**
   * Every unit of a type that the caller manages.
   *
   * ItemInfo has no owner column — a type is university-wide and only its units
   * belong to a department — so "may this caller touch this type" has to be
   * answered through the units. Two cases are not the same:
   *
   *   - the type has units, none of them the caller's: that is another
   *     department's equipment, and it is refused.
   *   - the type has no units at all: nobody owns it, which is exactly the
   *     state `item.createType` leaves behind. It stays editable, otherwise a
   *     type could not be corrected until stock was registered against it.
   */
  private async scopedResourceKeysOfType(
    user: TrpcUser,
    itemKey: number,
  ): Promise<number[]> {
    const resourceWhere = await this.resourceWhereForScope(user);

    const units = await this.prisma.itemIndiv.findMany({
      where: { ItemKey: itemKey, Resource: resourceWhere },
      select: { ResourceKey: true },
    });

    if (units.length > 0) return units.map((unit) => unit.ResourceKey);

    const type = await this.prisma.itemInfo.findUnique({
      where: { ItemKey: itemKey },
      select: { ItemKey: true, _count: { select: { Items: true } } },
    });

    if (!type) {
      throw new BusinessError('ITEM_TYPE_NOT_FOUND', { itemKey });
    }
    if (type._count.Items > 0) {
      throw new BusinessError('OUT_OF_MANAGEMENT_SCOPE', { itemKey });
    }

    return [];
  }

  /**
   * The room's own ResourceKey, once the caller is allowed to touch it.
   *
   * Unlike a type, a room is a single ResourceInfo with a ManagedBy of its
   * own, so there is no "nobody owns it yet" case: the ordinary one-resource
   * scope check is the whole answer.
   */
  private async scopedResourceKeysOfRoom(
    user: TrpcUser,
    roomKey: number,
  ): Promise<number[]> {
    const room = await this.prisma.roomInfo.findUnique({
      where: { RoomKey: roomKey },
      select: { ResourceKey: true },
    });

    if (!room) {
      throw new BusinessError('ROOM_NOT_FOUND', { roomKey });
    }
    await this.scope.assertResourceInScope(user, room.ResourceKey);

    return [room.ResourceKey];
  }

  private scopedResourceKeysOfTarget(
    user: TrpcUser,
    target: EligibilityTargetInput,
  ): Promise<number[]> {
    return 'roomKey' in target
      ? this.scopedResourceKeysOfRoom(user, target.roomKey)
      : this.scopedResourceKeysOfType(user, target.itemKey);
  }

  /** BorrowRule row for a tier label. */
  private async resolveTierRuleKey(tier: ResourceTier): Promise<number> {
    const rule = await this.prisma.borrowRule.findFirst({
      where: { RuleName: { equals: tier, mode: 'insensitive' } },
      select: { BorrowRuleKey: true },
    });

    if (!rule) {
      // Seed data problem: the four tiers are rows somebody has to insert.
      // Guessing a key here would silently file equipment under the wrong
      // borrowing rules, which is worse than refusing.
      throw new BusinessError('TIER_NOT_CONFIGURED', { tier });
    }

    return rule.BorrowRuleKey;
  }

  /**
   * The serials to write, one per unit requested.
   *
   * Only T2 must be given a serial: it is approved per serial (FR-REQ-07).
   * T1 is borrowed by quantity (FR-EQP-03 as amended) and T0 is counted, so
   * both get a generated tag instead of forcing staff to invent one.
   *
   * The two tracked tiers differ in how a batch may be registered. T1 arrives
   * as a box of interchangeable units, so one base serial plus a numeric
   * suffix gives every row its own addressable tag. T2 does not: §5.4 has the
   * borrower pick a specific unit by the serial printed on it, so deriving
   * "OSC-001-1", "OSC-001-2" from a single typed serial would file units under
   * tags that match nothing on the shelf, and §5.5 then quotes an
   * available-from date per those invented tags. A T2 batch is refused rather
   * than invented — staff register those one at a time, with the real tag.
   */
  private buildSerials(
    input: CreateItemUnitInput,
    itemName: string | null,
    existing: readonly string[],
  ): string[] {
    // Only T2 needs a serial typed in: it is bound to the number printed on
    // the unit, and approval is for that unit. T0 and T1 get a generated tag,
    // which is what the team decided for T1 (the audit found the code still
    // demanding one).
    if (input.tier === 'T2' && !input.serialNo) {
      throw new BusinessError('SERIAL_REQUIRED_FOR_TIER', {
        tier: input.tier,
        quantity: input.quantity,
      });
    }

    if (input.tier === 'T2' && input.quantity > 1) {
      throw new BusinessError('BULK_NOT_ALLOWED_FOR_TIER', {
        tier: input.tier,
        quantity: input.quantity,
      });
    }

    // One unit with a serial typed in is that serial, exactly.
    if (input.serialNo && input.quantity === 1) return [input.serialNo];

    const base =
      input.serialNo ??
      `${(itemName ?? 'ITEM').trim().slice(0, 12).toUpperCase().replace(/\s+/g, '-')}-${input.itemKey}`;

    // Numbering carries on from the last batch. Starting at 1 every time made
    // the second delivery of the same thing collide with the first
    // (SERIAL_ALREADY_IN_USE), so a department could never add ten more.
    const suffix = new RegExp(
      `^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`,
    );
    const highest = existing.reduce((max, id) => {
      const match = suffix.exec(id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);

    return Array.from(
      { length: input.quantity },
      (_, index) => `${base}-${highest + index + 1}`,
    );
  }

  /**
   * Refuses a serial already used by another unit of the same type.
   *
   * Checked in the service because ItemIndiv.ItemID has no unique constraint,
   * which means this is a read-then-write race: two staff registering the same
   * serial at the same moment both pass. Only the database can close that —
   * see docs/staff.md.
   */
  private async assertSerialsFree(
    itemKey: number,
    serials: string[],
    exceptIndivKey?: number,
  ): Promise<void> {
    const clash = await this.prisma.itemIndiv.findFirst({
      where: {
        ItemKey: itemKey,
        ItemID: { in: serials },
        ...(exceptIndivKey === undefined
          ? {}
          : { NOT: { IndivKey: exceptIndivKey } }),
      },
      select: { ItemID: true },
    });

    if (clash) {
      throw new BusinessError('SERIAL_ALREADY_IN_USE', {
        itemKey,
        serialNo: clash.ItemID,
      });
    }
  }

  private async readUnit(resourceKey: number) {
    const row = await this.prisma.itemIndiv.findUnique({
      where: { ResourceKey: resourceKey },
      select: UNIT_SELECT,
    });
    if (!row) {
      throw new BusinessError('RESOURCE_NOT_FOUND', { resourceKey });
    }
    return this.toItemUnit(row);
  }

  private async readRoom(resourceKey: number) {
    const row = await this.prisma.roomInfo.findUnique({
      where: { ResourceKey: resourceKey },
      select: ROOM_SELECT,
    });
    if (!row) {
      throw new BusinessError('RESOURCE_NOT_FOUND', { resourceKey });
    }
    return this.toRoom(row);
  }

  private toItemTypeSummary(
    row: {
      ItemKey: number;
      ItemName: string | null;
      ItemDesc: string | null;
      ImageURL: string | null;
      CreditWeight: number;
      Price: number | null;
    },
    units: UnitRow[],
  ) {
    const tiers = [
      ...new Set(
        units
          .map((unit) => tryMapTier(unit.Resource.BorrowRuleInfo.RuleName))
          .filter((tier): tier is ResourceTier => tier !== null),
      ),
    ];

    return {
      id: row.ItemKey,
      name: row.ItemName,
      description: row.ItemDesc,
      imageUrl: this.images.toPublicUrl(row.ImageURL),
      creditWeight: row.CreditWeight,
      tiers,
      totalUnits: units.length,
      availableUnits: units.filter((unit) => this.isAvailable(unit)).length,
      price: row.Price ?? null,
      suggestedTier: suggestTierFromPrice(row.Price),
    };
  }

  /** On the shelf, offered for loan, and not already spoken for. */
  private isAvailable(unit: UnitRow): boolean {
    return (
      unit.Resource.ResourceStatus === 'InStorage' &&
      unit.Resource.AllowBorrow &&
      unit.Resource.UsageLogs.length === 0
    );
  }

  private toItemUnit(row: UnitRow) {
    const condition = row.Resource.CurrentCondition;

    return {
      resourceKey: row.Resource.ResourceKey,
      indivKey: row.IndivKey,
      itemKey: row.ItemKey,
      serialNo: row.ItemID,
      imageUrl: this.images.toPublicUrl(row.ImageURL),
      tier: tryMapTier(row.Resource.BorrowRuleInfo.RuleName),
      status: row.Resource.ResourceStatus,
      lendable: row.Resource.AllowBorrow,
      prepDays: row.Resource.BufferTime,
      condition: condition?.Condition ?? null,
      conditionNote: condition?.Notes ?? null,
      conditionLoggedAt: toIsoNullable(condition?.LoggedAt ?? null),
      managementGroup: this.toGroupRef(row.Resource.ManagementGroup),
      currentDueAt: toIsoNullable(row.Resource.UsageLogs[0]?.DueTime ?? null),
    };
  }

  private toRoom(row: RoomRow) {
    return {
      resourceKey: row.Resource.ResourceKey,
      roomKey: row.RoomKey,
      name: row.RoomName,
      description: row.RoomDesc,
      location: row.RoomLocation,
      imageUrl: this.images.toPublicUrl(row.ImageURL),
      creditWeight: row.CreditWeight,
      capacity: row.Capacity,
      tier: tryMapTier(row.Resource.BorrowRuleInfo.RuleName),
      status: row.Resource.ResourceStatus,
      lendable: row.Resource.AllowBorrow,
      condition: row.Resource.CurrentCondition?.Condition ?? null,
      managementGroup: this.toGroupRef(row.Resource.ManagementGroup),
      openMinutes: row.OpenTime,
      closeMinutes: row.CloseTime,
      breakStartMinutes: row.BreakStart,
      breakEndMinutes: row.BreakEnd,
    };
  }

  /**
   * ManagementGroup -> the reference the contract carries.
   *
   * Not flattened to a "departmentId": the schema splits BranchInfo (ภาควิชา)
   * from ClubInfo (ชมรม) behind one group, and collapsing them would lose
   * which of the two a piece of equipment belongs to.
   */
  private toGroupRef(group: GroupRow) {
    return {
      id: group.ManageGroupKey,
      name: group.Branch?.BranchName ?? group.Club?.ClubName ?? null,
      type: group.GroupType,
    };
  }
}
