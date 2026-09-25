import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  it('allows calls up to the limit and then rejects', () => {
    const limiter = new RateLimiter();

    expect(limiter.consume('k', 3, 60_000)).toBe(true);
    expect(limiter.consume('k', 3, 60_000)).toBe(true);
    expect(limiter.consume('k', 3, 60_000)).toBe(true);
    expect(limiter.consume('k', 3, 60_000)).toBe(false);
  });

  it('keeps separate buckets per key', () => {
    const limiter = new RateLimiter();

    expect(limiter.consume('a', 1, 60_000)).toBe(true);
    expect(limiter.consume('a', 1, 60_000)).toBe(false);
    // A different key has never been touched, so it starts fresh.
    expect(limiter.consume('b', 1, 60_000)).toBe(true);
  });

  it('resets once the window has fully elapsed', () => {
    const limiter = new RateLimiter();
    const realNow = Date.now;
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    try {
      expect(limiter.consume('k', 1, 1_000)).toBe(true);
      expect(limiter.consume('k', 1, 1_000)).toBe(false);

      now += 1_001;
      expect(limiter.consume('k', 1, 1_000)).toBe(true);
    } finally {
      jest.spyOn(Date, 'now').mockImplementation(realNow);
    }
  });
});
