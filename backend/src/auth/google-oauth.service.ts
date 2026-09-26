import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { BusinessError } from '../common/errors/business-error';
import { signToken, verifyToken } from '../common/crypto/token';
import { allowedDomainsFromConfig } from './domain-policy';
import {
  validateGoogleIdTokenClaims,
  type GoogleIdTokenClaims,
} from './google-id-token';
import { verifyGoogleIdTokenSignature } from './google-jwks';

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * FR-AUTH-01/02: sign in with a Google account, restricted to KU addresses.
 *
 * Everything here is READY TO WIRE LATER - no real Google credentials exist
 * yet. `isEnabled()` is what keeps the feature off until GOOGLE_CLIENT_ID,
 * GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI are all set in .env; every
 * other method assumes the caller already checked that.
 *
 * This does not create accounts. FR-AUTH-01 signs a KU identity in; C-01
 * ("users must have a KU e-mail") is enforced on top of an AccountInfo row
 * that registration or an admin already created - Google only proves which
 * email the caller controls.
 */
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  // Falls back to a per-process secret in dev, same reasoning as
  // SessionService: the state cookie only needs to round-trip within one
  // request/callback pair, so losing it on restart is harmless. In
  // production SESSION_SECRET is guaranteed present, because SessionService
  // (constructed eagerly, like every Nest provider) refuses to boot without
  // it - so this never silently falls back there.
  private readonly devStateSecret = randomBytes(48).toString('base64url');

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Off unless every credential this flow needs is configured. */
  isEnabled(): boolean {
    return (
      Boolean(this.config.get<string>('GOOGLE_CLIENT_ID')) &&
      Boolean(this.config.get<string>('GOOGLE_CLIENT_SECRET')) &&
      Boolean(this.config.get<string>('GOOGLE_REDIRECT_URI'))
    );
  }

  private stateSecret(): string {
    return this.config.get<string>('SESSION_SECRET') || this.devStateSecret;
  }

  /** Signs a random state value for the short-lived anti-CSRF cookie. */
  signState(state: string): string {
    return signToken(state, this.stateSecret());
  }

  /** Verifies the signed cookie value; null on anything forged or malformed. */
  readState(signed: string): string | null {
    return verifyToken(signed, this.stateSecret());
  }

  /** Where the browser is sent to sign in. `state` must match the cookie set alongside it. */
  buildAuthorizeUrl(state: string): string {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI');
    const allowedDomains = allowedDomainsFromConfig(this.config);

    const url = new URL(GOOGLE_AUTHORIZE_URL);
    url.searchParams.set('client_id', clientId ?? '');
    url.searchParams.set('redirect_uri', redirectUri ?? '');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    // Narrows Google's own account chooser to the KU Workspace. Not the
    // security boundary - validateGoogleIdTokenClaims re-checks the email's
    // actual domain below regardless of what a client sent here.
    url.searchParams.set('hd', allowedDomains[0]);
    return url.toString();
  }

  /**
   * Exchanges an authorization code, verifies the id_token, and returns the
   * AccountKey to open a session for - the Google-flow equivalent of
   * AuthService.authenticate(). Session issuance and audit logging stay the
   * caller's job, same as password login.
   *
   * Throws BusinessError('INVALID_DOMAIN') for a verified-but-wrong-domain
   * email (FR-AUTH-02), BusinessError('ACCOUNT_NOT_FOUND') /
   * ('ACCOUNT_DISABLED') once the domain is right but AccountInfo says
   * otherwise, and a plain Error for anything else (network failure, a
   * forged or expired token) - those are not business rules, they are "this
   * attempt did not work, try again".
   */
  async signIn(code: string): Promise<number> {
    const idToken = await this.exchangeCode(code);
    const rawClaims = await verifyGoogleIdTokenSignature(idToken);

    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID') ?? '';
    const allowedDomains = allowedDomainsFromConfig(this.config);
    const result = validateGoogleIdTokenClaims(
      rawClaims as GoogleIdTokenClaims,
      {
        clientId,
        allowedDomains,
      },
    );

    if (!result.ok) {
      if (result.reason === 'DOMAIN') throw new BusinessError('INVALID_DOMAIN');
      // Bad issuer/audience/expiry/unverified-email: a forged or stale
      // token, not a rule the signed-in person can act on.
      throw new Error(`Google id_token rejected: ${result.reason}`);
    }

    const account = await this.prisma.accountInfo.findFirst({
      where: { Email: { equals: result.email, mode: 'insensitive' } },
      select: { AccountKey: true, IsActive: true },
    });

    // No auto-provisioning: an AccountInfo row must already exist, made by
    // registration or an admin. Google only proves which email this is.
    if (!account) throw new BusinessError('ACCOUNT_NOT_FOUND');
    if (!account.IsActive) throw new BusinessError('ACCOUNT_DISABLED');

    return account.AccountKey;
  }

  private async exchangeCode(code: string): Promise<string> {
    const body = new URLSearchParams({
      code,
      client_id: this.config.get<string>('GOOGLE_CLIENT_ID') ?? '',
      client_secret: this.config.get<string>('GOOGLE_CLIENT_SECRET') ?? '',
      redirect_uri: this.config.get<string>('GOOGLE_REDIRECT_URI') ?? '',
      grant_type: 'authorization_code',
    });

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      this.logger.warn(`Google token exchange failed: HTTP ${res.status}`);
      throw new Error(`Google token exchange failed: HTTP ${res.status}`);
    }

    const payload = (await res.json()) as { id_token?: string };
    if (!payload.id_token)
      throw new Error('Google token response had no id_token');
    return payload.id_token;
  }
}
