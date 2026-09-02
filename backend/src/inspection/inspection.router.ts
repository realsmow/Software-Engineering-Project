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
  createInspectionInput,
  decommissionRequestOutput,
  finishRepairInput,
  inspectionHistoryEntry,
  inspectionOutput,
  inspectionSubjectOutput,
  listInspectionQueueInput,
  listInspectionsForResourceInput,
  listRepairsInput,
  paginatedInspectionQueue,
  paginatedRepairs,
  proposeDecommissionInput,
  recordRoomCheckInput,
  repairOutput,
  roomCheckOutput,
  startRepairInput,
  usageIdInput,
  type CreateInspectionInput,
  type FinishRepairInput,
  type ListInspectionQueueInput,
  type ListInspectionsForResourceInput,
  type ListRepairsInput,
  type ProposeDecommissionInput,
  type RecordRoomCheckInput,
  type StartRepairInput,
} from './inspection.schema';
import { InspectionService } from './inspection.service';

/**
 * The inspection domain (ว-05) — entirely staff-owned, unlike `item` and `loan`.
 *
 * `list` is on the polling schedule at 30s: it is the second half of the staff
 * work queue, and a return that sits ungraded keeps a unit off the shelf.
 */
@Router({ alias: 'inspection' })
@UseMiddlewares(StaffMiddleware)
export class InspectionRouter {
  constructor(private readonly inspectionService: InspectionService) {}

  // ── Grading ─────────────────────────────────────────────────────────────

  /** Returned but not yet graded. Polled every 30s. */
  @Query({ input: listInspectionQueueInput, output: paginatedInspectionQueue })
  list(@Input() input: ListInspectionQueueInput, @Ctx() ctx: TrpcContext) {
    return this.inspectionService.listQueue(ctx.user!, input);
  }

  /** One return with both sets of photos and the unit's recent history. */
  @Query({ input: usageIdInput, output: inspectionSubjectOutput })
  getById(@Input() input: { usageKey: number }, @Ctx() ctx: TrpcContext) {
    return this.inspectionService.getSubject(ctx.user!, input.usageKey);
  }

  /** Records the grade, the penalty it implies, and where the unit goes next. */
  @Mutation({ input: createInspectionInput, output: inspectionOutput })
  create(@Input() input: CreateInspectionInput, @Ctx() ctx: TrpcContext) {
    return this.inspectionService.createInspection(ctx.user!, input);
  }

  /** Damage history of one unit — the proposal keys this to the serial. */
  @Query({
    input: listInspectionsForResourceInput,
    output: z.array(inspectionHistoryEntry),
  })
  listForResource(
    @Input() input: ListInspectionsForResourceInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.inspectionService.listForResource(ctx.user!, input);
  }

  // ── Rooms (T3) ──────────────────────────────────────────────────────────

  /** The daily walk-round result. Opening the round is a scheduled job's job. */
  @Mutation({ input: recordRoomCheckInput, output: roomCheckOutput })
  recordRoomCheck(
    @Input() input: RecordRoomCheckInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.inspectionService.recordRoomCheck(ctx.user!, input);
  }

  // ── Repair ──────────────────────────────────────────────────────────────

  @Query({ input: listRepairsInput, output: paginatedRepairs })
  listRepairs(@Input() input: ListRepairsInput, @Ctx() ctx: TrpcContext) {
    return this.inspectionService.listRepairs(ctx.user!, input);
  }

  @Mutation({ input: startRepairInput, output: repairOutput })
  startRepair(@Input() input: StartRepairInput, @Ctx() ctx: TrpcContext) {
    return this.inspectionService.startRepair(ctx.user!, input);
  }

  @Mutation({ input: finishRepairInput, output: repairOutput })
  finishRepair(@Input() input: FinishRepairInput, @Ctx() ctx: TrpcContext) {
    return this.inspectionService.finishRepair(ctx.user!, input);
  }

  // ── Decommission ────────────────────────────────────────────────────────

  /** Not implemented — no table can hold the proposal. See docs/staff.md. */
  @Mutation({
    input: proposeDecommissionInput,
    output: decommissionRequestOutput,
  })
  proposeDecommission(
    @Input() input: ProposeDecommissionInput,
    @Ctx() ctx: TrpcContext,
  ) {
    return this.inspectionService.proposeDecommission(ctx.user!, input);
  }
}
