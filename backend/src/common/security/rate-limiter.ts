/**
 * Per-IP fixed-window rate limiting (NFR-SEC-05).
 *
 * In-memory and per-process - the same trade-off `LoginThrottleService`
 * documents: correct for the single instance this app deploys as. Run two
 * instances behind a load balancer and each keeps its own counts, so the
 * effective limit multiplies by the instance count; move to Redis at that
 * point, not before.
 *
 * A dependency (express-rate-limit or similar) would do this too, but a fixed
 * window over a Map is a dozen lines, and this app already has one of these
 * (LoginThrottleService) - this is that same idea, generalised so every other
 * unauthenticated entry point (uploads, signed media, OAuth) can share it
 * instead of writing its own.
 *
 * One process-wide instance rather than one per endpoint: each caller
 * namespaces its own bucket key (e.g. `upload:`, `media:`, `oauth:`), so a
 * single map and a single sweep is enough.
 */

interface Bucket {
  count: number;
  windowStartedAt: number;
}

/** Sweep expired entries once the map passes this size, so it cannot grow without bound. */
const SWEEP_THRESHOLD = 20_000;

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  /**
   * Records one call against `bucketKey` and returns whether it is still
   * within `limit` per `windowMs`. Always records - callers must not skip
   * this on a decision they intend to honour, or the count under-reports.
   */
  consume(bucketKey: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    this.sweepIfLarge(now, windowMs);

    const existing = this.buckets.get(bucketKey);
    const bucket =
      existing && now - existing.windowStartedAt < windowMs
        ? existing
        : { count: 0, windowStartedAt: now };

    bucket.count += 1;
    this.buckets.set(bucketKey, bucket);
    return bucket.count <= limit;
  }

  private sweepIfLarge(now: number, windowMs: number): void {
    if (this.buckets.size < SWEEP_THRESHOLD) return;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStartedAt >= windowMs) this.buckets.delete(key);
    }
  }
}

/**
 * Shared across every rate-limited entry point in the process - see the
 * class doc for why one instance, namespaced by bucket key, is enough.
 */
export const rateLimiter = new RateLimiter();
