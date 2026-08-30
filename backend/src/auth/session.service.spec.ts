import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { PrismaService } from '../prisma.service';
import { SESSION_COOKIE, SessionService } from './session.service';

const SECRET = 'a-test-secret-that-is-at-least-32-characters-long';

function configWith(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function responseSpy() {
  const cookie = jest.fn<void, [string, string, CookieOptions]>();
  const clearCookie = jest.fn<void, [string, CookieOptions]>();
  return {
    res: { cookie, clearCookie } as unknown as Response,
    cookie,
    clearCookie,
  };
}

function requestWith(cookies: Record<string, unknown>): Request {
  return { cookies } as unknown as Request;
}

/**
 * These talk to a real database on purpose. Revocation is the whole point of
 * the SessionInfo table, and a mocked Prisma would assert that the code calls
 * the methods this same file told it to call - it would pass whether or not a
 * revoked session is actually refused.
 */
describe('SessionService', () => {
  let service: SessionService;
  let prisma: PrismaService;

  let roleKey: number;
  let accountKey: number;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        PrismaService,
        {
          provide: ConfigService,
          useValue: configWith({ SESSION_SECRET: SECRET }),
        },
      ],
    }).compile();

    service = module.get(SessionService);
    prisma = module.get(PrismaService);

    const role = await prisma.roleInfo.create({
      data: { RoleName: 'Student' },
    });
    roleKey = role.RoleKey;

    const account = await prisma.accountInfo.create({
      data: {
        Email: 'session.service.spec@example.com',
        HashedPassword: 'not-a-real-hash',
        UserID: 'SESSIONSPEC1',
        UserFName: 'Session',
        UserLName: 'Spec',
        UserCredit: 100,
        RoleKey: roleKey,
      },
    });
    accountKey = account.AccountKey;
  }, 30_000);

  afterAll(async () => {
    try {
      // Sessions cascade from the account, so deleting it clears them too.
      if (accountKey)
        await prisma.accountInfo.delete({ where: { AccountKey: accountKey } });
      if (roleKey)
        await prisma.roleInfo.delete({ where: { RoleKey: roleKey } });
    } finally {
      await prisma?.$disconnect();
    }
  }, 30_000);

  afterEach(async () => {
    if (accountKey)
      await prisma.sessionInfo.deleteMany({
        where: { AccountKey: accountKey },
      });
  });

  it('issues a session that reads back as the same account', async () => {
    const { res } = responseSpy();
    const token = await service.issue(res, accountKey);

    await expect(
      service.read(requestWith({ [SESSION_COOKIE]: token })),
    ).resolves.toBe(accountKey);
  });

  it('stores a hash, never the token itself', async () => {
    const { res } = responseSpy();
    const token = await service.issue(res, accountKey);

    const rows = await prisma.sessionInfo.findMany({
      where: { AccountKey: accountKey },
      select: { TokenHash: true },
    });

    expect(rows).toHaveLength(1);
    // A dump of this table must not be replayable as a session.
    expect(rows[0].TokenHash).not.toContain(token);
    expect(token).not.toContain(rows[0].TokenHash);
  });

  it('sets the cookie so client-side JavaScript cannot read it', async () => {
    const { res, cookie } = responseSpy();
    await service.issue(res, accountKey);

    const [name, , options] = cookie.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE);
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(options.maxAge).toBeGreaterThan(0);
  });

  it('omits maxAge when the session is not persisted', async () => {
    const { res, cookie } = responseSpy();
    await service.issue(res, accountKey, false);

    expect(cookie.mock.calls[0][2].maxAge).toBeUndefined();
  });

  it('refuses a revoked session', async () => {
    const { res } = responseSpy();
    const token = await service.issue(res, accountKey);
    const req = requestWith({ [SESSION_COOKIE]: token });

    await expect(service.read(req)).resolves.toBe(accountKey);

    await service.revokeAllForAccount(accountKey);

    // The token is still perfectly well signed. Only the row says otherwise,
    // which is the entire reason the table exists.
    await expect(service.read(req)).resolves.toBeNull();
  });

  it('refuses an expired session even though the signature is valid', async () => {
    const { res } = responseSpy();
    const token = await service.issue(res, accountKey);

    await prisma.sessionInfo.updateMany({
      where: { AccountKey: accountKey },
      data: { ExpiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      service.read(requestWith({ [SESSION_COOKIE]: token })),
    ).resolves.toBeNull();
  });

  it('clear() revokes the row, not just the cookie', async () => {
    const { res, clearCookie } = responseSpy();
    const token = await service.issue(res, accountKey);
    const req = requestWith({ [SESSION_COOKIE]: token });

    await service.clear(req, res);

    expect(clearCookie).toHaveBeenCalled();
    await expect(service.read(req)).resolves.toBeNull();
  });

  it('revokeAllForAccount reports how many were live', async () => {
    const { res } = responseSpy();
    await service.issue(res, accountKey);
    await service.issue(res, accountKey);

    await expect(service.revokeAllForAccount(accountKey)).resolves.toBe(2);
    // Already revoked ones are not counted twice.
    await expect(service.revokeAllForAccount(accountKey)).resolves.toBe(0);
  });

  describe('read() returns null for', () => {
    it('no cookie at all', async () => {
      await expect(service.read(requestWith({}))).resolves.toBeNull();
    });

    it('a forged signature', async () => {
      const { res } = responseSpy();
      const token = await service.issue(res, accountKey);
      const tampered = `${token.slice(0, -2)}xy`;

      await expect(
        service.read(requestWith({ [SESSION_COOKIE]: tampered })),
      ).resolves.toBeNull();
    });

    it('a well-formed token for a session that was never stored', async () => {
      const { res } = responseSpy();
      const token = await service.issue(res, accountKey);
      await prisma.sessionInfo.deleteMany({
        where: { AccountKey: accountKey },
      });

      await expect(
        service.read(requestWith({ [SESSION_COOKIE]: token })),
      ).resolves.toBeNull();
    });
  });
});
