import { z } from 'zod';
import {
  Ctx,
  Input,
  Mutation,
  Query,
  Router,
  UseMiddlewares,
} from 'nestjs-trpc';
import { AuthMiddleware, SupervisorMiddleware } from '../trpc/auth.middleware';
import type { TrpcContext } from '../trpc/context';
import {
  appealIdInput,
  appealOutput,
  appealablePenalty,
  createAppealInput,
  decideAppealInput,
  listAppealsInput,
  listMyAppealsInput,
  paginatedAppeals,
  type CreateAppealInput,
  type DecideAppealInput,
  type ListAppealsInput,
  type ListMyAppealsInput,
} from './appeal.schema';
import { AppealService } from './appeal.service';

/**
 * Appeals against a credit penalty (§5.8) — one domain, two audiences (ว-05).
 *
 * The middleware is per-procedure rather than on the class because the two
 * halves are gated differently and neither gate would do for the other: the
 * borrower files and reads their own, a supervisor rules. `decide` is
 * `SupervisorMiddleware` and not `StaffMiddleware` on purpose — the person
 * most likely to have graded the return is the staff member who took it back,
 * and the proposal wants the second look to come from further up. The rule
 * that the reviewer is a different person is enforced per row on top of that
 * (CANNOT_DECIDE_OWN_INSPECTION), because a role gate cannot answer it.
 */
@Router({ alias: 'appeal' })
export class AppealRouter {
  constructor(private readonly appealService: AppealService) {}

  // ── Borrower ────────────────────────────────────────────────────────────

  /** Which of my penalties can still be appealed — drives the button. */
  @UseMiddlewares(AuthMiddleware)
  @Query({ output: z.array(appealablePenalty) })
  appealable(@Ctx() ctx: TrpcContext) {
    return this.appealService.listAppealable(ctx.user!);
  }

  @UseMiddlewares(AuthMiddleware)
  @Mutation({ input: createAppealInput, output: appealOutput })
  create(@Input() input: CreateAppealInput, @Ctx() ctx: TrpcContext) {
    return this.appealService.create(ctx.user!, input);
  }

  @UseMiddlewares(AuthMiddleware)
  @Query({ input: listMyAppealsInput, output: paginatedAppeals })
  mine(@Input() input: ListMyAppealsInput, @Ctx() ctx: TrpcContext) {
    return this.appealService.listMine(ctx.user!, input);
  }

  /** Readable by the borrower who filed it, or by any staff member. */
  @UseMiddlewares(AuthMiddleware)
  @Query({ input: appealIdInput, output: appealOutput })
  getById(@Input() input: { appealKey: number }, @Ctx() ctx: TrpcContext) {
    return this.appealService.getById(ctx.user!, input.appealKey);
  }

  // ── Supervisor ──────────────────────────────────────────────────────────

  /** The queue, oldest first. Defaults to what is still pending. */
  @UseMiddlewares(SupervisorMiddleware)
  @Query({ input: listAppealsInput, output: paginatedAppeals })
  list(@Input() input: ListAppealsInput, @Ctx() ctx: TrpcContext) {
    return this.appealService.listQueue(ctx.user!, input);
  }

  /** Approve (optionally reducing the penalty) or reject. */
  @UseMiddlewares(SupervisorMiddleware)
  @Mutation({ input: decideAppealInput, output: appealOutput })
  decide(@Input() input: DecideAppealInput, @Ctx() ctx: TrpcContext) {
    return this.appealService.decide(ctx.user!, input);
  }
}
