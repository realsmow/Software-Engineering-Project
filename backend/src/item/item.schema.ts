import { z } from 'zod';
import {
  paginated,
  paginationInput,
} from '../common/schemas/pagination.schema';
import { equipmentTier } from '../common/schemas/status.schema';

/**
 * Catalogue schemas — what a borrower sees when searching for something to
 * borrow. Read-only; nothing here books or reserves anything.
 */

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

  tier: equipmentTier,
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
  status: z.enum(['InStorage', 'Lended', 'Missing']),
  allowBorrow: z.boolean(),
  /** ConditionLog.Condition of the unit's current condition record */
  condition: z
    .enum(['Normal', 'MinorDamage', 'MajorDamage', 'Broken', 'Missing'])
    .nullable(),
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
    tier: equipmentTier.optional(),
    /** ManagementGroup.ManageGroupKey — the owning department or club */
    ownerGroupKey: z.number().int().positive().optional(),
    /** Hide anything with no unit free right now. */
    availableOnly: z.boolean().default(false),
  });

export const paginatedItems = paginated(itemSummary);

// ---------------------------------------------------------------------------
// Rooms
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

  tier: equipmentTier,
  creditWeight: z.number(),

  /** Room-level equivalent of stockStatus: is it open for booking right now? */
  status: z.enum(['InStorage', 'Lended', 'Missing']),
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
