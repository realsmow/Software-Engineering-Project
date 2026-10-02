import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';
import type { PrismaService } from '../prisma.service';
import type { SessionService } from './session.service';
import type { ConfigService } from '@nestjs/config';

const sendMail = jest.fn<
  Promise<unknown>,
  [{ to: string; from: string; text: string; subject: string }]
>();

jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail }),
}));

/**
 * Spending a reset link.
 *
 * The three ways a token can be unusable - forged, already spent, expired -
 * must be indistinguishable from outside, and none of them may change a
 * password. That is the whole security surface of this service.
 */
function build(row: unknown) {
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    passwordReset: { findUnique: jest.fn().mockResolvedValue(row), update },
    accountInfo: { update: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  } as unknown as PrismaService;

  const sessions = {
    revokeAllForAccount: jest.fn().mockResolvedValue(0),
  } as unknown as SessionService;

  const config = { get: () => undefined } as unknown as ConfigService;

  return {
    service: new PasswordResetService(prisma, sessions, config),
    prisma,
    sessions,
  };
}

const live = () => ({
  ResetKey: 1,
  AccountKey: 7,
  ExpiresAt: new Date(Date.now() + 60_000),
  UsedAt: null,
});

describe('PasswordResetService.reset', () => {
  it('sets the password and cuts off every session', async () => {
    const { service, prisma, sessions } = build(live());

    await service.reset('a-token', 'a new passphrase');

    expect(prisma.accountInfo.update).toHaveBeenCalled();
    expect(sessions.revokeAllForAccount).toHaveBeenCalledWith(7);
  });

  it('refuses a token that does not exist', async () => {
    const { service, prisma } = build(null);

    await expect(service.reset('forged', 'a new passphrase')).rejects.toThrow(
      'RESET_TOKEN_INVALID',
    );
    expect(prisma.accountInfo.update).not.toHaveBeenCalled();
  });

  it('refuses a token that has already been spent', async () => {
    const { service, prisma } = build({ ...live(), UsedAt: new Date() });

    await expect(service.reset('used', 'a new passphrase')).rejects.toThrow(
      'RESET_TOKEN_INVALID',
    );
    expect(prisma.accountInfo.update).not.toHaveBeenCalled();
  });

  it('refuses a token past its expiry', async () => {
    const { service, prisma } = build({
      ...live(),
      ExpiresAt: new Date(Date.now() - 1),
    });

    await expect(service.reset('stale', 'a new passphrase')).rejects.toThrow(
      'RESET_TOKEN_INVALID',
    );
    expect(prisma.accountInfo.update).not.toHaveBeenCalled();
  });
});

// Real service/adapter assertions share this module's suite; setup is scoped.
describe('Password reset requests and exact expiry', () => {
  const NOW = new Date('2031-09-26T03:00:00.000Z');

  const active = { AccountKey: 7, Email: 'borrower@ku.th', IsActive: true };

  function setup(account: typeof active | null = active) {
    const prisma = {
      accountInfo: {
        findFirst: jest.fn().mockResolvedValue(account),
        update: jest.fn(),
      },
      passwordReset: {
        create: jest.fn().mockResolvedValue({ ResetKey: 1 }),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const sessions = { revokeAllForAccount: jest.fn().mockResolvedValue(0) };
    const config = {
      get: (key: string) =>
        ({
          PUBLIC_APP_URL: 'https://qa.example.test///',
          MAIL_FROM: 'QA <noreply@ku.th>',
        })[key],
    };
    return {
      prisma,
      sessions,
      service: new PasswordResetService(
        prisma as unknown as PrismaService,
        sessions as unknown as SessionService,
        config as unknown as ConfigService,
      ),
    };
  }

  describe('FR-ADM-03 / authentication: forgotten-password request outcomes', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      sendMail.mockResolvedValue({});
      jest.useFakeTimers();
      jest.setSystemTime(NOW);
    });
    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it.each([null, { ...active, IsActive: false }])(
      'does not mail, issue a reset token, or activate an unknown/disabled account: %j',
      async (account) => {
        const f = setup(account);
        await expect(
          f.service.request('borrower@ku.th'),
        ).resolves.toBeUndefined();
        expect(f.prisma.passwordReset.create).not.toHaveBeenCalled();
        expect(sendMail).not.toHaveBeenCalled();
        expect(f.prisma.accountInfo.update).not.toHaveBeenCalled();
        expect(f.sessions.revokeAllForAccount).not.toHaveBeenCalled();
      },
    );

    it('accepts surrounding spaces and email casing without revealing account existence', async () => {
      const f = setup();
      await expect(
        f.service.request('  BORROWER@KU.TH  '),
      ).resolves.toBeUndefined();
      expect(f.prisma.accountInfo.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { Email: { equals: 'BORROWER@KU.TH', mode: 'insensitive' } },
        }),
      );
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: active.Email }),
      );
    });

    it('mails a usable link but persists only its hash with a 30-minute expiry', async () => {
      const f = setup();
      await f.service.request(active.Email);
      const message = sendMail.mock.calls[0][0];
      const match =
        /https:\/\/qa\.example\.test\/reset-password\?token=([\w-]+)/.exec(
          message.text,
        );
      expect(match).not.toBeNull();
      const token = match![1];
      expect(f.prisma.passwordReset.create).toHaveBeenCalledWith({
        data: {
          AccountKey: active.AccountKey,
          TokenHash: createHash('sha256').update(token).digest('hex'),
          ExpiresAt: new Date(NOW.getTime() + 30 * 60_000),
        },
      });
      expect(message.from).toBe('QA <noreply@ku.th>');
      expect(f.prisma.accountInfo.update).not.toHaveBeenCalled();
      expect(f.sessions.revokeAllForAccount).not.toHaveBeenCalled();
    });

    it('issues different links for two requests without storing either raw token', async () => {
      const f = setup();
      await f.service.request(active.Email);
      await f.service.request(active.Email);
      const tokens = sendMail.mock.calls.map(
        ([message]) => /token=([\w-]+)/.exec(message.text)![1],
      );
      expect(new Set(tokens).size).toBe(2);
      const stored = f.prisma.passwordReset.create.mock.calls.map(
        ([input]) => input.data.TokenHash,
      );
      expect(new Set(stored).size).toBe(2);
      for (const token of tokens) expect(stored).not.toContain(token);
    });

    it('does not expose an existing email or alter the account when delivery fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      sendMail.mockRejectedValueOnce(new Error('QA SMTP unavailable'));
      const f = setup();
      await expect(f.service.request(active.Email)).resolves.toBeUndefined();
      expect(f.prisma.passwordReset.create).toHaveBeenCalledTimes(1);
      expect(f.prisma.accountInfo.update).not.toHaveBeenCalled();
      expect(f.sessions.revokeAllForAccount).not.toHaveBeenCalled();
    });

    it('refuses a link at the exact expiry boundary and leaves password/session unchanged', async () => {
      const f = setup();
      f.prisma.passwordReset.findUnique.mockResolvedValue({
        ResetKey: 1,
        AccountKey: 7,
        UsedAt: null,
        ExpiresAt: NOW,
      });
      await expect(
        f.service.reset('expired-link', 'NewPassword123!'),
      ).rejects.toMatchObject({ businessCode: 'RESET_TOKEN_INVALID' });
      expect(f.prisma.passwordReset.update).not.toHaveBeenCalled();
      expect(f.prisma.accountInfo.update).not.toHaveBeenCalled();
      expect(f.sessions.revokeAllForAccount).not.toHaveBeenCalled();
    });
  });
});
