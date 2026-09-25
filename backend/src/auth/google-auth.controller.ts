import {
  Controller,
  Get,
  NotFoundException,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { GoogleOAuthService } from './google-oauth.service';
import { SessionService } from './session.service';
import { AuditService } from '../common/audit/audit.service';
import { BusinessError } from '../common/errors/business-error';
import { rateLimiter } from '../common/security/rate-limiter';

/** Anti-CSRF state, round-tripped for the few seconds a Google redirect takes. */
const STATE_COOKIE = 'ulms_oauth_state';

/**
 * NFR-SEC-05: both routes below are unauthenticated top-level redirects, so
 * one shared bucket per IP covers the pair - a caller hammering either one is
 * the same thing to defend against.
 */
const OAUTH_RATE_LIMIT = 20;
const OAUTH_RATE_WINDOW_MS = 60 * 1000;

/**
 * FR-AUTH-01/02: the two routes a browser actually hits for "Sign in with
 * Google". Not tRPC procedures - tRPC calls are same-origin JSON exchanges,
 * and this is a pair of top-level redirects through accounts.google.com, the
 * same reason ImageController's upload route is a plain REST controller too.
 *
 * Registered in AppModule.controllers. Both routes 404 while
 * GoogleOAuthService.isEnabled() is false, so the whole feature is invisible
 * until GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI are set - see backend/.env.example.
 */
@Controller('auth')
export class GoogleAuthController {
  constructor(
    private readonly google: GoogleOAuthService,
    private readonly session: SessionService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  @Get('google')
  start(@Req() req: Request, @Res() res: Response): void {
    if (!this.google.isEnabled()) throw new NotFoundException();
    if (!this.checkRateLimit(req)) {
      res.status(429).json({ code: 'TOO_MANY_REQUESTS' });
      return;
    }

    const state = randomBytes(24).toString('base64url');
    res.cookie(
      STATE_COOKIE,
      this.google.signState(state),
      this.cookieOptions(),
    );
    res.redirect(this.google.buildAuthorizeUrl(state));
  }

  @Get('google/callback')
  async callback(
    @Query('code') code: unknown,
    @Query('state') state: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.google.isEnabled()) throw new NotFoundException();
    if (!this.checkRateLimit(req)) {
      res.status(429).json({ code: 'TOO_MANY_REQUESTS' });
      return;
    }

    // One-time use either way: a replayed callback must not verify twice.
    const cookieValue: unknown = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, this.cookieOptions());

    const expectedState =
      typeof cookieValue === 'string'
        ? this.google.readState(cookieValue)
        : null;

    if (
      !expectedState ||
      typeof state !== 'string' ||
      typeof code !== 'string' ||
      expectedState !== state
    ) {
      // Forged, expired, or a stale/duplicate callback - not a business rule
      // the visitor can act on, so this is the same generic failure as a
      // network error below rather than a code of its own.
      return this.failure(res, 'SERVER_ERROR');
    }

    try {
      const accountKey = await this.google.signIn(code);
      await this.session.issue(res, accountKey);

      // Same audit trail as password login (auth.router.ts's login mutation).
      await this.audit.record(
        {
          accountKey,
          ip: req.ip ?? null,
          userAgent: req.headers['user-agent'] ?? null,
        },
        'login',
        `account/${accountKey}`,
        'Signed in with a Google account',
      );

      res.redirect(this.publicAppUrl());
    } catch (error) {
      const businessCode =
        error instanceof BusinessError ? error.businessCode : 'SERVER_ERROR';
      this.failure(res, businessCode);
    }
  }

  private checkRateLimit(req: Request): boolean {
    const ip = req.ip ?? 'unknown';
    return rateLimiter.consume(
      `oauth:${ip}`,
      OAUTH_RATE_LIMIT,
      OAUTH_RATE_WINDOW_MS,
    );
  }

  private failure(res: Response, code: string): void {
    res.redirect(
      `${this.publicAppUrl()}/login?error=${encodeURIComponent(code)}`,
    );
  }

  /**
   * Mirrors common/mail/mailer.ts's PUBLIC_APP_URL resolution rather than
   * importing it - mailer.ts's mailSettings() also stands up an SMTP
   * transporter, which this redirect has no use for.
   */
  private publicAppUrl(): string {
    return (
      this.config.get<string>('PUBLIC_APP_URL') ?? 'http://localhost:5173'
    ).replace(/\/+$/, '');
  }

  private cookieOptions(): CookieOptions {
    const isProduction = this.config.get('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('COOKIE_SECURE') === 'true' || isProduction,
      path: '/auth/google',
      maxAge: 10 * 60 * 1000,
    };
  }
}
