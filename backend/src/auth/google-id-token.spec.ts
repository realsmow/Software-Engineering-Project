import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyGoogleIdTokenSignature } from './google-jwks';
import {
  validateGoogleIdTokenClaims,
  type GoogleIdTokenClaims,
} from './google-id-token';

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const NOW = 1_700_000_000;

function claims(
  overrides: Partial<GoogleIdTokenClaims> = {},
): GoogleIdTokenClaims {
  return {
    iss: 'accounts.google.com',
    aud: CLIENT_ID,
    exp: NOW + 3600,
    email: 'student@ku.th',
    email_verified: true,
    ...overrides,
  };
}

const opts = {
  clientId: CLIENT_ID,
  allowedDomains: ['ku.th'],
  nowSeconds: NOW,
};

describe('validateGoogleIdTokenClaims', () => {
  it('accepts a well-formed KU token', () => {
    expect(validateGoogleIdTokenClaims(claims(), opts)).toEqual({
      ok: true,
      email: 'student@ku.th',
    });
  });

  it('accepts the https:// issuer spelling too', () => {
    const result = validateGoogleIdTokenClaims(
      claims({ iss: 'https://accounts.google.com' }),
      opts,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a forged issuer', () => {
    expect(
      validateGoogleIdTokenClaims(claims({ iss: 'evil.example.com' }), opts),
    ).toEqual({ ok: false, reason: 'ISSUER' });
  });

  it('rejects a token issued for a different client', () => {
    expect(
      validateGoogleIdTokenClaims(
        claims({ aud: 'someone-elses-client-id' }),
        opts,
      ),
    ).toEqual({ ok: false, reason: 'AUDIENCE' });
  });

  it('rejects an expired token', () => {
    expect(validateGoogleIdTokenClaims(claims({ exp: NOW - 1 }), opts)).toEqual(
      { ok: false, reason: 'EXPIRED' },
    );
  });

  it('rejects an unverified email, in either boolean or string form', () => {
    expect(
      validateGoogleIdTokenClaims(claims({ email_verified: false }), opts),
    ).toEqual({ ok: false, reason: 'EMAIL_NOT_VERIFIED' });
    expect(
      validateGoogleIdTokenClaims(claims({ email_verified: 'false' }), opts),
    ).toEqual({ ok: false, reason: 'EMAIL_NOT_VERIFIED' });
  });

  it('rejects a token with no email claim at all', () => {
    expect(
      validateGoogleIdTokenClaims(claims({ email: undefined }), opts),
    ).toEqual({ ok: false, reason: 'EMAIL_MISSING' });
  });

  it('rejects a verified email outside the allowed domain (FR-AUTH-02)', () => {
    expect(
      validateGoogleIdTokenClaims(claims({ email: 'someone@gmail.com' }), opts),
    ).toEqual({ ok: false, reason: 'DOMAIN' });
  });
});

// Real service/adapter assertions share this module's suite; setup is scoped.
describe('Google ID token signature and JWKS failure handling', () => {
  // HTTP OAuth covers successful signing and a forged signature. Add malformed
  // tokens, missing/unknown keys, and provider failures using real RSA signatures
  // and a local JWKS response; no Google requests or credentials are involved.
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const jwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid: 'qa-key',
    alg: 'RS256',
    use: 'sig',
  };

  const claims = {
    email: 'student@ku.th',
    sub: 'qa-student',
    email_verified: true,
  };

  function token(
    header = { alg: 'RS256', kid: 'qa-key' },
    payload: object = claims,
  ) {
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const text = `${encode(header)}.${encode(payload)}`;
    return `${text}.${sign('RSA-SHA256', Buffer.from(text), privateKey).toString('base64url')}`;
  }

  describe('FR-AUTH-01: Google sign-in verifies the actual signature', () => {
    let fetchMock: jest.SpiedFunction<typeof fetch>;
    beforeEach(() => {
      fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ keys: [jwk] }),
      } as Response);
    });
    afterEach(() => jest.restoreAllMocks());
    it('rejects a payload changed after signing', async () => {
      const parts = token().split('.');
      parts[1] = Buffer.from(
        JSON.stringify({ ...claims, email: 'other@ku.th' }),
      ).toString('base64url');
      await expect(
        verifyGoogleIdTokenSignature(parts.join('.')),
      ).rejects.toThrow('signature does not match');
    });
    it('rejects a token signed with another private key', async () => {
      const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const parts = token().split('.');
      parts[2] = sign(
        'RSA-SHA256',
        Buffer.from(parts.slice(0, 2).join('.')),
        other.privateKey,
      ).toString('base64url');
      await expect(
        verifyGoogleIdTokenSignature(parts.join('.')),
      ).rejects.toThrow('signature does not match');
    });
    it.each(['', 'one.two', 'one.two.three.four'])(
      'rejects malformed token %j before fetching keys',
      async (value) => {
        await expect(verifyGoogleIdTokenSignature(value)).rejects.toThrow(
          'Malformed id_token',
        );
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );
    it('rejects a header without a signing-key identifier', async () => {
      await expect(
        verifyGoogleIdTokenSignature(token({ alg: 'RS256' } as never)),
      ).rejects.toThrow('header has no kid');
      expect(fetchMock).not.toHaveBeenCalled();
    });
    it('rejects a key identifier not present in the current key set', async () => {
      await expect(
        verifyGoogleIdTokenSignature(
          token({ alg: 'RS256', kid: 'unknown-key' }),
        ),
      ).rejects.toThrow('No matching Google signing key');
    });
    it('refuses sign-in when the key provider is unavailable', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);
      await expect(verifyGoogleIdTokenSignature(token())).rejects.toThrow(
        'HTTP 503',
      );
    });
    it('refuses sign-in on a network failure', async () => {
      fetchMock.mockRejectedValue(new Error('QA network unavailable'));
      await expect(verifyGoogleIdTokenSignature(token())).rejects.toThrow(
        'QA network unavailable',
      );
    });
  });
});
