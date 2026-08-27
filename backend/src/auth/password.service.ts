import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';

/**
 * The only place in the app that knows how passwords are stored.
 *
 * bcryptjs (pure JS) rather than native bcrypt/argon2 so the project installs
 * on Windows without a C++ toolchain.
 */
@Injectable()
export class PasswordService {
  /**
   * Work factor. 12 is the current sensible default: high enough to make
   * offline cracking expensive, low enough that a login stays responsive.
   * Raising it later is safe — bcrypt stores the cost inside the hash, so
   * old hashes keep verifying.
   */
  private static readonly ROUNDS = 12;

  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, PasswordService.ROUNDS);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /**
   * Burns roughly the same time as a real verify, without a hash to compare.
   *
   * Used when no account matched: returning immediately would make "unknown
   * email" measurably faster than "wrong password", which lets an attacker
   * enumerate valid accounts by timing alone.
   */
  async fakeVerify(): Promise<void> {
    await bcrypt.hash('timing-equalizer', PasswordService.ROUNDS);
  }
}
