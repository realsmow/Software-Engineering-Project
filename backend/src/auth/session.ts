import { Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import type { CookieOptions, Response } from 'express';

/**
 * Session handling.
 *
 * == OPEN DECISION - belongs in the contract meeting =========================
 *
 * schema.prisma has no Session, no Token and no OAuth table. That leaves two
 * options:
 *
 *   A. Stateless JWT (what this implements)
 *      No migration, no schema change, touches nobody else's work.
 *      The trade: sessions cannot really be revoked. "Log out" only deletes
 *      the browser's cookie; that token keeps working until it expires. If a
 *      token is stolen there is no way to stop it short of rotating
 *      JWT_SECRET, which signs every user out at once.
 *
 *   B. Add a Session table
 *      Revocable, and shows where each user is signed in from.
 *      The trade: a schema change plus a migration, and one extra DB query on
 *      EVERY request.
 *
 * A was chosen so the login flow could be finished without blocking on a
 * schema decision. If the meeting picks B, only this file and context.ts
 * change -- no router or frontend code depends on which one is used.
 */

/** What goes in the token - as little as possible, since anyone can read it */
interface SessionPayload {
  /** subject = AccountKey. Deliberately no role - see the note further down. */
  sub: number;
}

export const SESSION_COOKIE = 'ulms_session';

@Injectable()
export class SessionService {
  private readonly secret = process.env.JWT_SECRET ?? '';
  private readonly ttlHours = Number(process.env.SESSION_TTL_HOURS ?? 8);

  constructor() {
    // Fail at boot rather than run happily signing tokens with an empty key.
    if (!this.secret) {
      throw new Error('JWT_SECRET is not set - copy .env.example to .env');
    }
  }

  sign(accountKey: number): string {
    const payload: SessionPayload = { sub: accountKey };
    return jwt.sign(payload, this.secret, { expiresIn: `${this.ttlHours}h` });
  }

  /** AccountKey when the token is usable, null in every other case */
  verify(token: string): number | null {
    try {
      // jwt.verify returns string | JwtPayload, and JwtPayload declares sub as
      // string | undefined per the JWT spec, so a direct cast is rejected
      // (TS2352). Go through unknown and check at runtime, because what is
      // inside the token is outside data we do not control.
      const decoded = jwt.verify(token, this.secret) as unknown;
      if (typeof decoded !== 'object' || decoded === null) return null;

      const sub = (decoded as { sub?: unknown }).sub;
      return typeof sub === 'number' ? sub : null;
    } catch {
      // Expired, bad signature, or garbage - all the same answer: not valid.
      return null;
    }
  }

  /**
   * Why the payload carries no role.
   *
   * Putting the role in the token would be faster (no DB query per request),
   * but the role would then be frozen at the moment of login. The day an admin
   * revokes someone's access, that person keeps their old permissions until
   * the token expires.
   *
   * This system lends valuable items and has an approval step, so context.ts
   * reads the role fresh from the database on every request. That is a
   * speed-for-correctness trade the team should know it has taken.
   */

  cookieOptions(): CookieOptions {
    return {
      // JavaScript on the page cannot read it - blocks token theft via XSS.
      httpOnly: true,

      // false in development because localhost is plain http. In production
      // over https this must be true, or the cookie travels in the clear.
      secure: process.env.NODE_ENV === 'production',

      // 'lax' means the browser will not send the cookie on requests started
      // by other sites (a first layer of CSRF defence). If web and api ever
      // end up on genuinely different domains this has to become 'none' plus
      // secure:true, which reopens CSRF and needs another defence.
      sameSite: 'lax',

      path: '/',
      maxAge: this.ttlHours * 60 * 60 * 1000,
    };
  }

  attach(res: Response, accountKey: number): void {
    res.cookie(SESSION_COOKIE, this.sign(accountKey), this.cookieOptions());
  }

  clear(res: Response): void {
    // The same options used when setting it must be passed here, otherwise the
    // browser treats it as a different cookie and refuses to remove it. That
    // is the classic "logged out but still logged in" bug.
    const { maxAge: _maxAge, ...rest } = this.cookieOptions();
    res.clearCookie(SESSION_COOKIE, rest);
  }
}
