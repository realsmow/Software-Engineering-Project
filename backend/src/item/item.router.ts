import { z } from 'zod';
import {
  Ctx,
  Input,
  Mutation,
  Query,
  Router,
  UseMiddlewares,
} from 'nestjs-trpc';
import { AuthMiddleware, StaffMiddleware } from '../trpc/auth.middleware';
import type { TrpcContext } from '../trpc/context';
import {
  authorityRoleOptionOutput,
  availabilityOutput,
  createItemTypeInput,
  createItemUnitInput,
  createRoomInput,
  eligibilityRule,
  itemCategory,
  itemDetail,
  itemIdInput,
  itemTypeDetail,
  itemTypeIdInput,
  itemUnit,
  itemUnitOutput,
  listItemsInput,
  listManagedItemsInput,
  listManagedRoomsInput,
  listManagedUnitsInput,
  listRoomsInput,
  managementGroupOptionOutput,
  paginatedItems,
  paginatedItemTypes,
  paginatedManagedRooms,
  paginatedRooms,
  roomIdInput,
  roomOutput,
  roomSummary,
  setTypeEligibilityInput,
  setUnitConditionInput,
  setUnitLendableInput,
  tierOptionOutput,
  updateItemTypeInput,
  updateItemUnitInput,
  updateRoomInput,
  type CreateItemTypeInput,
  type CreateItemUnitInput,
  type CreateRoomInput,
  type ListItemsInput,
  type ListManagedItemsInput,
  type ListManagedRoomsInput,
  type ListManagedUnitsInput,
  type ListRoomsInput,
  type SetTypeEligibilityInput,
  type SetUnitConditionInput,
  type SetUnitLendableInput,
  type UpdateItemTypeInput,
  type UpdateItemUnitInput,
  type UpdateRoomInput,
} from './item.schema';
import { ItemService } from './item.service';
import { ItemManagementService } from './item.management.service';

/**
 * The catalogue domain — both halves of it (ว-05: group by domain, not by
 * role; gate with middleware).
 *
 * One router, two audiences, and the middleware is per-procedure rather than
 * on the class for exactly that reason:
 *
 *   - the borrower half (`list`, `getById`, `getAvailability`, `listUnits`,
 *     `listRooms`, `getRoomById`) is read-only and needs only a session;
 *   - the staff half (`listManaged`, `create*`, `update*`, `set*`) writes, and
 *     is additionally scoped per row to the caller's department.
 *
 * The two sets of names were chosen not to collide — `list` vs `listManaged`,
 * `getById` vs `getManagedById` — so that nobody can reach a staff-only view
 * by calling what looks like a borrower one.
 *
 * Rooms live here rather than under `reservation` because searching a room and
 * searching a multimeter are the same act against the same table
 * (ResourceInfo); `reservation` is for booking one once it has been found.
 * Flagged for the team in docs/auth-admin.md — the contract did not name a
 * home for room search.
 */
@Router({ alias: 'item' })
export class ItemRouter {
  constructor(
    private readonly itemService: ItemService,
    private readonly management: ItemManagementService,
  ) {}

  // ═══ Borrower-facing catalogue ═══════════════════════════════════════════
  //
  // Every procedure below requires a session. The catalogue is not public:
  // which equipment a faculty owns, and how much of it is missing, is not
  // something to hand out anonymously.

  /**
   * Catalogue search. `q` matches name, description and asset tag.
   * Default sort puts what can be borrowed today at the top.
   */
  @UseMiddlewares(AuthMiddleware)
  @Query({ input: listItemsInput, output: paginatedItems })
  list(@Input() input: ListItemsInput) {
    return this.itemService.list(input);
  }

  /** One equipment type with every unit, its condition and its due date. */
  @UseMiddlewares(AuthMiddleware)
  @Query({ input: itemIdInput, output: itemDetail })
  getById(@Input() input: { id: number }) {
    return this.itemService.getById(input.id);
  }

  /**
   * Live stock for one item. POLLED every 10-15s by the item page, so the
   * output is kept as small as it can be.
   */
  @UseMiddlewares(AuthMiddleware)
  @Query({ input: itemIdInput, output: availabilityOutput })
  getAvailability(@Input() input: { id: number }) {
    return this.itemService.getAvailability(input.id);
  }

  /** Units of one type — serial numbers, condition, and what is due back when. */
  @UseMiddlewares(AuthMiddleware)
  @Query({ input: itemIdInput, output: z.array(itemUnit) })
  listUnits(@Input() input: { id: number }) {
    return this.itemService.listUnits(input.id);
  }

  /** Not implemented — equipment has no category column or table. */
  @UseMiddlewares(AuthMiddleware)
  @Query({ output: z.array(itemCategory) })
  listCategories() {
    return this.itemService.listCategories();
  }

  /** Room and facility search. `q` matches name, description and location. */
  @UseMiddlewares(AuthMiddleware)
  @Query({ input: listRoomsInput, output: paginatedRooms })
  listRooms(@Input() input: ListRoomsInput) {
    return this.itemService.listRooms(input);
  }

  @UseMiddlewares(AuthMiddleware)
  @Query({ input: roomIdInput, output: roomSummary })
  getRoomById(@Input() input: { id: number }) {
    return this.itemService.getRoomById(input.id);
  }

  // ═══ Staff-facing management ═════════════════════════════════════════════
  //
  // Every procedure below takes ctx: department scope is a per-row question
  // (ResourceInfo.ManagedBy), not something middleware can answer once.

  // ── Item types ──────────────────────────────────────────────────────────

  /** `q` matches type name, description, or any unit's serial. */
  @UseMiddlewares(StaffMiddleware)
  @Query({ input: listManagedItemsInput, output: paginatedItemTypes })
  listManaged(@Input() input: ListManagedItemsInput, @Ctx() ctx: TrpcContext) {
    return this.management.listManagedItems(ctx.user!, input);
  }

  @UseMiddlewares(StaffMiddleware)
  @Query({ input: itemTypeIdInput, output: itemTypeDetail })
  getManagedById(@Input() input: { itemKey: number }, @Ctx() ctx: TrpcContext) {
    return this.management.getManagedItemById(ctx.user!, input.itemKey);
  }

  /**
   * Registers a type. It has no units and therefore no tier until
   * `item.createUnit` runs — a type on its own is a catalogue entry, not stock.
   */
  @UseMiddlewares(StaffMiddleware)
  @Mutation({ input: createItemTypeInput, output: itemTypeDetail })
  createType(@Input() input: CreateItemTypeInput) {
    return this.management.createItemType(input);
  }

  @UseMiddlewares(StaffMiddleware)
  @Mutation({ input: updateItemTypeInput, output: itemTypeDetail })
  updateType(@Input() input: UpdateItemTypeInput, @Ctx() ctx: TrpcContext) {
    return this.management.updateItemType(ctx.user!, input);
  }

  // ── Units ───────────────────────────────────────────────────────────────

  @UseMiddlewares(StaffMiddleware)
  @Query({ input: listManagedUnitsInput, output: z.array(itemUnitOutput) })
  listManagedUnits(
    @Input() input: ListManagedUnitsInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.management.listManagedUnits(ctx.user!, input);
  }

  /** Returns every unit created, so a batch registration can be printed at once. */
  @UseMiddlewares(StaffMiddleware)
  @Mutation({ input: createItemUnitInput, output: z.array(itemUnitOutput) })
  createUnit(@Input() input: CreateItemUnitInput, @Ctx() ctx: TrpcContext) {
    return this.management.createItemUnits(ctx.user!, input);
  }

  @UseMiddlewares(StaffMiddleware)
  @Mutation({ input: updateItemUnitInput, output: itemUnitOutput })
  updateUnit(@Input() input: UpdateItemUnitInput, @Ctx() ctx: TrpcContext) {
    return this.management.updateItemUnit(ctx.user!, input);
  }

  /** Maintenance switch. Refused while a borrower is holding the unit. */
  @UseMiddlewares(StaffMiddleware)
  @Mutation({ input: setUnitLendableInput, output: itemUnitOutput })
  setUnitLendable(
    @Input() input: SetUnitLendableInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.management.setUnitLendable(ctx.user!, input);
  }

  /** Condition found outside a return — charges nobody, unlike `inspection.create`. */
  @UseMiddlewares(StaffMiddleware)
  @Mutation({ input: setUnitConditionInput, output: itemUnitOutput })
  setUnitCondition(
    @Input() input: SetUnitConditionInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.management.setUnitCondition(ctx.user!, input);
  }

  // ── Rooms (T3) ──────────────────────────────────────────────────────────

  @UseMiddlewares(StaffMiddleware)
  @Query({ input: listManagedRoomsInput, output: paginatedManagedRooms })
  listManagedRooms(
    @Input() input: ListManagedRoomsInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.management.listManagedRooms(ctx.user!, input);
  }

  /**
   * Registers a room. Seat count and slot length — the other two things §5.9
   * asks for — have no columns; see docs/staff.md. Booking those slots is the
   * reservation domain's job, not this one's.
   */
  @UseMiddlewares(StaffMiddleware)
  @Mutation({ input: createRoomInput, output: roomOutput })
  createRoom(@Input() input: CreateRoomInput, @Ctx() ctx: TrpcContext) {
    return this.management.createRoom(ctx.user!, input);
  }

  @UseMiddlewares(StaffMiddleware)
  @Mutation({ input: updateRoomInput, output: roomOutput })
  updateRoom(@Input() input: UpdateRoomInput, @Ctx() ctx: TrpcContext) {
    return this.management.updateRoom(ctx.user!, input);
  }

  // ── Eligibility ─────────────────────────────────────────────────────────

  @UseMiddlewares(StaffMiddleware)
  @Query({ input: itemTypeIdInput, output: z.array(eligibilityRule) })
  listEligibility(
    @Input() input: { itemKey: number },
    @Ctx() ctx: TrpcContext,
  ) {
    return this.management.listTypeEligibility(ctx.user!, input.itemKey);
  }

  /** Replaces the rule set wholesale — an empty list closes the type to everyone. */
  @UseMiddlewares(StaffMiddleware)
  @Mutation({
    input: setTypeEligibilityInput,
    output: z.array(eligibilityRule),
  })
  setEligibility(
    @Input() input: SetTypeEligibilityInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.management.setTypeEligibility(ctx.user!, input);
  }

  // ── Reference data for the forms ────────────────────────────────────────

  @UseMiddlewares(StaffMiddleware)
  @Query({ output: z.array(tierOptionOutput) })
  listTiers() {
    return this.management.listTiers();
  }

  @UseMiddlewares(StaffMiddleware)
  @Query({ output: z.array(managementGroupOptionOutput) })
  listManagementGroups(@Ctx() ctx: TrpcContext) {
    return this.management.listManagementGroups(ctx.user!);
  }

  @UseMiddlewares(StaffMiddleware)
  @Query({ output: z.array(authorityRoleOptionOutput) })
  listAuthorityRoles() {
    return this.management.listAuthorityRoles();
  }
}
