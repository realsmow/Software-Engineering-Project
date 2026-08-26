import {
  Ctx,
  Input,
  Mutation,
  Query,
  Router,
  UseMiddlewares,
} from 'nestjs-trpc';
import { AuthMiddleware } from '../trpc/auth.middleware';
import type { TrpcContext } from '../trpc/context';
import { userOutput } from '../common/schemas/user.schema';
import { OK, okOutput } from '../common/schemas/ok.schema';
import { loginInput, loginOutput, type LoginInput } from './auth.schema';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

@Router({ alias: 'auth' })
export class AuthRouter {
  constructor(
    private readonly authService: AuthService,
    private readonly session: SessionService,
  ) {}

  /** Own profile: role, faculty, and the borrow limits of the current credit tier */
  @UseMiddlewares(AuthMiddleware)
  @Query({ output: userOutput })
  me(@Ctx() ctx: TrpcContext) {
    return this.authService.getProfile(ctx.user!.accountKey);
  }

  /**
   * Sign in. No middleware - this is the one procedure that must work while
   * ctx.user is null.
   */
  @Mutation({ input: loginInput, output: loginOutput })
  async login(@Input() input: LoginInput, @Ctx() ctx: TrpcContext) {
    const accountKey = await this.authService.authenticate(
      input.username,
      input.password,
    );
    this.session.issue(ctx.res, accountKey);

    return { user: await this.authService.getProfile(accountKey) };
  }

  /**
   * Sign out. Also unauthenticated on purpose: clearing a cookie that has
   * already expired should succeed quietly, not answer 401 and leave the
   * client stuck holding a dead session.
   */
  @Mutation({ output: okOutput })
  logout(@Ctx() ctx: TrpcContext) {
    this.session.clear(ctx.res);
    return OK;
  }
}
