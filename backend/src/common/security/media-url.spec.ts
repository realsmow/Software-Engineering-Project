import { signMediaKey, verifyMediaKey } from './media-url';

const SECRET = 'a-test-secret-that-is-at-least-32-characters-long';

describe('signed media URLs', () => {
  it('accepts a valid, unexpired signature', () => {
    const exp = Date.now() + 60_000;
    const sig = signMediaKey('inspection/2026/09/a.jpg', exp, SECRET);

    expect(verifyMediaKey('inspection/2026/09/a.jpg', exp, sig, SECRET)).toBe(
      true,
    );
  });

  it('rejects an expired signature', () => {
    const exp = Date.now() - 1;
    const sig = signMediaKey('inspection/2026/09/a.jpg', exp, SECRET);

    expect(verifyMediaKey('inspection/2026/09/a.jpg', exp, sig, SECRET)).toBe(
      false,
    );
  });

  it('rejects a signature issued for a different key', () => {
    const exp = Date.now() + 60_000;
    const sig = signMediaKey('inspection/2026/09/a.jpg', exp, SECRET);

    expect(verifyMediaKey('inspection/2026/09/b.jpg', exp, sig, SECRET)).toBe(
      false,
    );
  });

  it('rejects a tampered signature', () => {
    const exp = Date.now() + 60_000;
    const sig = signMediaKey('inspection/2026/09/a.jpg', exp, SECRET);
    const flipped = sig[0] === 'A' ? 'B' : 'A';
    const tampered = `${flipped}${sig.slice(1)}`;

    expect(
      verifyMediaKey('inspection/2026/09/a.jpg', exp, tampered, SECRET),
    ).toBe(false);
  });

  it('rejects a signature extended with a longer expiry', () => {
    // Attacker takes a valid (key, exp, sig) and tries to push exp further
    // out without re-signing - sig no longer matches the new payload.
    const exp = Date.now() + 60_000;
    const sig = signMediaKey('inspection/2026/09/a.jpg', exp, SECRET);

    expect(
      verifyMediaKey('inspection/2026/09/a.jpg', exp + 3_600_000, sig, SECRET),
    ).toBe(false);
  });

  it('rejects a signature signed with a different secret', () => {
    const exp = Date.now() + 60_000;
    const sig = signMediaKey(
      'inspection/2026/09/a.jpg',
      exp,
      'a-different-secret-of-sufficient-length!!',
    );

    expect(verifyMediaKey('inspection/2026/09/a.jpg', exp, sig, SECRET)).toBe(
      false,
    );
  });

  it('rejects a non-finite expiry', () => {
    expect(
      verifyMediaKey('inspection/2026/09/a.jpg', NaN, 'whatever', SECRET),
    ).toBe(false);
  });
});
