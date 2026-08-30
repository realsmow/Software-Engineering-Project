import { Injectable } from '@nestjs/common';
import { BusinessError } from '../common/errors/business-error';

/**
 * Failed-login throttle.
 *
 * scrypt is deliberately expensive (~16 MB and real CPU per attempt), which is
 * what makes stolen hashes hard to crack. Unthrottled, that same cost is a gift
 * to an attacker: a few hundred concurrent login attempts will exhaust memory
 * and CPU long before they exhaust the password space. So this guards
 * availability as much as it guards accounts.
 *
 * Two independent counters, because they defend against different things:
 *
 *  - per IP, generous. Stops one host spraying many accounts.
 *  - per account, strict. Stops a slow distributed guess at one account.
 *
 * The per-account counter is a denial-of-service lever: anyone who knows your
 * username can lock you out for the block window. That is the accepted
 * trade-off at this scale, and the reason the block is minutes rather than
 * hours and clears the moment a correct password arrives. If account lockout
 * abuse ever shows up, the fix is a CAPTCHA or an emailed unlock link, not a
 * longer block.
 *
 * ponytail: in-memory and per-process. Correct for one server, which is what
 * this deploys as today. Run two instances behind a load balancer and each
 * keeps its own counts, so the effective limit multiplies by the instance
 * count. Move to Redis at that point, not before.
 */

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_ACCOUNT = 5;
const MAX_FAILURES_PER_IP = 20;

/** Sweep expired entries once the map passes this size, so it cannot grow without bound. */
const SWEEP_THRESHOLD = 5_000;

interface Bucket {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
}

@Injectable()
export class LoginThrottleService {
  private readonly buckets = new Map<string, Bucket>();

  /**
   * Call before checking a password. Throws TOO_MANY_ATTEMPTS while blocked.
   *
   * Checking before the hash is the entire point: a blocked request must not
   * reach scrypt, or the throttle costs exactly as much as the attack.
   */
  assertAllowed(identifier: string, ip: string | undefined): void {
    const now = Date.now();
    for (const key of this.keysFor(identifier, ip)) {
      const bucket = this.buckets.get(key);
      if (bucket && bucket.blockedUntil > now) {
        throw new BusinessError('TOO_MANY_ATTEMPTS', {
          retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
        });
      }
    }
  }

  /** Call on a rejected password. */
  recordFailure(identifier: string, ip: string | undefined): void {
    const now = Date.now();
    this.sweepIfLarge(now);

    for (const key of this.keysFor(identifier, ip)) {
      const limit = key.startsWith('ip:')
        ? MAX_FAILURES_PER_IP
        : MAX_FAILURES_PER_ACCOUNT;

      const existing = this.buckets.get(key);
      const bucket =
        existing && now - existing.windowStartedAt < WINDOW_MS
          ? existing
          : { failures: 0, windowStartedAt: now, blockedUntil: 0 };

      bucket.failures += 1;
      if (bucket.failures >= limit) {
        bucket.blockedUntil = now + BLOCK_MS;
        // Restart the window with the block, so the counter does not
        // immediately re-trip on the first attempt after it expires.
        bucket.failures = 0;
        bucket.windowStartedAt = now;
      }
      this.buckets.set(key, bucket);
    }
  }

  /**
   * Call on a successful password. Clears the account counter only.
   *
   * The IP counter deliberately survives: one correct password among many
   * wrong ones is what a successful spray looks like, so it should not wipe
   * the evidence that the host was spraying.
   */
  recordSuccess(identifier: string): void {
    this.buckets.delete(this.accountKey(identifier));
  }

  private keysFor(identifier: string, ip: string | undefined): string[] {
    const keys = [this.accountKey(identifier)];
    if (ip) keys.push(`ip:${ip}`);
    return keys;
  }

  private accountKey(identifier: string): string {
    return `id:${identifier.trim().toLowerCase()}`;
  }

  private sweepIfLarge(now: number): void {
    if (this.buckets.size < SWEEP_THRESHOLD) return;
    for (const [key, bucket] of this.buckets) {
      const idle = now - bucket.windowStartedAt >= WINDOW_MS;
      if (idle && bucket.blockedUntil <= now) this.buckets.delete(key);
    }
  }
}
