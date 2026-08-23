import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing for AccountInfo.HashedPassword.
 *
 * Uses scrypt from node:crypto rather than bcrypt/argon2 so the project gains
 * no native dependency — a real consideration for a team where everyone has to
 * get `npm ci` working on a different OS. scrypt is a memory-hard KDF and is
 * an appropriate choice here; the cost parameters below are the ones the Node
 * documentation recommends as a baseline.
 *
 * Stored format (self-describing, so the cost can be raised later without
 * invalidating existing hashes):
 *
 *     scrypt$<N>$<r>$<p>$<salt base64>$<derived key base64>
 */

/** CPU/memory cost. Memory used is roughly 128 * N * r = 16 MB per hash. */
const COST_N = 16384;
const BLOCK_SIZE_R = 8;
const PARALLELISM_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

const PREFIX = 'scrypt';

function derive(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { N: params.N, r: params.r, p: params.p, maxmem: MAX_MEMORY },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const params = { N: COST_N, r: BLOCK_SIZE_R, p: PARALLELISM_P };
  const key = await derive(plain, salt, params);

  return [
    PREFIX,
    params.N,
    params.r,
    params.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/**
 * Never throws — an unparseable or legacy value in HashedPassword is simply a
 * password that cannot match. Throwing here would turn "this row predates the
 * hashing code" into a 500 on the login endpoint.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = await derive(plain, salt, { N, r, p });
  } catch {
    // Absurd cost parameters in the stored string (would exceed maxmem)
    return false;
  }

  // Compare in constant time. Lengths must match first — timingSafeEqual
  // throws on a length mismatch instead of returning false.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * A hash of a value nobody knows, used to spend the same CPU time on a login
 * attempt for an email that does not exist as for one that does. Without it
 * the response time alone tells an attacker which accounts are real.
 *
 * Computed once, lazily, so importing this module stays cheap.
 */
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64'));
  return dummyHash;
}

/**
 * Temporary password for an admin-created account or a password reset.
 *
 * Alphabet excludes characters that get misread when a password is copied off
 * a screen or read aloud over the phone (0/O, 1/l/I).
 */
const SAFE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generateTemporaryPassword(length = 14): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SAFE_ALPHABET[randomInt(SAFE_ALPHABET.length)];
  }
  return out;
}
