import { PasswordResetService } from './password-reset.service';
import type { PrismaService } from '../prisma.service';
import type { SessionService } from './session.service';
import type { ConfigService } from '@nestjs/config';

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
