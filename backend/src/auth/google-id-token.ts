import { isEmailDomainAllowed } from './domain-policy';

/**
 * The claims this app actually reads out of a Google id_token. Google's real
 * payload carries more (name, picture, sub, iat, ...) - `[key: string]:
 * unknown` lets a decoded JWT payload be passed in as-is without a cast.
 */
export interface GoogleIdTokenClaims {
  iss: string;
  aud: string;
  exp: number;
  email?: string;
  /** Google sends this as a real boolean, but tokeninfo-style JSON sends "true"/"false" - accept both. */
  email_verified?: boolean | string;
  /** Google's own Workspace-domain claim, present only for a Workspace account. */
  hd?: string;
  [key: string]: unknown;
}

export type ClaimsRejectionReason =
  | 'ISSUER'
  | 'AUDIENCE'
  | 'EXPIRED'
  | 'EMAIL_NOT_VERIFIED'
  | 'EMAIL_MISSING'
  | 'DOMAIN';

export type ClaimsValidationResult =
  { ok: true; email: string } | { ok: false; reason: ClaimsRejectionReason };

/** The two spellings Google's own id_tokens use across its endpoints. */
const ALLOWED_ISSUERS = new Set([
  'accounts.google.com',
  'https://accounts.google.com',
]);

/**
 * FR-AUTH-01/02, C-01: everything an id_token must satisfy before its email
 * is trusted, once the signature itself has already been verified elsewhere.
 *
 * Pure and network-free by design - this is the part of "trust a token from
 * Google" that is worth unit testing directly, separately from the JWKS fetch
 * and signature check in google-jwks.ts (which needs a network call and is
 * exercised through the service instead).
 */
export function validateGoogleIdTokenClaims(
  claims: GoogleIdTokenClaims,
  opts: { clientId: string; allowedDomains: string[]; nowSeconds?: number },
): ClaimsValidationResult {
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (!ALLOWED_ISSUERS.has(claims.iss)) return { ok: false, reason: 'ISSUER' };
  if (claims.aud !== opts.clientId) return { ok: false, reason: 'AUDIENCE' };
  if (typeof claims.exp !== 'number' || claims.exp <= now) {
    return { ok: false, reason: 'EXPIRED' };
  }
  if (claims.email_verified !== true && claims.email_verified !== 'true') {
    return { ok: false, reason: 'EMAIL_NOT_VERIFIED' };
  }
  if (!claims.email) return { ok: false, reason: 'EMAIL_MISSING' };
  if (!isEmailDomainAllowed(claims.email, opts.allowedDomains)) {
    return { ok: false, reason: 'DOMAIN' };
  }

  return { ok: true, email: claims.email };
}
