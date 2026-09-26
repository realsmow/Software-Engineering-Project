import { withOutputContracts } from '../fixtures/output-contracts';
import { adminContracts } from '../fixtures/service-contracts';
import { AdminService } from '../../src/admin/admin.service';
import { verifyPassword } from '../../src/common/crypto/password';

type AccountUpdateArgs = {
  where: { AccountKey: number };
  data: { HashedPassword: string };
};

function buildService() {
  const prisma = {
    accountInfo: {
      findUnique: jest.fn(({ where }: { where: { AccountKey: number } }) =>
        Promise.resolve({ AccountKey: where.AccountKey }),
      ),
      update: jest.fn((args: AccountUpdateArgs) => ({
        AccountKey: args.where.AccountKey,
      })),
    },
  };
  const sessions = { revokeAllForAccount: jest.fn().mockResolvedValue(1) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminService(
    prisma as never,
    null as never,
    sessions as never,
    audit as never,
    null as never,
    null as never,
    null as never,
  );
  withOutputContracts(service, adminContracts);

  return { service, prisma, sessions, audit };
}

describe('admin resetPassword', () => {
  it('hashes an explicit password, revokes sessions, and audits the change', async () => {
    const { service, prisma, sessions, audit } = buildService();
    const actor = { accountKey: 10, ip: '127.0.0.1', userAgent: 'node-test' };

    const result = await service.resetPassword(
      { id: 77, newPassword: 'StrongPass123!' },
      actor,
    );

    const updateArgs = prisma.accountInfo.update.mock.calls[0][0];
    expect(result).toEqual({ ok: true, temporaryPassword: null });
    expect(sessions.revokeAllForAccount).toHaveBeenCalledWith(77);
    expect(audit.record).toHaveBeenCalledWith(
      actor,
      'update',
      'account/77',
      'Password set by admin',
    );
    expect(updateArgs.where.AccountKey).toBe(77);
    expect(typeof updateArgs.data.HashedPassword).toBe('string');
    await expect(
      verifyPassword('StrongPass123!', updateArgs.data.HashedPassword),
    ).resolves.toBe(true);
  });

  it('generates a temporary password when none is provided', async () => {
    const { service, prisma, sessions, audit } = buildService();
    const actor = { accountKey: 42, ip: '127.0.0.1', userAgent: 'node-test' };

    const result = await service.resetPassword({ id: 88 }, actor);

    const updateArgs = prisma.accountInfo.update.mock.calls[0][0];
    expect(result.ok).toBe(true);
    expect(result.temporaryPassword).toEqual(expect.any(String));
    expect(result.temporaryPassword).toHaveLength(14);
    expect(sessions.revokeAllForAccount).toHaveBeenCalledWith(88);
    expect(audit.record).toHaveBeenCalledWith(
      actor,
      'update',
      'account/88',
      'Password reset, temporary password issued',
    );
    await expect(
      verifyPassword(result.temporaryPassword!, updateArgs.data.HashedPassword),
    ).resolves.toBe(true);
  });
});
