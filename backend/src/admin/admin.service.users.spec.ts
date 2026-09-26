import { AdminService } from './admin.service';
import type { PrismaService } from '../prisma.service';
import type { AuditActor, AuditService } from '../common/audit/audit.service';
import type { CreditTierService } from '../common/credit/credit-tier.service';
import type { SessionService } from '../auth/session.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { CronService } from '../cron/cron.service';
import type { ConfigService } from '@nestjs/config';

/**
 * createUser / updateUser / resetPassword — the account-writing procedures
 * changeRole's own spec (admin.service.spec.ts) does not cover.
 */
const ACTOR: AuditActor = { accountKey: 99, ip: null, userAgent: null };

const ROLE_ROWS = [
  { RoleKey: 1, RoleName: 'Student' },
  { RoleKey: 2, RoleName: 'Staff' },
  { RoleKey: 3, RoleName: 'Professor' },
  { RoleKey: 4, RoleName: 'Admin' },
];

function serviceWith(options: {
  clashingEmail?: boolean;
  clashingStudentId?: boolean;
  accountExists?: boolean;
}) {
  const findFirst = jest.fn().mockImplementation((args: any) => {
    if (args.where.Email && options.clashingEmail) {
      return Promise.resolve({ AccountKey: 1 });
    }
    if (args.where.UserID && options.clashingStudentId) {
      return Promise.resolve({ AccountKey: 1 });
    }
    return Promise.resolve(null);
  });

  const detailRow = {
    AccountKey: 7,
    UserID: 's1',
    UserFName: 'Ana',
    UserLName: 'Lek',
    Email: 'ana@ku.th',
    UserCredit: 100,
    IsActive: true,
    Role: { RoleName: 'Staff' },
    Authorities: [],
    Penalties: [],
  };

  const findUnique = jest.fn().mockImplementation(() => {
    if (options.accountExists === false) return Promise.resolve(null);
    return Promise.resolve(detailRow);
  });

  const create = jest.fn().mockResolvedValue({ AccountKey: 7 });
  const update = jest.fn().mockResolvedValue({ AccountKey: 7 });
  const record = jest.fn().mockResolvedValue(undefined);
  const revokeAllForAccount = jest.fn().mockResolvedValue(undefined);

  const prisma = {
    accountInfo: { findFirst, findUnique, create, update },
    roleInfo: { findMany: jest.fn().mockResolvedValue(ROLE_ROWS) },
  } as unknown as PrismaService;

  const service = new AdminService(
    prisma,
    {
      resolveBorrowLimits: jest.fn().mockResolvedValue({
        creditTier: 'D0',
        maxBorrowDays: 7,
        maxExtendTimes: 2,
      }),
    } as unknown as CreditTierService,
    { revokeAllForAccount } as unknown as SessionService,
    { record } as unknown as AuditService,
    {} as StaffScopeService,
    {} as ConfigService,
    {} as CronService,
  );

  return {
    service,
    findFirst,
    findUnique,
    create,
    update,
    record,
    revokeAllForAccount,
  };
}

describe('createUser', () => {
  it('refuses an email already in use', async () => {
    const t = serviceWith({ clashingEmail: true });
    await expect(
      t.service.createUser(
        {
          email: 'ana@ku.th',
          studentId: 's1',
          firstName: 'Ana',
          lastName: 'Lek',
          role: 'staff',
        } as never,
        ACTOR,
      ),
    ).rejects.toMatchObject({ businessCode: 'EMAIL_ALREADY_IN_USE' });
    expect(t.create).not.toHaveBeenCalled();
  });

  it('refuses a student ID already in use', async () => {
    const t = serviceWith({ clashingStudentId: true });
    await expect(
      t.service.createUser(
        {
          email: 'new@ku.th',
          studentId: 's1',
          firstName: 'Ana',
          lastName: 'Lek',
          role: 'staff',
        } as never,
        ACTOR,
      ),
    ).rejects.toMatchObject({ businessCode: 'USER_ID_ALREADY_IN_USE' });
  });

  it('creates the account at base credit and returns a generated password once', async () => {
    const t = serviceWith({});
    const result = await t.service.createUser(
      {
        email: 'new@ku.th',
        studentId: 's2',
        firstName: 'Ana',
        lastName: 'Lek',
        role: 'staff',
      } as never,
      ACTOR,
    );
    expect(t.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ UserCredit: 100 }),
      }),
    );
    expect(result.temporaryPassword).toEqual(expect.any(String));
    expect(t.record).toHaveBeenCalledWith(
      ACTOR,
      'create',
      'account/7',
      expect.stringContaining('new@ku.th'),
    );
  });

  it('does not generate a password when the admin supplied one', async () => {
    const t = serviceWith({});
    const result = await t.service.createUser(
      {
        email: 'new@ku.th',
        studentId: 's2',
        firstName: 'Ana',
        lastName: 'Lek',
        role: 'staff',
        password: 'supplied-pw',
      } as never,
      ACTOR,
    );
    expect(result.temporaryPassword).toBeNull();
  });
});

describe('updateUser', () => {
  it('refuses to update an account that does not exist', async () => {
    const t = serviceWith({ accountExists: false });
    await expect(
      t.service.updateUser({ id: 7, firstName: 'X' }, ACTOR),
    ).rejects.toMatchObject({ businessCode: 'USER_NOT_FOUND' });
    expect(t.update).not.toHaveBeenCalled();
  });

  it('refuses an update that collides with another account email', async () => {
    const t = serviceWith({ clashingEmail: true });
    await expect(
      t.service.updateUser({ id: 7, email: 'taken@ku.th' }, ACTOR),
    ).rejects.toMatchObject({ businessCode: 'EMAIL_ALREADY_IN_USE' });
  });

  it('updates only the sent fields and records the audit note', async () => {
    const t = serviceWith({});
    await t.service.updateUser({ id: 7, firstName: 'Ana2' }, ACTOR);
    expect(t.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AccountKey: 7 },
        data: expect.objectContaining({ UserFName: 'Ana2' }),
      }),
    );
    expect(t.record).toHaveBeenCalledWith(
      ACTOR,
      'update',
      'account/7',
      'Profile fields updated',
    );
  });
});

describe('resetPassword', () => {
  it('refuses to reset a password for an account that does not exist', async () => {
    const t = serviceWith({ accountExists: false });
    await expect(
      t.service.resetPassword({ id: 7 }, ACTOR),
    ).rejects.toMatchObject({ businessCode: 'USER_NOT_FOUND' });
  });

  it('generates a password, revokes every live session, and reports a generated reset', async () => {
    const t = serviceWith({});
    const result = await t.service.resetPassword({ id: 7 }, ACTOR);
    expect(t.revokeAllForAccount).toHaveBeenCalledWith(7);
    expect(result.temporaryPassword).toEqual(expect.any(String));
    expect(t.record).toHaveBeenCalledWith(
      ACTOR,
      'update',
      'account/7',
      expect.stringContaining('temporary password issued'),
    );
  });

  it('reports an admin-set password distinctly from a generated one', async () => {
    const t = serviceWith({});
    const result = await t.service.resetPassword(
      { id: 7, newPassword: 'admin-set-pw' },
      ACTOR,
    );
    expect(result.temporaryPassword).toBeNull();
    expect(t.record).toHaveBeenCalledWith(
      ACTOR,
      'update',
      'account/7',
      'Password set by admin',
    );
  });
});
