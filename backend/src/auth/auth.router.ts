import { Ctx, Input, Mutation, Query, Router, UseMiddlewares } from 'nestjs-trpc';
import { z } from 'zod';
import { AuthMiddleware } from '../trpc/auth.middleware';
import type { TrpcContext } from '../trpc/context';
import { AuthService, type LoginInput } from './auth.service';
import { SessionService } from './session';

/**
 * TWO RULES APPLY TO THIS FILE. Both are properties of the code generator
 * (`npx nestjs-trpc generate`), not style preferences.
 *
 * 1. EVERY SCHEMA MUST BE WRITTEN INLINE.
 *
 *    The generator copies the decorator text verbatim into the generated
 *    contract. A named import becomes an import line in the output:
 *
 *      @Query({ output: userOutput })
 *        generates
 *      import { userOutput } from "../../../home/<user>/.../user.schema.js";
 *
 *    That path is an absolute path glued onto a relative prefix - it does not
 *    resolve, and the frontend cannot compile against it. Verified against
 *    nestjs-trpc 2.13.0. An inline `z.object({ ... })` copies through cleanly
 *    and needs nothing but zod, which the frontend already has.
 *
 *    The cost: the output shape below is duplicated from
 *    common/schemas/user.schema.ts (`userOutput`). That file stays the source
 *    of truth for the service layer -- KEEP THE TWO IN SYNC BY HAND until the
 *    generator's import handling is fixed.
 *
 * 2. NO NON-ASCII CHARACTERS ANYWHERE IN THIS FILE.
 *
 *    The generator is a Rust binary that slices source text by byte index to
 *    copy an inline schema out. Thai characters are three bytes, so a single
 *    Thai comment aborts the run:
 *
 *      thread 'main' panicked at swc_common/src/source_map.rs:
 *      end byte index 102 is not a char boundary; it is inside '<thai char>'
 *
 *    It does NOT happen with imported schemas, so the crash looks random
 *    until the rule is known.
 */
@Router({ alias: 'auth' })
export class AuthRouter {
  constructor(
    private readonly authService: AuthService,
    private readonly session: SessionService,
  ) {}

  /**
   * Exchange credentials for a session cookie.
   *
   * The cookie is httpOnly, so the frontend never sees the token and has
   * nothing to store: it calls login, then calls auth.me, and the browser
   * carries the session from then on.
   */
  @Mutation({
    input: z.object({
      method: z.enum(['ku', 'local']),
      identifier: z.string().trim().min(1).max(200),
      password: z.string().min(1).max(200),
    }),
    output: z.object({
      id: z.number().int(),
      studentId: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      // z.string().email(), not z.email(): this shape is copied verbatim into
      // the generated contract, which the frontend compiles against. The
      // frontend is still on zod 3, where top-level z.email() does not exist.
      // z.string().email() is valid in both 3 and 4, so the contract can land
      // before the frontend's zod bump instead of being blocked on it.
      email: z.string().email(),
      role: z.enum(['borrower', 'staff', 'supervisor', 'admin']),
      facultyName: z.string().nullable(),
      creditScore: z.number().int(),
      creditTier: z.enum(['D0', 'D1', 'D2', 'D3']),
      maxBorrowDays: z.number().int().positive(),
      maxExtendTimes: z.number().int().min(0),
    }),
  })
  async login(@Input() input: LoginInput, @Ctx() ctx: TrpcContext) {
    const user = await this.authService.login(input);
    this.session.attach(ctx.res, user.id);
    return user;
  }

  /** Own profile: role, faculty, and the borrow limits of the current credit tier */
  @UseMiddlewares(AuthMiddleware)
  @Query({
    output: z.object({
      id: z.number().int(),
      studentId: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      // z.string().email(), not z.email(): this shape is copied verbatim into
      // the generated contract, which the frontend compiles against. The
      // frontend is still on zod 3, where top-level z.email() does not exist.
      // z.string().email() is valid in both 3 and 4, so the contract can land
      // before the frontend's zod bump instead of being blocked on it.
      email: z.string().email(),
      role: z.enum(['borrower', 'staff', 'supervisor', 'admin']),
      facultyName: z.string().nullable(),
      creditScore: z.number().int(),
      creditTier: z.enum(['D0', 'D1', 'D2', 'D3']),
      maxBorrowDays: z.number().int().positive(),
      maxExtendTimes: z.number().int().min(0),
    }),
  })
  me(@Ctx() ctx: TrpcContext) {
    return this.authService.getProfile(ctx.user!.accountKey);
  }

  /**
   * Clear the session cookie.
   *
   * Note what this does NOT do: the JWT stays valid until it expires. See the
   * open decision at the top of session.ts -- revocable sessions need a
   * Session table.
   */
  @Mutation({ output: z.object({ ok: z.literal(true) }) })
  logout(@Ctx() ctx: TrpcContext) {
    this.session.clear(ctx.res);
    return { ok: true as const };
  }
}
