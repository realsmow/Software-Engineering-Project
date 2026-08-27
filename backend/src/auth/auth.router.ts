import { z } from 'zod';
import { Ctx, Input, Mutation, Query, Router, UseMiddlewares } from 'nestjs-trpc';
import { AuthMiddleware } from '../trpc/auth.middleware';
import type { TrpcContext } from '../trpc/context';
import { userOutput } from '../common/schemas/user.schema';
import {
  kuLoginInput,
  localLoginInput,
  registerInput,
  type KuLoginInput,
  type LocalLoginInput,
  type RegisterInput,
} from '../common/schemas/auth.schema';
import { AuthService, type AuthResult } from './auth.service';
import { SessionService } from './session.service';

const logoutOutput = z.object({ success: z.boolean() });

/**
 * Issues the session cookie and hands back just the profile.
 *
 * The token is deliberately not part of the response body — it only ever
 * travels in the httpOnly cookie, so frontend JavaScript never holds it.
 *
 * Deliberately a module-level function, not a private method: nestjs-trpc's
 * router factory scans every method on a @Router class and would register
 * this helper as a procedure.
 */
async function startSession(
  sessions: SessionService,
  result: AuthResult,
  ctx: TrpcContext,
  /** "Remember me" — registration always persists, there's no checkbox for it */
  persist = true,
) {
  sessions.setCookie(ctx.res, await sessions.issue(result.accountKey), persist);
  return result.user;
}

@Router({ alias: 'auth' })
export class AuthRouter {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  /** Own profile: role, department, and the current credit band */
  @UseMiddlewares(AuthMiddleware)
  @Query({ output: userOutput })
  me(@Ctx() ctx: TrpcContext) {
    return this.authService.getProfile(ctx.user!.accountKey);
  }

  /** KU email sign-in — students and faculty */
  @Mutation({ input: kuLoginInput, output: userOutput })
  async loginWithKuEmail(@Input() input: KuLoginInput, @Ctx() ctx: TrpcContext) {
    const result = await this.authService.loginWithKuEmail(input);
    return startSession(this.sessionService, result, ctx, input.remember ?? false);
  }

  /** Local account sign-in — department staff without a KU email */
  @Mutation({ input: localLoginInput, output: userOutput })
  async loginWithLocalAccount(
    @Input() input: LocalLoginInput,
    @Ctx() ctx: TrpcContext,
  ) {
    const result = await this.authService.loginWithLocalAccount(input);
    return startSession(this.sessionService, result, ctx, input.remember ?? false);
  }

  /** Public self-registration — signs the new account straight in */
  @Mutation({ input: registerInput, output: userOutput })
  async register(@Input() input: RegisterInput, @Ctx() ctx: TrpcContext) {
    const result = await this.authService.register(input);
    return startSession(this.sessionService, result, ctx);
  }

  @Mutation({ output: logoutOutput })
  logout(@Ctx() ctx: TrpcContext) {
    this.sessionService.clearCookie(ctx.res);
    return { success: true };
  }
}
