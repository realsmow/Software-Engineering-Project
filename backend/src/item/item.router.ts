import { z } from 'zod';
import {
  Ctx,
  Input,
  Mutation,
  Query,
  Router,
  UseMiddlewares,
} from 'nestjs-trpc';
import { StaffMiddleware } from '../trpc/auth.middleware';
import type { TrpcContext } from '../trpc/context';
import {
  authorityRoleOptionOutput,
  createItemTypeInput,
  createItemUnitInput,
  createRoomInput,
  eligibilityRule,
  itemTypeDetail,
  itemTypeIdInput,
  itemUnitOutput,
  listManagedItemsInput,
  listManagedRoomsInput,
  listManagedUnitsInput,
  managementGroupOptionOutput,
  paginatedItemTypes,
  paginatedManagedRooms,
  roomOutput,
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
  type ListManagedItemsInput,
  type ListManagedRoomsInput,
  type ListManagedUnitsInput,
  type SetTypeEligibilityInput,
  type SetUnitConditionInput,
  type SetUnitLendableInput,
  type UpdateItemTypeInput,
  type UpdateItemUnitInput,
  type UpdateRoomInput,
} from './item.schema';
import { ItemService } from './item.service';

/**
 * The catalogue domain — staff half (ว-05: by domain, gated by middleware).
 *
 * The borrower-facing reads named in CONTRACT.md (`item.list`, `item.getById`,
 * `item.availability`) are not here yet. They belong in this same router, added
 * by whoever owns the borrower slice; the procedures below are deliberately
 * named `listManaged` / `getManagedById` so the two sets never collide, and so
 * nobody can reach a staff-only view by calling what looks like a public one.
 *
 * Every procedure takes ctx: department scope is a per-row question
 * (ResourceInfo.ManagedBy), not something middleware can answer once.
 */
@Router({ alias: 'item' })
@UseMiddlewares(StaffMiddleware)
export class ItemRouter {
  constructor(private readonly itemService: ItemService) {}

  // ── Item types ──────────────────────────────────────────────────────────

  /** `q` matches type name, description, or any unit's serial. */
  @Query({ input: listManagedItemsInput, output: paginatedItemTypes })
  listManaged(@Input() input: ListManagedItemsInput, @Ctx() ctx: TrpcContext) {
    return this.itemService.listManagedItems(ctx.user!, input);
  }

  @Query({ input: itemTypeIdInput, output: itemTypeDetail })
  getManagedById(@Input() input: { itemKey: number }, @Ctx() ctx: TrpcContext) {
    return this.itemService.getManagedItemById(ctx.user!, input.itemKey);
  }

  /**
   * Registers a type. It has no units and therefore no tier until
   * `item.createUnit` runs — a type on its own is a catalogue entry, not stock.
   */
  @Mutation({ input: createItemTypeInput, output: itemTypeDetail })
  createType(@Input() input: CreateItemTypeInput) {
    return this.itemService.createItemType(input);
  }

  @Mutation({ input: updateItemTypeInput, output: itemTypeDetail })
  updateType(@Input() input: UpdateItemTypeInput, @Ctx() ctx: TrpcContext) {
    return this.itemService.updateItemType(ctx.user!, input);
  }

  // ── Units ───────────────────────────────────────────────────────────────

  @Query({ input: listManagedUnitsInput, output: z.array(itemUnitOutput) })
  listManagedUnits(
    @Input() input: ListManagedUnitsInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.itemService.listManagedUnits(ctx.user!, input);
  }

  /** Returns every unit created, so a batch registration can be printed at once. */
  @Mutation({ input: createItemUnitInput, output: z.array(itemUnitOutput) })
  createUnit(@Input() input: CreateItemUnitInput, @Ctx() ctx: TrpcContext) {
    return this.itemService.createItemUnits(ctx.user!, input);
  }

  @Mutation({ input: updateItemUnitInput, output: itemUnitOutput })
  updateUnit(@Input() input: UpdateItemUnitInput, @Ctx() ctx: TrpcContext) {
    return this.itemService.updateItemUnit(ctx.user!, input);
  }

  /** Maintenance switch. Refused while a borrower is holding the unit. */
  @Mutation({ input: setUnitLendableInput, output: itemUnitOutput })
  setUnitLendable(
    @Input() input: SetUnitLendableInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.itemService.setUnitLendable(ctx.user!, input);
  }

  /** Condition found outside a return — charges nobody, unlike `inspection.create`. */
  @Mutation({ input: setUnitConditionInput, output: itemUnitOutput })
  setUnitCondition(
    @Input() input: SetUnitConditionInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.itemService.setUnitCondition(ctx.user!, input);
  }

  // ── Rooms (T3) ──────────────────────────────────────────────────────────

  @Query({ input: listManagedRoomsInput, output: paginatedManagedRooms })
  listManagedRooms(
    @Input() input: ListManagedRoomsInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.itemService.listManagedRooms(ctx.user!, input);
  }

  /**
   * Registers a room. Seat count and slot length — the other two things §5.9
   * asks for — have no columns; see docs/staff.md. Booking those slots is the
   * reservation domain's job, not this one's.
   */
  @Mutation({ input: createRoomInput, output: roomOutput })
  createRoom(@Input() input: CreateRoomInput, @Ctx() ctx: TrpcContext) {
    return this.itemService.createRoom(ctx.user!, input);
  }

  @Mutation({ input: updateRoomInput, output: roomOutput })
  updateRoom(@Input() input: UpdateRoomInput, @Ctx() ctx: TrpcContext) {
    return this.itemService.updateRoom(ctx.user!, input);
  }

  // ── Eligibility ─────────────────────────────────────────────────────────

  @Query({ input: itemTypeIdInput, output: z.array(eligibilityRule) })
  listEligibility(
    @Input() input: { itemKey: number },
    @Ctx() ctx: TrpcContext,
  ) {
    return this.itemService.listTypeEligibility(ctx.user!, input.itemKey);
  }

  /** Replaces the rule set wholesale — an empty list closes the type to everyone. */
  @Mutation({
    input: setTypeEligibilityInput,
    output: z.array(eligibilityRule),
  })
  setEligibility(
    @Input() input: SetTypeEligibilityInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.itemService.setTypeEligibility(ctx.user!, input);
  }

  // ── Reference data for the forms ────────────────────────────────────────

  @Query({ output: z.array(tierOptionOutput) })
  listTiers() {
    return this.itemService.listTiers();
  }

  @Query({ output: z.array(managementGroupOptionOutput) })
  listManagementGroups(@Ctx() ctx: TrpcContext) {
    return this.itemService.listManagementGroups(ctx.user!);
  }

  @Query({ output: z.array(authorityRoleOptionOutput) })
  listAuthorityRoles() {
    return this.itemService.listAuthorityRoles();
  }
}
