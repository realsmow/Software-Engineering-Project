import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Response } from 'express';
import { z } from 'zod';

/** Cookie that carries the session JWT — read in trpc/context.ts */
export const SESSION_COOKIE = 'ulms_session';

/** Session lifetime. One value, so the JWT and the cookie can't disagree. */
const SESSION_TTL_DAYS = 7;
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

/**
 * Shape we expect back out of a verified token.
 *
 * Parsed rather than cast: a signature check proves the token came from us,
 * not that its payload still looks the way this code expects (an older
 * deployment may have signed a different shape).
 */
const sessionPayload = z.object({
  sub: z.number().int().positive(),
});

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(private readonly jwt: JwtService) {}

  /** Signs a session token for an account */
  async issue(accountKey: number): Promise<string> {
    return this.jwt.signAsync({ sub: accountKey });
  }

  /**
   * Verifies a token and returns the account it belongs to, or null.
   *
   * Never throws: an expired or forged cookie is an ordinary "not logged in",
   * not a server error, so callers can treat null as anonymous.
   */
  async verify(token: string): Promise<number | null> {
    try {
      const payload = sessionPayload.safeParse(await this.jwt.verifyAsync(token));
      if (payload.success) return payload.data.sub;

      // Valid signature but an unexpected shape — a token signed by an older
      // build. Worth a warning: it means a deploy changed the payload.
      this.logger.warn('Session token verified but its payload had an unexpected shape');
      return null;
    } catch (error) {
      /**
       * Expired/malformed/bad-signature all land here and all mean "not
       * logged in". Debug level, not warn: an expired cookie is routine, and
       * this runs on every anonymous request. Turn it up with
       * `Logger.overrideLogger(['debug'])` when chasing an auth problem.
       */
      this.logger.debug(
        `Rejected session token: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Sets the session cookie on a login/register response.
   *
   * `persist` is the login form's "remember me": when false the cookie gets
   * no maxAge, so the browser drops it at the end of the session. The token
   * itself still expires on its own schedule regardless.
   */
  setCookie(res: Response, token: string, persist = true): void {
    const options = this.cookieOptions();
    if (!persist) delete options.maxAge;
    res.cookie(SESSION_COOKIE, token, options);
  }

  /** Clears the session cookie on logout */
  clearCookie(res: Response): void {
    // Options must match what was set, or the browser keeps the old cookie.
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  private cookieOptions(): CookieOptions {
    const isProd = process.env.NODE_ENV === 'production';
    return {
      /**
       * httpOnly keeps the token out of reach of JavaScript, so an XSS bug
       * can't read the session out of document.cookie.
       */
      httpOnly: true,
      /**
       * In dev the frontend (localhost:5173) and API (localhost:3000) differ
       * only by port, which is still *same-site*, so 'lax' works. If they
       * ever land on different domains in production, this has to become
       * 'none' — and 'none' requires secure:true.
       */
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
      maxAge: SESSION_TTL_SECONDS * 1000,
      path: '/',
    };
  }
}

export { SESSION_TTL_SECONDS };
