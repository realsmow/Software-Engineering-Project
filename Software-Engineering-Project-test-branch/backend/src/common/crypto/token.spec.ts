import { signToken, verifyToken } from './token';

const SECRET = 'a-test-secret-that-is-at-least-32-characters-long';

describe('signed tokens', () => {
  it('round-trips a payload', () => {
    const token = signToken('42:1700000000000', SECRET);
    expect(verifyToken(token, SECRET)).toBe('42:1700000000000');
  });

  it('round-trips a payload containing non-ASCII', () => {
    const token = signToken('ผู้ใช้:1', SECRET);
    expect(verifyToken(token, SECRET)).toBe('ผู้ใช้:1');
  });

  it('rejects a token signed with another secret', () => {
    const token = signToken('42:1700000000000', SECRET);
    expect(
      verifyToken(token, 'a-different-secret-of-sufficient-length!!'),
    ).toBeNull();
  });

  it('rejects a payload edited in place', () => {
    // The whole point: swapping account 42 for account 1 must not validate.
    const token = signToken('42:9999999999999', SECRET);
    const [, signature] = token.split('.');
    const forged = `${Buffer.from('1:9999999999999').toString('base64url')}.${signature}`;

    expect(verifyToken(forged, SECRET)).toBeNull();
  });

  it('rejects a token whose signature was edited', () => {
    const token = signToken('42:1', SECRET);
    const [payload, signature] = token.split('.');
    const flipped = signature[0] === 'A' ? 'B' : 'A';

    expect(
      verifyToken(`${payload}.${flipped}${signature.slice(1)}`, SECRET),
    ).toBeNull();
  });

  describe('rejects malformed input', () => {
    const cases: Record<string, string> = {
      empty: '',
      'no separator': 'abcdef',
      'empty payload': '.abcdef',
      'empty signature': 'abcdef.',
      'truncated signature': signToken('42:1', SECRET).slice(0, -4),
      'padded signature': `${signToken('42:1', SECRET)}AAAA`,
    };

    for (const [name, token] of Object.entries(cases)) {
      it(name, () => {
        expect(verifyToken(token, SECRET)).toBeNull();
      });
    }
  });
});
