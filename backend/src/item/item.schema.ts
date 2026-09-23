import { z } from 'zod';
import { dbId } from '../common/schemas/id.schema';
import {
  paginated,
  paginationInput,
} from '../common/schemas/pagination.schema';
import {
  isoDate,
  isoDateTime,
  isoDateTimeNullable,
} from '../common/schemas/datetime.schema';
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
  itemKey: dbId,
});
export const resourceIdInput = z.object({
  resourceKey: dbId,
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
  manageGroupKey: dbId,
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
  /**
   * RoomInfo.Capacity — how many people it seats.
   *
   * Null means nobody has recorded it, not "seats nobody". Every room created
   * before the column existed reads null, and the list renders "-" rather than
   * a zero that looks measured.
   */
  capacity: z.number().int().nullable(),
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
  manageGroupKey: dbId,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(200).optional(),
  imageUrl: imageUrl.optional(),
  /** T3 is not credit-bearing in the proposal, so this defaults to zero. */
  creditWeight: z.number().min(0).max(1000).default(0),
  /**
   * Seats. Optional rather than required: staff registering a room they have
   * not measured should record the room now and the number when they know it,
   * instead of typing a placeholder that nothing afterwards can tell from a
   * real figure. The database refuses zero and below either way.
   */
  capacity: z.number().int().positive().max(10000).optional(),
  lendable: z.boolean().default(true),
});
export type CreateRoomInput = z.infer<typeof createRoomInput>;

export const updateRoomInput = resourceIdInput.extend({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(200).optional(),
  imageUrl: imageUrl.optional(),
  creditWeight: z.number().min(0).max(1000).optional(),
  /**
   * `null` clears it, an omitted field leaves it alone.
   *
   * The two have to be distinguishable here in a way they do not for the other
   * fields: "we measured it and it was wrong" is a real edit, and without an
   * explicit null there would be no way to take a bad number back out.
   */
  capacity: z.number().int().positive().max(10000).nullable().optional(),
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
  /**
   * How many of the type's units carry this rule, which should equal
   * totalUnits. Always 1 for a room, which is a single resource.
   */
  appliesToUnits: z.number().int().min(0),
});

/**
 * What a rule set is attached to: every in-scope unit of an item type, or one
 * room (RoomInfo.RoomKey, the same key `roomAvailability` takes).
 *
 * `xor` rather than two optional keys, so a call naming both, or neither, is
 * refused instead of quietly picking one.
 */
const roomKeyInput = z.object({ roomKey: dbId });

export const eligibilityTargetInput = z.xor([itemTypeIdInput, roomKeyInput]);
export type EligibilityTargetInput = z.infer<typeof eligibilityTargetInput>;

/**
 * The complete rule set for the target. Rules missing from the list are
 * removed, so sending an empty array closes the type or room to everyone,
 * which is a real thing staff want and the reason this is not a partial update.
 */
const eligibilityRulesInput = z
  .array(
    z.object({
      groupKey: dbId,
      authorityRoleKey: dbId,
    }),
  )
  .max(200);

export const setEligibilityInput = z.xor([
  itemTypeIdInput.extend({ rules: eligibilityRulesInput }),
  roomKeyInput.extend({ rules: eligibilityRulesInput }),
]);
export type SetEligibilityInput = z.infer<typeof setEligibilityInput>;

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

/**
 * The period a borrower is shopping for. Both or neither: availability for a
 * window with only one end is not a question anybody is asking.
 *
 * Optional, and absent means "right now", which is what the catalogue meant
 * before a borrower could pick dates. Checked against end > start in the
 * service, where the error can carry the business code.
 */
export const availabilityWindow = z.object({
  startTime: isoDateTime.optional(),
  endTime: isoDateTime.optional(),
});

export const itemIdInput = z.object({ id: dbId });

/** One item's units, optionally judged against a requested period. */
export const listUnitsInput = itemIdInput.extend(availabilityWindow.shape);
export type ListUnitsInput = z.infer<typeof listUnitsInput>;
export const roomIdInput = z.object({ id: dbId });

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
   * When the type is next lendable again: the earliest return date of a
   * borrowed unit *plus* that unit's prep days (proposal §5.5), which is why
   * it can land later than any `dueAt` shown on the units. null when something
   * is already free, or when nothing is on loan at all.
   */
  nextAvailableAt: z.iso.datetime().nullable(),

  /** ResourceInfo.BufferTime — days needed to prepare the item before pickup. */
  prepDays: z.number().int().min(0),
  /** False when no unit is open for borrowing (ResourceInfo.AllowBorrow). */
  allowBorrow: z.boolean(),

  /**
   * Whether the caller may borrow this at all: they hold a (group, role) pair
   * that an Eligibility rule on at least one unit names. The same comparison
   * loan.create makes, so the catalogue stops offering what a request would
   * refuse with NOT_ELIGIBLE.
   *
   * Not the seniority floor (MinimumAuthorityLevel). That depends on the
   * borrower's credit tier against each unit's BorrowRule, and a request can
   * still be refused for it with reason AUTHORITY_LEVEL_TOO_LOW.
   */
  eligible: z.boolean(),

  owner: ownerGroup.nullable(),
});

export const itemUnit = z.object({
  id: z.number().int(),
  /** ResourceInfo.ResourceKey - pass this to loan.create. */
  resourceKey: z.number().int(),
  /** ItemIndiv.ItemID — the asset tag printed on the unit */
  assetTag: z.string(),
  imageUrl: z.string().nullable(),
  status: resourceStatus,
  allowBorrow: z.boolean(),
  /** ConditionLog.Condition of the unit's current condition record */
  condition: conditionType.nullable(),
  /** Due date of the loan holding this unit, when it is out */
  dueAt: z.iso.datetime().nullable(),
  /**
   * When this unit can go out again: its due date plus the prep days staff
   * need (ResourceInfo.BufferTime), per proposal 5.5. Null while it is on the
   * shelf. Without this a unit out on loan read as "available now".
   */
  nextAvailableAt: z.iso.datetime().nullable(),
  /**
   * Present only when a window was asked for: whether this unit could be
   * booked for it, by the same rule loan.create enforces.
   */
  availableForWindow: z.boolean().optional(),
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
    ownerGroupKey: dbId.optional(),
    /** Hide anything with no unit free right now, or in the window when given. */
    availableOnly: z.boolean().default(false),
  })
  .extend(availabilityWindow.shape);

export const paginatedItems = paginated(itemSummary);

// ---------------------------------------------------------------------------
// Rooms — borrower-facing search
// ---------------------------------------------------------------------------

/**
 * A bookable room or space.
 *
 * Thinner than the frontend's mock Room on purpose — `type` (lab/meet/lect/
 * shop) and `buildingId` have no columns in RoomInfo, and `location` is the
 * free-text RoomLocation, which is the closest thing the schema has to a
 * building. See docs/auth-admin.md.
 *
 * `capacity` is no longer among the missing: it is a real column as of the
 * `room_capacity` migration. The free-slot counts are not a column and never
 * will be — `item.roomAvailability` derives them from the day's bookings.
 */
export const roomSummary = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  imageUrl: z.string().nullable(),

  /** RoomInfo.Capacity — seats, or null when nobody has recorded it. */
  capacity: z.number().int().nullable(),

  /** Null when the room sits on a BorrowRule outside T0–T3. */
  tier: resourceTier.nullable(),
  creditWeight: z.number(),

  /** Room-level equivalent of stockStatus: is it open for booking right now? */
  status: resourceStatus,
  allowBorrow: z.boolean(),
  bookable: z.boolean(),

  owner: ownerGroup.nullable(),
});

/**
 * One half-hour of a room's day, as the chip strip renders it.
 *
 * `index` is the position in `ROOM_SLOTS`, and it is what `loan.create` takes
 * back: the borrower picked chips, and sending back the indices they picked is
 * a shorter round trip than two instants the client has to build in the right
 * timezone. `startTime`/`endTime` are the same slot as instants, so a client
 * that would rather work in absolute time does not have to reimplement the
 * conversion (ว-08).
 */
export const roomSlotOutput = z.object({
  index: z.number().int().min(0),
  /** Local wall clock at the counter, `"07:00"` — the chip's label. */
  start: z.string(),
  end: z.string(),
  startTime: isoDateTime,
  endTime: isoDateTime,
  /** False when a booking already covers any part of it, or it has passed. */
  available: z.boolean(),
});

/**
 * A room's bookable day.
 *
 * The date comes in as `YYYY-MM-DD` and means a day at the counter, in Bangkok
 * — not a UTC day (ว-08). Sending an instant instead would make "which day is
 * this" depend on what time of day the client asked.
 */
export const roomAvailabilityInput = z.object({
  roomKey: dbId,
  date: isoDate,
});
export type RoomAvailabilityInput = z.infer<typeof roomAvailabilityInput>;

export const roomAvailabilityOutput = z.object({
  roomKey: z.number().int(),
  date: isoDate,
  slots: z.array(roomSlotOutput),
  /** Echoed so the client's "เลือกได้สูงสุด N ช่วง" line cannot drift from the rule. */
  maxSlotsPerBooking: z.number().int().positive(),
  slotMinutes: z.number().int().positive(),
});

export const roomSortKey = z.enum(['name', 'location', 'creditWeight']);

export const listRoomsInput = paginationInput
  .omit({ sort: true, order: true })
  .extend({
    /** Matches room name, description and location. */
    sort: roomSortKey.default('name'),
    ownerGroupKey: dbId.optional(),
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

export type ListItemsInput = z.infer<typeof listItemsInput>;
export type ListRoomsInput = z.infer<typeof listRoomsInput>;
export type ItemSummary = z.infer<typeof itemSummary>;
export type ItemDetail = z.infer<typeof itemDetail>;
export type RoomSummary = z.infer<typeof roomSummary>;
