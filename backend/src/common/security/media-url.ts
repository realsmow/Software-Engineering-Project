import { timingSafeEqual } from 'node:crypto';
import { signToken } from '../crypto/token';

/**
 * `exp`/`sig` query-string signing for pre-signed media URLs (NFR-SEC-06).
 *
 * `common/crypto/token.ts` already signs a payload with HMAC-SHA256 - reused
 * here rather than reimplemented. That helper's own format is
 * `<payload>.<sig>`, which suits a bearer token but not a URL where the
 * expiry needs to be a plain, readable query parameter (`?exp=...&sig=...`)
 * instead of buried inside an opaque blob. Since `key` and `exp` are already
 * public in the URL, only the signature half of `signToken`'s output is worth
 * keeping - the payload half is derivable by both sides.
 */

function canonicalPayload(key: string, exp: number): string {
  return `${key}:${exp}`;
}

/** Signs `key` (a MEDIA_PREFIX-relative storage key) so it may be fetched until `exp`. */
export function signMediaKey(key: string, exp: number, secret: string): string {
  return signToken(canonicalPayload(key, exp), secret).split('.')[1];
}

/**
 * Verifies a signed evidence request: `sig` must match `key`+`exp` under
 * `secret`, and `exp` must not have passed.
 *
 * One false for every kind of failure - expired, forged, malformed - so a
 * caller probing the endpoint learns nothing about which part was wrong.
 */
export function verifyMediaKey(
  key: string,
  exp: number,
  sig: string,
  secret: string,
): boolean {
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  if (typeof sig !== 'string' || sig.length === 0) return false;

  const expected = signMediaKey(key, exp, secret);
  // Equal length is the normal case (both are base64url of a 32-byte
  // digest); the guard is for a truncated/padded forgery, which
  // timingSafeEqual would throw on rather than reject.
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
