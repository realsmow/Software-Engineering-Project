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
import {
  changePasswordInput,
  changePasswordOutput,
  loginInput,
  loginOutput,
  requestPasswordResetInput,
  resetPasswordWithTokenInput,
  type ChangePasswordInput,
  type LoginInput,
  type RequestPasswordResetInput,
  type ResetPasswordWithTokenInput,
} from './auth.schema';
import { AuthService } from './auth.service';
import { SESSION_COOKIE, SessionService } from './session.service';
import { LoginThrottleService } from './login-throttle.service';
import { PasswordResetService } from './password-reset.service';
import { BusinessError } from '../common/errors/business-error';
import { AuditService } from '../common/audit/audit.service';

@Router({ alias: 'auth' })
export class AuthRouter {
  constructor(
    private readonly authService: AuthService,
    private readonly session: SessionService,
    private readonly throttle: LoginThrottleService,
    private readonly audit: AuditService,
    private readonly passwordReset: PasswordResetService,
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
    await this.session.issue(ctx.res, accountKey);

    // Only successful logins are recorded. Failures are already rate-limited,
    // and writing a row per failed attempt turns the audit log into the
    // easiest way to fill the disk.
    await this.audit.record(
      {
        accountKey,
        ip: ctx.req.ip ?? null,
        userAgent: ctx.req.headers['user-agent'] ?? null,
      },
      'login',
      `account/${accountKey}`,
      'Signed in',
    );

    return { user: await this.authService.getProfile(accountKey) };
  }

  /**
   * Sign out. Also unauthenticated on purpose: clearing a cookie that has
   * already expired should succeed quietly, not answer 401 and leave the
   * client stuck holding a dead session.
   */
  @Mutation({ output: okOutput })
  async logout(@Ctx() ctx: TrpcContext) {
    // Revokes the SessionInfo row as well as clearing the cookie, so the
    // token is dead even if a copy of it was taken.
    await this.session.clear(ctx.req, ctx.res);
    return OK;
  }

  /**
   * Sign out everywhere. Ends every session this account has, including the
   * caller's own, which is what you want after a password change or a
   * suspected compromise.
   */
  @UseMiddlewares(AuthMiddleware)
  @Mutation({ output: okOutput })
  async logoutAll(@Ctx() ctx: TrpcContext) {
    await this.session.revokeAllForAccount(ctx.user!.accountKey);
    ctx.res.clearCookie(SESSION_COOKIE);
    return OK;
  }

  /**
   * Ask for a reset link. No middleware: the caller is locked out by
   * definition.
   *
   * Always returns ok, whether or not the address belongs to an account, so
   * this cannot be used to find out who is registered. The same per-address
   * and per-IP limiter as login keeps it from being used to send mail in bulk.
   */
  @Mutation({ input: requestPasswordResetInput, output: okOutput })
  async requestPasswordReset(
    @Input() input: RequestPasswordResetInput,
    @Ctx() ctx: TrpcContext,
  ) {
    // Prefixed so reset attempts get their own bucket. Sharing login's would
    // mean anyone who knows an address could lock its owner out of signing in
    // just by submitting this form five times. The per-IP bucket is still
    // shared, which is the intended behaviour: one address hammering either
    // endpoint is the same thing.
    const limiterKey = `reset:${input.email.trim().toLowerCase()}`;
    this.throttle.assertAllowed(limiterKey, ctx.req.ip);
    this.throttle.recordFailure(limiterKey, ctx.req.ip);
    await this.passwordReset.request(input.email);
    return OK;
  }

  /** Spend a link and set the new password. Also public, for the same reason. */
  @Mutation({ input: resetPasswordWithTokenInput, output: okOutput })
  async resetPasswordWithToken(
    @Input() input: ResetPasswordWithTokenInput,
  ) {
    await this.passwordReset.reset(input.token, input.newPassword);
    return OK;
  }

  /**
   * Change your own password.
   *
   * Every session is revoked and a fresh one issued for this request, so the
   * browser doing the changing stays signed in and every other one is cut off.
   * That is the point rather than a side effect: the usual reason to change a
   * password is that somebody else may know the old one, and leaving their
   * session alive would make the change cosmetic.
   */
  @UseMiddlewares(AuthMiddleware)
  @Mutation({ input: changePasswordInput, output: changePasswordOutput })
  async changePassword(
    @Input() input: ChangePasswordInput,
    @Ctx() ctx: TrpcContext,
  ) {
    const accountKey = ctx.user!.accountKey;

    await this.authService.changePassword(
      accountKey,
      input.currentPassword,
      input.newPassword,
    );

    // Count before re-issuing, so the new session is not counted as revoked.
    const revoked = await this.session.revokeAllForAccount(accountKey);
    await this.session.issue(ctx.res, accountKey, false);

    await this.audit.record(
      {
        accountKey,
        ip: ctx.req.ip ?? null,
        userAgent: ctx.req.headers['user-agent'] ?? null,
      },
      'update',
      `account/${accountKey}`,
      'Password changed by the account holder, other sessions revoked',
    );

    return {
      ok: true as const,
      // The session that made the change was live too; it is not "other".
      otherSessionsRevoked: Math.max(0, revoked - 1),
    };
  }
}
