import { createPublicKey, verify as verifySignature } from 'node:crypto';

/**
 * Verifies a Google id_token's signature and returns its decoded payload.
 *
 * Deliberately not the tokeninfo endpoint (GET
 * .../oauth2/v3/tokeninfo?id_token=...): that would work too, but it means
 * sending every login's token back to Google and trusting its answer over the
 * network on every request. Verifying locally against Google's published JWKS
 * means only the (cacheable, non-secret) public keys are fetched, and the
 * cryptographic check happens here with node:crypto - no extra dependency.
 *
 * This file is deliberately the only impure part of the id_token check: it
 * fetches JWKS and does the RS256 verification. Everything claims-shaped
 * (issuer/audience/expiry/domain) is decided by the pure, unit-tested
 * validateGoogleIdTokenClaims in google-id-token.ts instead.
 */

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

interface GoogleJwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
  // Node's JsonWebKey type requires an index signature; Google's JWKS sends
  // a couple of fields (use, alg) this file never reads.
  [key: string]: unknown;
}

function decodeJwtSegment(segment: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(segment, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
}

async function fetchGoogleJwks(): Promise<GoogleJwk[]> {
  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Google JWKS: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { keys: GoogleJwk[] };
  return body.keys;
}

/**
 * Throws on anything that is not a validly-signed Google JWT: wrong shape,
 * unknown key id, or a signature that doesn't match. One failure mode for all
 * of them is fine here - the caller (GoogleOAuthService) turns every failure
 * into the same generic sign-in error, since none of these are the user's
 * fault to fix.
 */
export async function verifyGoogleIdTokenSignature(
  idToken: string,
): Promise<Record<string, unknown>> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed id_token');
  const [headerPart, payloadPart, signaturePart] = parts;

  const header = decodeJwtSegment(headerPart) as { kid?: string; alg?: string };
  if (!header.kid) throw new Error('id_token header has no kid');

  const keys = await fetchGoogleJwks();
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error('No matching Google signing key for this id_token');

  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const signedData = Buffer.from(`${headerPart}.${payloadPart}`);
  const signature = Buffer.from(signaturePart, 'base64url');

  // Google only ever signs id_tokens with RS256.
  const valid = verifySignature('RSA-SHA256', signedData, publicKey, signature);
  if (!valid) throw new Error('id_token signature does not match');

  return decodeJwtSegment(payloadPart);
}
