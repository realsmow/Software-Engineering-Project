import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { signToken } from '../common/crypto/token';
import { SESSION_COOKIE, SessionService } from './session.service';

const SECRET = 'a-test-secret-that-is-at-least-32-characters-long';

/** Minimal stand-in — ConfigService is only ever read through get(). */
function configWith(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function responseSpy() {
  const cookie = jest.fn();
  const clearCookie = jest.fn();
  return { res: { cookie, clearCookie } as unknown as Response, cookie, clearCookie };
}

function requestWith(cookies: Record<string, unknown>): Request {
  return { cookies } as unknown as Request;
}

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(() => {
    service = new SessionService(configWith({ SESSION_SECRET: SECRET }));
  });

  it('issues a session that reads back as the same account', () => {
    const { res } = responseSpy();
    const token = service.issue(res, 42);

    expect(service.read(requestWith({ [SESSION_COOKIE]: token }))).toBe(42);
  });

  it('sets the cookie so client-side JavaScript cannot read it', () => {
    const { res, cookie } = responseSpy();
    service.issue(res, 42);

    const [name, , options] = cookie.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(options.maxAge).toBeGreaterThan(0);
  });

  it('clears the cookie with the same attributes it was set with', () => {
    const { res, cookie, clearCookie } = responseSpy();
    service.issue(res, 42);
    service.clear(res);

    const setOptions = cookie.mock.calls[0][2];
    const [name, clearOptions] = clearCookie.mock.calls[0];

    expect(name).toBe(SESSION_COOKIE);
    // A mismatch here is the classic "logout does nothing" bug — the browser
    // treats a differently-scoped cookie as a different cookie.
    expect(clearOptions).toMatchObject({
      path: setOptions.path,
      sameSite: setOptions.sameSite,
      secure: setOptions.secure,
      httpOnly: setOptions.httpOnly,
    });
  });

  describe('read() returns null for', () => {
    it('no cookie at all', () => {
      expect(service.read(requestWith({}))).toBeNull();
    });

    it('a request cookie-parser never ran on', () => {
      expect(service.read({} as Request)).toBeNull();
    });

    it('an empty cookie', () => {
      expect(service.read(requestWith({ [SESSION_COOKIE]: '' }))).toBeNull();
    });

    it('a non-string cookie', () => {
      expect(service.read(requestWith({ [SESSION_COOKIE]: 12345 }))).toBeNull();
    });

    it('a token signed with a different secret', () => {
      const other = new SessionService(
        configWith({ SESSION_SECRET: 'another-secret-of-at-least-32-characters!!' }),
      );
      const { res } = responseSpy();
      const foreign = other.issue(res, 42);

      expect(service.read(requestWith({ [SESSION_COOKIE]: foreign }))).toBeNull();
    });
  });

  describe('parse()', () => {
    it('rejects an expired session even though the signature is valid', () => {
      const expired = signToken(`42:${Date.now() - 1000}`, SECRET);
      expect(service.parse(expired)).toBeNull();
    });

    it('accepts one that has not expired', () => {
      const valid = signToken(`42:${Date.now() + 60_000}`, SECRET);
      expect(service.parse(valid)).toBe(42);
    });

    it('rejects a payload whose account key is not a positive integer', () => {
      const future = Date.now() + 60_000;

      expect(service.parse(signToken(`0:${future}`, SECRET))).toBeNull();
      expect(service.parse(signToken(`-1:${future}`, SECRET))).toBeNull();
      expect(service.parse(signToken(`abc:${future}`, SECRET))).toBeNull();
      expect(service.parse(signToken(`:${future}`, SECRET))).toBeNull();
    });

    it('rejects a payload with a missing or unparseable expiry', () => {
      expect(service.parse(signToken('42', SECRET))).toBeNull();
      expect(service.parse(signToken('42:soon', SECRET))).toBeNull();
    });
  });

  describe('secret handling', () => {
    it('refuses to start in production without a secret', () => {
      expect(() => new SessionService(configWith({ NODE_ENV: 'production' }))).toThrow(
        /SESSION_SECRET/,
      );
    });

    it('refuses a production secret that is too short to be worth anything', () => {
      expect(
        () => new SessionService(configWith({ NODE_ENV: 'production', SESSION_SECRET: 'short' })),
      ).toThrow(/SESSION_SECRET/);
    });

    it('falls back to a per-process secret in development', () => {
      const { res } = responseSpy();
      const first = new SessionService(configWith({}));
      const second = new SessionService(configWith({}));

      // Each instance invents its own secret, so tokens do not carry across —
      // which is exactly why a restart logs everyone out.
      expect(second.parse(first.issue(res, 42))).toBeNull();
      expect(first.parse(first.issue(res, 42))).toBe(42);
    });

    it('marks the cookie secure in production', () => {
      const service = new SessionService(
        configWith({ NODE_ENV: 'production', SESSION_SECRET: SECRET }),
      );
      const { res, cookie } = responseSpy();
      service.issue(res, 1);

      expect(cookie.mock.calls[0][2]).toMatchObject({ secure: true });
    });
  });
});
