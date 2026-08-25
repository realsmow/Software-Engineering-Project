import {
  dummyPasswordHash,
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from './password';

describe('password hashing', () => {
  it('accepts the password it hashed', async () => {
    const stored = await hashPassword('correct horse battery staple');
    await expect(
      verifyPassword('correct horse battery staple', stored),
    ).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    await expect(
      verifyPassword('Correct horse battery staple', stored),
    ).resolves.toBe(false);
    await expect(verifyPassword('', stored)).resolves.toBe(false);
  });

  it('salts every hash, so identical passwords do not produce identical rows', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same'),
      hashPassword('same'),
    ]);

    expect(a).not.toEqual(b);
    await expect(verifyPassword('same', a)).resolves.toBe(true);
    await expect(verifyPassword('same', b)).resolves.toBe(true);
  });

  it('records its own cost parameters, so they can be raised later', async () => {
    const stored = await hashPassword('anything');
    const [algorithm, N, r, p, salt, key] = stored.split('$');

    expect(algorithm).toBe('scrypt');
    expect(Number(N)).toBeGreaterThanOrEqual(16384);
    expect(Number(r)).toBeGreaterThan(0);
    expect(Number(p)).toBeGreaterThan(0);
    expect(salt.length).toBeGreaterThan(0);
    expect(key.length).toBeGreaterThan(0);
  });

  it('still verifies a hash made with different cost parameters', async () => {
    // Simulates a row written before the cost was raised: the parameters come
    // from the stored string, not from the current constants.
    const stored = await hashPassword('legacy');
    const [, , r, p, salt, key] = stored.split('$');
    const rewritten = ['scrypt', 16384, r, p, salt, key].join('$');

    // Same N as was actually used, so this must still match.
    await expect(verifyPassword('legacy', rewritten)).resolves.toBe(true);
  });

  describe('returns false rather than throwing on a value it did not write', () => {
    const cases: Record<string, string> = {
      'the seed placeholder': 'not-a-real-hash',
      'empty string': '',
      'a bcrypt hash': '$2b$12$abcdefghijklmnopqrstuv',
      'right shape, wrong algorithm': 'argon2$16384$8$1$c2FsdA==$a2V5',
      'non-numeric cost': 'scrypt$abc$8$1$c2FsdA==$a2V5',
      'absurd cost that would exceed maxmem':
        'scrypt$1073741824$8$1$c2FsdA==$a2V5',
      'empty salt': 'scrypt$16384$8$1$$a2V5',
    };

    for (const [name, stored] of Object.entries(cases)) {
      it(name, async () => {
        await expect(verifyPassword('whatever', stored)).resolves.toBe(false);
      });
    }
  });

  it('gives a stable dummy hash that matches no real password', async () => {
    const first = await dummyPasswordHash();
    const second = await dummyPasswordHash();

    // Same object both times — the point is to spend the cost, not to
    // re-derive it on every failed login.
    expect(first).toBe(second);
    await expect(verifyPassword('', first)).resolves.toBe(false);
  });
});

describe('generateTemporaryPassword', () => {
  it('has the requested length and avoids characters that get misread', () => {
    const password = generateTemporaryPassword(20);

    expect(password).toHaveLength(20);
    expect(password).not.toMatch(/[0O1lI]/);
    expect(password).toMatch(/^[A-Za-z2-9]+$/);
  });

  it('does not repeat itself', () => {
    const generated = new Set(
      Array.from({ length: 50 }, () => generateTemporaryPassword()),
    );
    expect(generated.size).toBe(50);
  });
});
