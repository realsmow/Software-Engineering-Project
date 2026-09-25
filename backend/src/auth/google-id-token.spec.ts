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
