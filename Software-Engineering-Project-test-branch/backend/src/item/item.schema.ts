import { z } from 'zod';
import {
  paginated,
  paginationInput,
} from '../common/schemas/pagination.schema';
import { isoDateTimeNullable } from '../common/schemas/datetime.schema';
import { imageUrl } from '../common/schemas/image.schema';
import {
  conditionType,
  resourceStatus,
  resourceTier,
} from '../common/schemas/status.schema';

/**
 * The catalogue, from the staff side (proposal §5.9 "งานตั้งค่าเริ่มต้น").
 *
 * Borrower-facing reads (`item.list`, `item.getById`, `item.availability` in
 * CONTRACT.md) are deliberately absent — they belong to the borrower slice and
 * will be added to the same router by whoever owns it. Everything here is
 * gated by StaffMiddleware and scoped to the caller's department.
 *
 * Two shapes of the schema drive the naming below:
 *
 *  - There is no tier column. A tier is a BorrowRule row, and BorrowRule hangs
 *    off ResourceInfo, i.e. off each individual unit. A "type" (ItemInfo)
 *    therefore has no tier of its own; it has whatever tiers its units have.
 *  - Rooms are not items. A room is a ResourceInfo of ResourceType.Room with a
 *    RoomInfo beside it, so it gets its own procedures rather than being
 *    squeezed into the item shape.
 */

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

export const itemTypeIdInput = z.object({
  itemKey: z.number().int().positive(),
});
export const resourceIdInput = z.object({
  resourceKey: z.number().int().positive(),
});

/** The department or club that owns a unit (ResourceInfo.ManagedBy). */
export const managementGroupRef = z.object({
  id: z.number().int(),
  name: z.string().nullable(),
  type: z.enum(['Club', 'Faculty']),
});

// ---------------------------------------------------------------------------
// Item types (ItemInfo)
// ---------------------------------------------------------------------------

export const itemTypeSummary = z.object({
  id: z.number().int(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  /** Absolute and ready for an `<img src>`; stored as a relative path. */
  imageUrl: z.string().nullable(),
  /** ItemInfo.CreditWeight — the credit value used to size a damage penalty. */
  creditWeight: z.number(),
  /**
   * Distinct tiers among this type's units, in the caller's scope.
   *
   * An array, not a single value, because nothing in the schema stops two
   * units of one type from sitting on different BorrowRules. Almost always one
   * element; more than one is a data problem worth showing rather than hiding.
   */
  tiers: z.array(resourceTier),
  totalUnits: z.number().int().min(0),
  /** Units in storage, lendable, and not currently held by anyone. */
  availableUnits: z.number().int().min(0),
});

export const paginatedItemTypes = paginated(itemTypeSummary);

export const listManagedItemsInput = paginationInput.extend({
  tier: resourceTier.optional(),
  /** Only types with at least one unit free right now. */
  availableOnly: z.boolean().default(false),
});
export type ListManagedItemsInput = z.infer<typeof listManagedItemsInput>;

/** One physical unit — an ItemIndiv row and the ResourceInfo behind it. */
export const itemUnitOutput = z.object({
  resourceKey: z.number().int(),
  indivKey: z.number().int(),
  itemKey: z.number().int(),
  /** ItemIndiv.ItemID — the serial printed on the sticker (T1/T2). */
  serialNo: z.string(),
  /** Absolute and ready for an `<img src>`; stored as a relative path. */
  imageUrl: z.string().nullable(),
  tier: resourceTier.nullable(),
  status: resourceStatus,
  /** ResourceInfo.AllowBorrow — false while under maintenance or withdrawn. */
  lendable: z.boolean(),
  /** ResourceInfo.BufferTime — days staff need to prepare it between loans. */
  prepDays: z.number().int().min(0),
  condition: conditionType.nullable(),
  conditionNote: z.string().nullable(),
  conditionLoggedAt: isoDateTimeNullable,
  managementGroup: managementGroupRef,
  /** Set while the unit is out; null when it is on the shelf. */
  currentDueAt: isoDateTimeNullable,
});

export const itemTypeDetail = itemTypeSummary.extend({
  units: z.array(itemUnitOutput),
});

export const createItemTypeInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  imageUrl: imageUrl.optional(),
  /**
   * Credit value of one unit (proposal §5.4: T0 = 0, T1 = 5, T2 = 10).
   *
   * Taken from the caller rather than derived from the tier, because the
   * proposal calls these figures an approximation of price and expects them to
   * be tuned per item.
   */
  creditWeight: z.number().min(0).max(1000),
});
export type CreateItemTypeInput = z.infer<typeof createItemTypeInput>;

export const updateItemTypeInput = itemTypeIdInput.extend({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  imageUrl: imageUrl.optional(),
  creditWeight: z.number().min(0).max(1000).optional(),
});
export type UpdateItemTypeInput = z.infer<typeof updateItemTypeInput>;

// ---------------------------------------------------------------------------
// Units (ItemIndiv + ResourceInfo)
// ---------------------------------------------------------------------------

export const listManagedUnitsInput = itemTypeIdInput.extend({
  status: resourceStatus.optional(),
  lendable: z.boolean().optional(),
});
export type ListManagedUnitsInput = z.infer<typeof listManagedUnitsInput>;

export const createItemUnitInput = itemTypeIdInput.extend({
  /** The department that will own the unit. Must be one the caller has authority in. */
  manageGroupKey: z.number().int().positive(),
  tier: resourceTier,
  /**
   * The sticker serial. Required for T1 and T2, which are tracked per unit;
   * for T0 the field is a bulk label, so it may repeat and is generated when
   * omitted.
   */
  serialNo: z.string().trim().min(1).max(100).optional(),
  imageUrl: imageUrl.optional(),
  /** Days between a return and the next loan (ResourceInfo.BufferTime). */
  prepDays: z.number().int().min(0).max(30).default(0),
  /** Off means registered but not offered yet — e.g. waiting on a check. */
  lendable: z.boolean().default(true),
  /**
   * How many identical units to register. T0 and T1 arrive in batches; the
   * serial gets a numeric suffix per unit so each row is still addressable.
   */
  quantity: z.number().int().min(1).max(200).default(1),
});
export type CreateItemUnitInput = z.infer<typeof createItemUnitInput>;

export const updateItemUnitInput = resourceIdInput.extend({
  serialNo: z.string().trim().min(1).max(100).optional(),
  imageUrl: imageUrl.optional(),
  tier: resourceTier.optional(),
  prepDays: z.number().int().min(0).max(30).optional(),
});
export type UpdateItemUnitInput = z.infer<typeof updateItemUnitInput>;

/**
 * Take a unit out of the pool, or put it back (proposal §5.9 "ปรับสถานะชั่วคราว").
 *
 * A flag on ResourceInfo rather than a delete, because the unit still has
 * history — past loans, past damage — that must survive it going away for
 * repair. Refused while someone is holding it: the borrower still has to be
 * able to return the thing.
 */
export const setUnitLendableInput = resourceIdInput.extend({
  lendable: z.boolean(),
  /** Written to ConditionLog.Notes so the reason survives with the unit. */
  reason: z.string().trim().max(500).optional(),
});
export type SetUnitLendableInput = z.infer<typeof setUnitLendableInput>;

/** Report a unit as physically gone, without a loan attached to blame. */
export const setUnitConditionInput = resourceIdInput.extend({
  condition: conditionType,
  note: z.string().trim().max(500).optional(),
});
export type SetUnitConditionInput = z.infer<typeof setUnitConditionInput>;

// ---------------------------------------------------------------------------
// Rooms (RoomInfo + ResourceInfo) — T3, the fixed-location tier
// ---------------------------------------------------------------------------

export const roomOutput = z.object({
  resourceKey: z.number().int(),
  roomKey: z.number().int(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  /** Absolute and ready for an `<img src>`; stored as a relative path. */
  imageUrl: z.string().nullable(),
  creditWeight: z.number(),
  tier: resourceTier.nullable(),
  status: resourceStatus,
  lendable: z.boolean(),
  condition: conditionType.nullable(),
  managementGroup: managementGroupRef,
});

export const paginatedManagedRooms = paginated(roomOutput);

export const listManagedRoomsInput = paginationInput.extend({
  lendable: z.boolean().optional(),
});
export type ListManagedRoomsInput = z.infer<typeof listManagedRoomsInput>;

export const createRoomInput = z.object({
  manageGroupKey: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(200).optional(),
  imageUrl: imageUrl.optional(),
  /** T3 is not credit-bearing in the proposal, so this defaults to zero. */
  creditWeight: z.number().min(0).max(1000).default(0),
  lendable: z.boolean().default(true),
});
export type CreateRoomInput = z.infer<typeof createRoomInput>;

export const updateRoomInput = resourceIdInput.extend({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(200).optional(),
  imageUrl: imageUrl.optional(),
  creditWeight: z.number().min(0).max(1000).optional(),
});
export type UpdateRoomInput = z.infer<typeof updateRoomInput>;

// ---------------------------------------------------------------------------
// Eligibility (who may borrow a thing) and reference data for the forms
// ---------------------------------------------------------------------------

/**
 * One "this group, in this role, may borrow this unit" rule.
 *
 * Eligibility keys on ResourceKey, so a rule belongs to a unit rather than a
 * type. The type-level procedures below fan a rule out across every unit of
 * the type in one transaction, which is what staff mean when they say "third
 * years may borrow the Arduinos".
 */
export const eligibilityRule = z.object({
  groupKey: z.number().int(),
  groupName: z.string().nullable(),
  authorityRoleKey: z.number().int(),
  authorityRoleName: z.string(),
  /** How many of the type's units carry this rule — should equal totalUnits. */
  appliesToUnits: z.number().int().min(0),
});

export const setTypeEligibilityInput = itemTypeIdInput.extend({
  /**
   * The complete rule set for this type. Rules missing from the list are
   * removed, so sending an empty array closes the type to everyone — which is
   * a real thing staff want, and the reason this is not a partial update.
   */
  rules: z
    .array(
      z.object({
        groupKey: z.number().int().positive(),
        authorityRoleKey: z.number().int().positive(),
      }),
    )
    .max(200),
});
export type SetTypeEligibilityInput = z.infer<typeof setTypeEligibilityInput>;

/** BorrowRule rows that map to T0–T3, for the tier picker. */
export const tierOptionOutput = z.object({
  borrowRuleKey: z.number().int(),
  tier: resourceTier,
  name: z.string().nullable(),
});

/** Groups the caller may register equipment into — everything for an admin. */
export const managementGroupOptionOutput = managementGroupRef;

/** AuthorityRole rows, for the eligibility editor. */
export const authorityRoleOptionOutput = z.object({
  authorityRoleKey: z.number().int(),
  name: z.string(),
  level: z.number().int().nullable(),
});

// ===========================================================================
// Borrower-facing catalogue (CONTRACT.md `item.list` / `getById` /
// `availability`) — merged in from the auth-admin slice.
//
// Kept in the same file and the same router as the staff half, per ว-05
// (group by domain, not by role; gate with middleware). The two sets of names
// were chosen not to collide: `list` / `getById` here, `listManaged` /
// `getManagedById` above.
// ===========================================================================

export const itemIdInput = z.object({ id: z.number().int().positive() });
export const roomIdInput = z.object({ id: z.number().int().positive() });

/**
 * Who owns the thing. Same shape the admin domain uses for an account's
 * group, because it is the same table (ManagementGroup -> Branch | Club).
 */
export const ownerGroup = z.object({
  id: z.number().int(),
  name: z.string().nullable(),
  type: z.enum(['Club', 'Faculty']),
});

/**
 * Stock state for the filter rail. Derived, not stored:
 *   ok          — at least one unit free to borrow right now
 *   queue       — units exist and are borrowable, but all are out
 *   maintenance — nothing borrowable: every unit is missing, or AllowBorrow
 *                 is off across the board
 */
export const stockStatus = z.enum(['ok', 'queue', 'maintenance']);

export const itemSummary = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),

  /**
   * Null for a type with no units registered yet, or whose units all sit on a
   * BorrowRule that is not one of T0–T3. A tier belongs to a unit
   * (ResourceInfo.BorrowRule), not to the type — see status.schema.ts.
   */
  tier: resourceTier.nullable(),
  creditWeight: z.number(),

  totalUnits: z.number().int().min(0),
  availableUnits: z.number().int().min(0),
  stockStatus,

  /**
   * When the earliest currently-borrowed unit is due back. null when
   * something is already free, or when nothing is on loan at all.
   */
  nextAvailableAt: z.iso.datetime().nullable(),

  /** ResourceInfo.BufferTime — days needed to prepare the item before pickup. */
  prepDays: z.number().int().min(0),
  /** False when no unit is open for borrowing (ResourceInfo.AllowBorrow). */
  allowBorrow: z.boolean(),

  owner: ownerGroup.nullable(),
});

export const itemUnit = z.object({
  id: z.number().int(),
  /** ItemIndiv.ItemID — the asset tag printed on the unit */
  assetTag: z.string(),
  imageUrl: z.string().nullable(),
  status: resourceStatus,
  allowBorrow: z.boolean(),
  /** ConditionLog.Condition of the unit's current condition record */
  condition: conditionType.nullable(),
  /** Due date of the loan holding this unit, when it is out */
  dueAt: z.iso.datetime().nullable(),
});

export const itemDetail = itemSummary.extend({
  units: z.array(itemUnit),
});

/**
 * Sort keys the catalogue offers, matching the frontend's own control
 * (catalog-page.tsx: avail | name | popular).
 *
 *   available   — most free units first. NOT sortable in SQL (Prisma cannot
 *                 order by a *filtered* relation count), so the service pays
 *                 for it differently; see item.service.ts.
 *   name        — Thai alphabetical
 *   popular     — most units held, as a stand-in for demand until loan
 *                 history is available to count
 *   creditWeight— cheapest first
 */
export const itemSortKey = z.enum([
  'available',
  'name',
  'popular',
  'creditWeight',
]);

/**
 * `order` is omitted rather than inherited: the catalogue offers a sort
 * dropdown with no direction toggle, and each key below has exactly one
 * direction that means anything (most available first, A-Z, most units first,
 * cheapest first). Accepting `order` would imply a control that does not
 * exist.
 */
export const listItemsInput = paginationInput
  .omit({ sort: true, order: true })
  .extend({
    /** Matches item name, description, and the asset tag of any of its units. */
    sort: itemSortKey.default('available'),
    tier: resourceTier.optional(),
    /** ManagementGroup.ManageGroupKey — the owning department or club */
    ownerGroupKey: z.number().int().positive().optional(),
    /** Hide anything with no unit free right now. */
    availableOnly: z.boolean().default(false),
  });

export const paginatedItems = paginated(itemSummary);

// ---------------------------------------------------------------------------
// Rooms — borrower-facing search
// ---------------------------------------------------------------------------

/**
 * A bookable room or space.
 *
 * Thinner than the frontend's mock Room on purpose — `type` (lab/meet/lect/
 * shop), `capacity`, `buildingId` and the free-slot counts have no columns in
 * RoomInfo. `location` is the free-text RoomLocation, which is the closest
 * thing the schema has to a building. See docs/auth-admin.md.
 */
export const roomSummary = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  imageUrl: z.string().nullable(),

  /** Null when the room sits on a BorrowRule outside T0–T3. */
  tier: resourceTier.nullable(),
  creditWeight: z.number(),

  /** Room-level equivalent of stockStatus: is it open for booking right now? */
  status: resourceStatus,
  allowBorrow: z.boolean(),
  bookable: z.boolean(),

  owner: ownerGroup.nullable(),
});

export const roomSortKey = z.enum(['name', 'location', 'creditWeight']);

export const listRoomsInput = paginationInput
  .omit({ sort: true, order: true })
  .extend({
    /** Matches room name, description and location. */
    sort: roomSortKey.default('name'),
    ownerGroupKey: z.number().int().positive().optional(),
    /** Hide rooms that are not open for booking. */
    bookableOnly: z.boolean().default(false),
  });

export const paginatedRooms = paginated(roomSummary);

// ---------------------------------------------------------------------------
// Availability — the one procedure the catalogue polls (10-15s)
// ---------------------------------------------------------------------------

/**
 * Deliberately tiny. This is polled every 10-15 seconds per open item page,
 * so every extra field is paid for repeatedly and forever.
 */
export const availabilityOutput = z.object({
  availableUnits: z.number().int().min(0),
  totalUnits: z.number().int().min(0),
  nextAvailableAt: z.iso.datetime().nullable(),
});

/**
 * Equipment category (instrument / tool / board in the frontend's mock).
 *
 * Declared so the contract is complete and the catalogue's category filter can
 * be written against it, but the service cannot answer: ItemInfo has no
 * category column and there is no category table. See docs/auth-admin.md.
 */
export const itemCategory = z.object({
  id: z.number().int(),
  name: z.string(),
});

export type ListItemsInput = z.infer<typeof listItemsInput>;
export type ListRoomsInput = z.infer<typeof listRoomsInput>;
export type ItemSummary = z.infer<typeof itemSummary>;
export type ItemDetail = z.infer<typeof itemDetail>;
export type RoomSummary = z.infer<typeof roomSummary>;
