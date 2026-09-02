import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-signed, stateless tokens.
 *
 * "Signed" is not "encrypted" - the payload is readable by anyone holding the
 * token. It is tamper-evident, not secret. Never put anything in a payload
 * that the token holder should not see.
 *
 * Format: <payload base64url>.<HMAC-SHA256 base64url>
 */

function base64url(input: Buffer): string {
  return input.toString('base64url');
}

function sign(payload: string, secret: string): string {
  return base64url(createHmac('sha256', secret).update(payload).digest());
}

export function signToken(payload: string, secret: string): string {
  const encoded = base64url(Buffer.from(payload, 'utf8'));
  return `${encoded}.${sign(encoded, secret)}`;
}

/**
 * Returns the payload, or null if the token is malformed or the signature does
 * not match. Callers get one answer for every kind of failure on purpose -
 * distinguishing "bad format" from "bad signature" tells an attacker how close
 * a forgery came.
 */
export function verifyToken(token: string, secret: string): string | null {
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const encoded = token.slice(0, separator);
  const provided = token.slice(separator + 1);
  const expected = sign(encoded, secret);

  // Both are base64url of a 32-byte digest, so equal length is the normal
  // case; the guard is for a truncated/padded forgery, which timingSafeEqual
  // would throw on rather than reject.
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected)))
    return null;

  return Buffer.from(encoded, 'base64url').toString('utf8');
}
