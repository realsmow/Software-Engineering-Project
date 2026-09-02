import { LoginThrottleService } from './login-throttle.service';
import { BusinessError } from '../common/errors/business-error';

const IP = '203.0.113.7';
const USER = 'someone@ku.th';

/** Drive the clock instead of sleeping, so the window logic is testable. */
function at(ms: number) {
  jest.spyOn(Date, 'now').mockReturnValue(ms);
}

describe('LoginThrottleService', () => {
  let throttle: LoginThrottleService;

  beforeEach(() => {
    throttle = new LoginThrottleService();
    at(1_000_000);
  });

  afterEach(() => jest.restoreAllMocks());

  it('allows a fresh identifier', () => {
    expect(() => throttle.assertAllowed(USER, IP)).not.toThrow();
  });

  it('blocks the account after 5 failures', () => {
    for (let i = 0; i < 4; i++) throttle.recordFailure(USER, IP);
    expect(() => throttle.assertAllowed(USER, IP)).not.toThrow();

    throttle.recordFailure(USER, IP);
    expect(() => throttle.assertAllowed(USER, IP)).toThrow(BusinessError);
  });

  it('reports how long to wait', () => {
    for (let i = 0; i < 5; i++) throttle.recordFailure(USER, IP);
    try {
      throttle.assertAllowed(USER, IP);
      fail('should have thrown');
    } catch (e) {
      const err = e as BusinessError;
      expect(err.businessCode).toBe('TOO_MANY_ATTEMPTS');
      const cause = err.cause as unknown as { retryAfterSeconds: number };
      expect(cause.retryAfterSeconds).toBeGreaterThan(0);
      expect(cause.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
    }
  });

  it('lets the account back in once the block expires', () => {
    for (let i = 0; i < 5; i++) throttle.recordFailure(USER, IP);
    expect(() => throttle.assertAllowed(USER, IP)).toThrow();

    at(1_000_000 + 15 * 60 * 1000 + 1);
    expect(() => throttle.assertAllowed(USER, IP)).not.toThrow();
  });

  it('clears the account counter on success', () => {
    for (let i = 0; i < 4; i++) throttle.recordFailure(USER, IP);
    throttle.recordSuccess(USER);

    // Would be the 5th and blocking failure if the counter had survived.
    throttle.recordFailure(USER, IP);
    expect(() => throttle.assertAllowed(USER, IP)).not.toThrow();
  });

  it('does not let one account unblock a spraying IP', () => {
    // 20 failures from one host spread over many accounts, none of which
    // individually reaches the per-account limit.
    for (let i = 0; i < 20; i++) throttle.recordFailure(`victim${i}@ku.th`, IP);

    expect(() => throttle.assertAllowed('untouched@ku.th', IP)).toThrow(
      BusinessError,
    );
  });

  it('keeps accounts independent when the IP is under its limit', () => {
    for (let i = 0; i < 5; i++) throttle.recordFailure('a@ku.th', IP);
    expect(() => throttle.assertAllowed('a@ku.th', IP)).toThrow();
    expect(() => throttle.assertAllowed('b@ku.th', undefined)).not.toThrow();
  });

  it('treats the identifier case-insensitively, as login does', () => {
    for (let i = 0; i < 5; i++) throttle.recordFailure('User@KU.th', undefined);
    expect(() => throttle.assertAllowed('  user@ku.th ', undefined)).toThrow();
  });

  it('forgets stale failures once the window passes', () => {
    for (let i = 0; i < 4; i++) throttle.recordFailure(USER, undefined);

    at(1_000_000 + 15 * 60 * 1000 + 1);
    throttle.recordFailure(USER, undefined);
    expect(() => throttle.assertAllowed(USER, undefined)).not.toThrow();
  });
});
