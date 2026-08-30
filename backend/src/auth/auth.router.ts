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
import { LoginThrottleService } from './login-throttle.service';
import { BusinessError } from '../common/errors/business-error';

@Router({ alias: 'auth' })
export class AuthRouter {
  constructor(
    private readonly authService: AuthService,
    private readonly session: SessionService,
    private readonly throttle: LoginThrottleService,
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
    // req.ip is only trustworthy if Express is told which proxies to trust.
    // Behind a reverse proxy without `trust proxy` set, every request appears
    // to come from the proxy and the per-IP limit becomes a global one.
    const ip = ctx.req.ip;

    // Checked before authenticate() so a blocked attempt never reaches scrypt.
    this.throttle.assertAllowed(input.username, ip);

    let accountKey: number;
    try {
      accountKey = await this.authService.authenticate(
        input.username,
        input.password,
      );
    } catch (error) {
      // Only a wrong password counts. A database outage is not an attack, and
      // counting it would lock out real users during an incident.
      if (
        error instanceof BusinessError &&
        error.businessCode === 'INVALID_CREDENTIALS'
      ) {
        this.throttle.recordFailure(input.username, ip);
      }
      throw error;
    }

    this.throttle.recordSuccess(input.username);
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
