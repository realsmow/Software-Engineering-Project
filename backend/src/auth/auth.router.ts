import { Ctx, Query, Router, UseMiddlewares } from 'nestjs-trpc';
import { AuthMiddleware } from '../trpc/auth.middleware';
import type { TrpcContext } from '../trpc/context';
import { userOutput } from '../common/schemas/user.schema';
import { AuthService } from './auth.service';

@Router({ alias: 'auth' })
export class AuthRouter {
  constructor(private readonly authService: AuthService) {}

  /** Own profile: role, faculty, and the borrow limits of the current credit tier */
  @UseMiddlewares(AuthMiddleware)
  @Query({ output: userOutput })
  me(@Ctx() ctx: TrpcContext) {
    return this.authService.getProfile(ctx.user!.accountKey);
  }
}
