const test = require('node:test');
const assert = require('node:assert/strict');

const { AdminService } = require('../../dist/src/admin/admin.service.js');
const { verifyPassword } = require('../../dist/src/common/crypto/password.js');

function buildService() {
  let lastUpdate = null;
  let revokedFor = null;
  let auditEntry = null;

  const prisma = {
    accountInfo: {
      update: async (args) => {
        lastUpdate = args;
        return { AccountKey: args.where.AccountKey };
      },
    },
  };

  const sessions = {
    revokeAllForAccount: async (accountId) => {
      revokedFor = accountId;
      return true;
    },
  };

  const audit = {
    record: async (...args) => {
      auditEntry = args;
      return true;
    },
  };

  const service = new AdminService(prisma, null, sessions, audit);
  service.assertAccountExists = async () => {};

  return { service, getLastUpdate: () => lastUpdate, getRevokedFor: () => revokedFor, getAuditEntry: () => auditEntry };
}

test('admin resetPassword with explicit newPassword hashes it, revokes sessions, and audits the change', async () => {
  const { service, getLastUpdate, getRevokedFor, getAuditEntry } = buildService();
  const actor = { accountKey: 10, ip: '127.0.0.1', userAgent: 'node-test' };

  const result = await service.resetPassword({ id: 77, newPassword: 'StrongPass123!' }, actor);

  const updateArgs = getLastUpdate();
  const auditEntry = getAuditEntry();

  assert.equal(result.ok, true);
  assert.equal(result.temporaryPassword, null);
  assert.equal(getRevokedFor(), 77);
  assert.equal(auditEntry[0].accountKey, 10);
  assert.equal(auditEntry[1], 'update');
  assert.equal(auditEntry[2], 'account/77');
  assert.equal(auditEntry[3], 'Password set by admin');
  assert.equal(updateArgs.where.AccountKey, 77);
  assert.equal(typeof updateArgs.data.HashedPassword, 'string');
  assert.ok(await verifyPassword('StrongPass123!', updateArgs.data.HashedPassword));
});

test('admin resetPassword without explicit newPassword generates a temporary password', async () => {
  const { service, getLastUpdate, getRevokedFor, getAuditEntry } = buildService();
  const actor = { accountKey: 42, ip: '127.0.0.1', userAgent: 'node-test' };

  const result = await service.resetPassword({ id: 88 }, actor);

  const updateArgs = getLastUpdate();
  const auditEntry = getAuditEntry();

  assert.equal(result.ok, true);
  assert.equal(typeof result.temporaryPassword, 'string');
  assert.equal(result.temporaryPassword.length, 14);
  assert.equal(getRevokedFor(), 88);
  assert.equal(auditEntry[0].accountKey, 42);
  assert.equal(auditEntry[1], 'update');
  assert.equal(auditEntry[2], 'account/88');
  assert.equal(auditEntry[3], 'Password reset, temporary password issued');
  assert.ok(await verifyPassword(result.temporaryPassword, updateArgs.data.HashedPassword));
});
