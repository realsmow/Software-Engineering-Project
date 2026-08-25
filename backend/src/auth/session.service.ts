import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { signToken, verifyToken } from '../common/crypto/token';

/** Cookie name agreed in ว-03 — the frontend sends it via `credentials: 'include'`. */
export const SESSION_COOKIE = 'ulms_session';

const DEFAULT_TTL_HOURS = 12;

/**
 * Issues, reads and clears the login session.
 *
 * The session is a signed token rather than a row in a sessions table, because
 * the schema has no such table and this domain is not allowed to add one. The
 * trade-off is explicit: a token stays valid until it expires, so "log out
 * everywhere" and instant revocation are not possible. Keep the TTL short.
 * If revocation becomes a requirement, the fix is a SessionInfo table, not a
 * longer token.
 *
 * This is the only class that knows a cookie is involved. Everything else
 * upstream sees an account key, and everything downstream sees ctx.user.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly secret: string;
  private readonly ttlMs: number;
  private readonly cookieOptions: CookieOptions;

  constructor(private readonly config: ConfigService) {
    this.secret = this.resolveSecret();
    this.ttlMs =
      Number(this.config.get('SESSION_TTL_HOURS') ?? DEFAULT_TTL_HOURS) *
      60 *
      60 *
      1000;

    const isProduction = this.config.get('NODE_ENV') === 'production';
    this.cookieOptions = {
      // No JavaScript access — an XSS bug then cannot read the session out of
      // document.cookie and post it elsewhere.
      httpOnly: true,
      // 'lax' is enough while frontend and backend share a site (any port on
      // localhost counts as the same site). Split them across domains in
      // production and this must become 'none' + secure:true, or the browser
      // silently drops the cookie on every XHR.
      sameSite:
        this.config.get<CookieOptions['sameSite']>('COOKIE_SAMESITE') ?? 'lax',
      secure: this.config.get('COOKIE_SECURE') === 'true' || isProduction,
      path: '/',
    };
  }

  /** Signs a session for this account and puts it on the response. Returns the token (tests use it). */
  issue(res: Response, accountKey: number): string {
    const expiresAt = Date.now() + this.ttlMs;
    const token = signToken(`${accountKey}:${expiresAt}`, this.secret);

    res.cookie(SESSION_COOKIE, token, {
      ...this.cookieOptions,
      maxAge: this.ttlMs,
    });
    return token;
  }

  /** AccountKey of the caller, or null for absent / forged / expired sessions. */
  read(req: Request): number | null {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length === 0) return null;

    return this.parse(token);
  }

  /**
   * Removes the cookie. `clearCookie` only works when the attributes match the
   * ones the cookie was set with, so they are reused here rather than retyped.
   */
  clear(res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions);
  }

  /** Exposed for tests; production code goes through read(). */
  parse(token: string): number | null {
    const payload = verifyToken(token, this.secret);
    if (payload === null) return null;

    const [rawAccountKey, rawExpiry] = payload.split(':');
    const accountKey = Number(rawAccountKey);
    const expiresAt = Number(rawExpiry);

    if (!Number.isInteger(accountKey) || accountKey <= 0) return null;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

    return accountKey;
  }

  /**
   * A missing secret is fatal in production and merely annoying in
   * development, so it is treated that way: crash on deploy, warn on a laptop.
   * The generated fallback is per-process, so every restart logs everyone out
   * — that is the intended nudge to put SESSION_SECRET in .env.
   */
  private resolveSecret(): string {
    const configured = this.config.get<string>('SESSION_SECRET');
    if (configured && configured.length >= 32) return configured;

    if (this.config.get('NODE_ENV') === 'production') {
      throw new Error(
        'SESSION_SECRET must be set to at least 32 characters in production. ' +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
      );
    }

    this.logger.warn(
      configured
        ? 'SESSION_SECRET is shorter than 32 characters — ignoring it and using a random per-process secret. Sessions will not survive a restart.'
        : 'SESSION_SECRET is not set — using a random per-process secret. Sessions will not survive a restart. See backend/.env.example.',
    );
    return randomBytes(48).toString('base64url');
  }
}
