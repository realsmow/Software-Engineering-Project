import { Ctx, Input, Query, Router, UseMiddlewares } from 'nestjs-trpc';
import { AuthMiddleware, StaffMiddleware } from '../trpc/auth.middleware';
import type { TrpcContext } from '../trpc/context';
import { creditIdInput, creditOutput } from './credit.schema';
import { CreditService } from './credit.service';

@Router({ alias: 'credit' })
export class CreditRouter {
  constructor(private readonly creditService: CreditService) {}

  /** Own credit: score, tier, borrow window, and the penalties behind it. */
  @UseMiddlewares(AuthMiddleware)
  @Query({ output: creditOutput })
  me(@Ctx() ctx: TrpcContext) {
    // Read from ctx, never from an input: a borrower asking for their own
    // credit must not be able to ask for someone else's by changing an id.
    return this.creditService.getCredit(ctx.user!.accountKey);
  }

  /**
   * Someone else's credit - staff and supervisors reviewing a borrower.
   *
   * Separate procedure rather than an optional id on `me`, so the permission
   * difference is visible in the route instead of hidden in a branch.
   */
  @UseMiddlewares(StaffMiddleware)
  @Query({ input: creditIdInput, output: creditOutput })
  getById(@Input() input: { id: number }) {
    return this.creditService.getCredit(input.id);
  }
}
