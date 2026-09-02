import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { PrismaService } from '../prisma.service';
import { signToken, verifyToken } from '../common/crypto/token';

/** Cookie name agreed in ว-03 - the frontend sends it via `credentials: 'include'`. */
export const SESSION_COOKIE = 'ulms_session';

const DEFAULT_TTL_HOURS = 12;

/**
 * Issues, reads and revokes the login session.
 *
 * Sessions are backed by a SessionInfo row rather than being purely stateless.
 * The earlier stateless design could not answer "end this session now": a
 * stolen cookie stayed valid until it expired, and signing out everywhere was
 * impossible. That is the property this table exists to provide, and it is why
 * every read costs one indexed lookup.
 *
 * The cookie carries a random session id, signed so a forged one is rejected
 * before it ever reaches the database. Only the SHA-256 of that id is stored,
 * so a dump of SessionInfo cannot be replayed as a live session - the same
 * reasoning as hashing passwords.
 *
 * This is the only class that knows a cookie is involved. Everything upstream
 * sees an account key, everything downstream sees ctx.user.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly secret: string;
  private readonly ttlMs: number;
  private readonly cookieOptions: CookieOptions;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.secret = this.resolveSecret();
    this.ttlMs =
      Number(this.config.get('SESSION_TTL_HOURS') ?? DEFAULT_TTL_HOURS) *
      60 *
      60 *
      1000;

    const isProduction = this.config.get('NODE_ENV') === 'production';
    this.cookieOptions = {
      // No JavaScript access - an XSS bug then cannot read the session out of
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

  /** Hash of the session id, which is what SessionInfo stores. */
  private static hash(sessionId: string): string {
    return createHash('sha256').update(sessionId).digest('hex');
  }

  /**
   * Opens a session for this account and puts it on the response.
   *
   * `persist` false issues a browser-session cookie (gone when the browser
   * closes) rather than one with a maxAge, which is what an unticked
   * "remember me" should do. The server-side expiry is the same either way.
   */
  async issue(
    res: Response,
    accountKey: number,
    persist = true,
  ): Promise<string> {
    const sessionId = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlMs);

    await this.prisma.sessionInfo.create({
      data: {
        AccountKey: accountKey,
        TokenHash: SessionService.hash(sessionId),
        ExpiresAt: expiresAt,
      },
    });

    const token = signToken(sessionId, this.secret);
    res.cookie(SESSION_COOKIE, token, {
      ...this.cookieOptions,
      ...(persist ? { maxAge: this.ttlMs } : {}),
    });
    return token;
  }

  /**
   * AccountKey of the caller, or null for absent, forged, expired or revoked
   * sessions. Never throws: an unusable cookie is an anonymous request, and
   * the middleware on each procedure decides whether that is allowed.
   */
  async read(req: Request): Promise<number | null> {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length === 0) return null;

    // Signature first, so a forged cookie costs no database round trip.
    const sessionId = verifyToken(token, this.secret);
    if (sessionId === null) return null;

    const session = await this.prisma.sessionInfo.findUnique({
      where: { TokenHash: SessionService.hash(sessionId) },
      select: { AccountKey: true, ExpiresAt: true, RevokedAt: true },
    });

    if (!session) return null;
    if (session.RevokedAt !== null) return null;
    if (session.ExpiresAt.getTime() <= Date.now()) return null;

    return session.AccountKey;
  }

  /**
   * Ends the caller's own session and clears the cookie.
   *
   * Revoking before clearing matters: if the response never reaches the
   * browser the row is still dead, so the worst case is a cookie the server
   * already refuses.
   */
  async clear(req: Request, res: Response): Promise<void> {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token.length > 0) {
      const sessionId = verifyToken(token, this.secret);
      if (sessionId !== null) {
        await this.prisma.sessionInfo.updateMany({
          where: { TokenHash: SessionService.hash(sessionId), RevokedAt: null },
          data: { RevokedAt: new Date() },
        });
      }
    }
    res.clearCookie(SESSION_COOKIE, this.cookieOptions);
  }

  /**
   * Ends every session for an account. Returns how many were live.
   *
   * This is what makes deactivating a user take effect immediately instead of
   * whenever their cookie happens to lapse.
   */
  async revokeAllForAccount(accountKey: number): Promise<number> {
    const result = await this.prisma.sessionInfo.updateMany({
      where: { AccountKey: accountKey, RevokedAt: null },
      data: { RevokedAt: new Date() },
    });
    return result.count;
  }

  /**
   * A missing secret is fatal in production and merely annoying in
   * development, so it is treated that way: crash on deploy, warn on a laptop.
   * The generated fallback is per-process, so every restart invalidates every
   * signature - that is the intended nudge to put SESSION_SECRET in .env.
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
        ? 'SESSION_SECRET is shorter than 32 characters - ignoring it and using a random per-process secret. Sessions will not survive a restart.'
        : 'SESSION_SECRET is not set - using a random per-process secret. Sessions will not survive a restart. See backend/.env.example.',
    );
    return randomBytes(48).toString('base64url');
  }
}
