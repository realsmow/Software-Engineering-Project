import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { StaffScopeService } from '../common/authority/staff-scope.service';
import { ImageService } from '../image/image.service';
import {
  HELD_USAGE_STATES,
  UNAVAILABLE_USAGE_STATES,
} from '../common/usage/usage-states';
import { BusinessError } from '../common/errors/business-error';
import { toIsoNullable } from '../common/schemas/datetime.schema';
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
  ListManagedItemsInput,
  ListManagedRoomsInput,
  ListManagedUnitsInput,
  SetTypeEligibilityInput,
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

  async createItemType(input: CreateItemTypeInput) {
    const created = await this.prisma.itemInfo.create({
      data: {
        ItemName: input.name,
        ItemDesc: input.description ?? null,
        ImageURL: this.images.toStoredUrl(input.imageUrl) ?? null,
        CreditWeight: input.creditWeight,
      },
      select: {
        ItemKey: true,
        ItemName: true,
        ItemDesc: true,
        ImageURL: true,
        CreditWeight: true,
      },
    });

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

    await this.prisma.itemInfo.update({
      where: { ItemKey: input.itemKey },
      data,
    });

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
    const serials = this.buildSerials(input, itemType.ItemName);
    await this.assertSerialsFree(input.itemKey, serials);

    const created = await this.prisma.$transaction(async (tx) => {
      const keys: number[] = [];

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

      return keys;
    });

    const rows = await this.prisma.itemIndiv.findMany({
      where: { ResourceKey: { in: created } },
      orderBy: { IndivKey: 'asc' },
      select: UNIT_SELECT,
    });

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
        },
      });

      return resource.ResourceKey;
    });

    return this.readRoom(resourceKey);
  }

  async updateRoom(user: TrpcUser, input: UpdateRoomInput) {
    await this.scope.assertResourceInScope(user, input.resourceKey);

    const room = await this.prisma.roomInfo.findUnique({
      where: { ResourceKey: input.resourceKey },
      select: { RoomKey: true },
    });
    if (!room) {
      throw new BusinessError('RESOURCE_NOT_FOUND', {
        resourceKey: input.resourceKey,
      });
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
      },
    });

    return this.readRoom(input.resourceKey);
  }

  // =========================================================================
  // Eligibility and reference data
  // =========================================================================

  async listTypeEligibility(user: TrpcUser, itemKey: number) {
    const resourceKeys = await this.scopedResourceKeysOfType(user, itemKey);

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
    // of, keeping the unit count so a partially applied rule is visible.
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

  /** Replaces the whole rule set for a type, across every unit in scope. */
  async setTypeEligibility(user: TrpcUser, input: SetTypeEligibilityInput) {
    const resourceKeys = await this.scopedResourceKeysOfType(
      user,
      input.itemKey,
    );

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

    return this.listTypeEligibility(user, input.itemKey);
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
   * T1 and T2 are tracked per unit, so a serial is mandatory (proposal §5.4:
   * "หมายเลขประจำอุปกรณ์ (Serial Number): ติดบนอุปกรณ์ระดับ T1–T2"). T0 is
   * counted, not tracked, so a readable placeholder is generated instead of
   * forcing staff to invent one for each jumper wire.
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
  ): string[] {
    const needsSerial = input.tier === 'T1' || input.tier === 'T2';

    if (needsSerial && !input.serialNo) {
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

    const base =
      input.serialNo ??
      `${(itemName ?? 'ITEM').trim().slice(0, 12).toUpperCase().replace(/\s+/g, '-')}-${input.itemKey}`;

    if (input.quantity === 1) return [input.serialNo ?? `${base}-1`];

    // T0/T1 only, per the guard above. Suffixed rather than repeated:
    // ItemIndiv.ItemID is how a staff member tells two boxes apart at the
    // counter, and two rows reading "ARDUINO-7" make allocation a guess.
    return Array.from(
      { length: input.quantity },
      (_, index) => `${base}-${index + 1}`,
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
      tier: tryMapTier(row.Resource.BorrowRuleInfo.RuleName),
      status: row.Resource.ResourceStatus,
      lendable: row.Resource.AllowBorrow,
      condition: row.Resource.CurrentCondition?.Condition ?? null,
      managementGroup: this.toGroupRef(row.Resource.ManagementGroup),
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
