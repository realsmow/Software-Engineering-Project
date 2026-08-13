import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Password hashing for AccountInfo.HashedPassword.
 *
 * -- Why scrypt from node:crypto --------------------------------------------
 * No extra dependency. argon2 and bcrypt both need a native build, which
 * breaks when people change machines and when CI runs on a clean image.
 * scrypt is a memory-hard KDF that OWASP accepts as an alternative to
 * argon2id.
 *
 * The team may pick argon2id instead. What matters is that ONE algorithm and
 * ONE stored format is chosen system-wide -- if two people pick differently,
 * accounts created by one cannot log in through the other.
 *
 * -- Format stored in AccountInfo.HashedPassword -----------------------------
 *     scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>
 *
 * The cost parameters live inside the string so that when the cost is raised
 * later, old hashes still verify with their original parameters and can be
 * upgraded gradually as users log in. Without that, every user would have to
 * reset their password on the same day.
 */

const N = 16384; // cost - higher is slower for us and much more expensive for a guesser
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scrypt(plain, salt, KEYLEN);
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

/**
 * Returns false for every failure, including a malformed string in the
 * database -- "wrong password" and "corrupt row" must be indistinguishable
 * from outside, or a guesser learns which accounts exist.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const keylen = Buffer.from(parts[5]!, 'base64').length;
  if (keylen === 0) return false;

  const salt = Buffer.from(parts[4]!, 'base64');
  const expected = Buffer.from(parts[5]!, 'base64');
  const actual = await scrypt(plain, salt, keylen);

  // timingSafeEqual is not about speed, it defends against a timing attack:
  // comparing with === stops at the first differing byte, so how long it took
  // leaks how many bytes were guessed correctly. This always compares all of
  // them.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
