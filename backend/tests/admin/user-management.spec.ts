import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import {
  adminUserDetail,
  createUserInput,
  createUserOutput,
  listUsersInput,
  paginatedAdminUsers,
  setUserBanInput,
} from '../../src/admin/admin.schema';
import { AdminService } from '../../src/admin/admin.service';
import type { AuditActor } from '../../src/common/audit/audit.service';
import { BusinessError } from '../../src/common/errors/business-error';
import { PrismaService } from '../../src/prisma.service';

/**
 * FR-ADM-01..03 integration coverage.
 *
 * Each direct service call receives the parsed Zod shape that the tRPC router
 * would normally create. This is important for defaults such as `order` and
 * `days`, which are otherwise absent when bypassing the router.
 */
describe('AdminService user management', () => {
  let app: INestApplication;
  let adminService: AdminService;
  let prisma: PrismaService;
  let adminRoleKey: number;
  let staffRoleKey: number;
  let seededAdminKey: number;
  let seededStaffKey: number;
  let adminActor: AuditActor;
  let staffActor: AuditActor;

  const createdRoleKeys = new Set<number>();
  const createdUserKeys = new Set<number>();
  let sequence = 0;
  const unique = (prefix: string) => `${prefix}.${Date.now()}.${++sequence}`;

  async function roleKey(name: string) {
    const existing = await prisma.roleInfo.findFirst({
      where: { RoleName: name },
    });
    if (existing) return existing.RoleKey;
    const created = await prisma.roleInfo.create({ data: { RoleName: name } });
    createdRoleKeys.add(created.RoleKey);
    return created.RoleKey;
  }

  async function createBorrower(
    overrides: Partial<{ firstName: string; lastName: string }> = {},
  ) {
    const token = unique('admin-user-spec');
    const input = createUserInput.parse({
      email: `${token}@ku.th`,
      studentId: `UT${token.replace(/\D/g, '').slice(-10)}`,
      firstName: overrides.firstName ?? 'Test',
      lastName: overrides.lastName ?? 'Borrower',
      role: 'borrower',
      password: 'Password123!',
      initialCredit: 100,
    });
    const result = await adminService.createUser(input, adminActor);
    createdUserKeys.add(result.user.id);
    expect(createUserOutput.safeParse(result).success).toBe(true);
    return { input, result };
  }

  async function removeCreatedUsers() {
    const keys = [...createdUserKeys];
    createdUserKeys.clear();
    if (keys.length === 0) return;

    // PenaltyInfo is not cascaded from AccountInfo.
    await prisma.penaltyInfo.deleteMany({
      where: { AccountKey: { in: keys } },
    });
    await prisma.accountInfo.deleteMany({
      where: { AccountKey: { in: keys } },
    });
  }

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    adminService = module.get(AdminService);
    prisma = module.get(PrismaService);

    adminRoleKey = await roleKey('Admin');
    staffRoleKey = await roleKey('Staff');
    const [admin, staff] = await Promise.all([
      prisma.accountInfo.create({
        data: {
          Email: `${unique('admin-actor')}@ku.th`,
          UserID: `ADM${Date.now().toString().slice(-8)}`,
          UserFName: 'Admin',
          UserLName: 'Actor',
          HashedPassword: 'not-used-by-this-service-suite',
          RoleKey: adminRoleKey,
          UserCredit: 100,
        },
      }),
      prisma.accountInfo.create({
        data: {
          Email: `${unique('staff-actor')}@ku.th`,
          UserID: `STF${Date.now().toString().slice(-8)}`,
          UserFName: 'Staff',
          UserLName: 'Actor',
          HashedPassword: 'not-used-by-this-service-suite',
          RoleKey: staffRoleKey,
          UserCredit: 100,
        },
      }),
    ]);
    seededAdminKey = admin.AccountKey;
    seededStaffKey = staff.AccountKey;
    adminActor = { accountKey: seededAdminKey };
    staffActor = { accountKey: seededStaffKey };
  }, 30_000);

  afterEach(async () => {
    await removeCreatedUsers();
  });

  afterAll(async () => {
    try {
      await removeCreatedUsers();
      const actorKeys = [seededAdminKey, seededStaffKey].filter(
        Number.isInteger,
      );
      if (actorKeys.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { ActorKey: { in: actorKeys } },
        });
        await prisma.penaltyInfo.deleteMany({
          where: { AccountKey: { in: actorKeys } },
        });
        await prisma.accountInfo.deleteMany({
          where: { AccountKey: { in: actorKeys } },
        });
      }
      if (createdRoleKeys.size > 0) {
        await prisma.roleInfo.deleteMany({
          where: { RoleKey: { in: [...createdRoleKeys] } },
        });
      }
    } finally {
      await prisma?.$disconnect();
      await app?.close();
    }
  }, 30_000);

  it('creates a schema-valid borrower with a hashed caller-supplied password', async () => {
    // Arrange / Act
    const { input, result } = await createBorrower({
      firstName: 'Somsak',
      lastName: 'Jaidee',
    });

    // Assert
    expect(adminUserDetail.safeParse(result.user).success).toBe(true);
    expect(result.user).toMatchObject({
      email: input.email,
      studentId: input.studentId,
      firstName: 'Somsak',
      lastName: 'Jaidee',
      role: 'borrower',
      creditScore: 100,
    });
    expect(result.temporaryPassword).toBeNull();
    const stored = await prisma.accountInfo.findUnique({
      where: { AccountKey: result.user.id },
      select: { HashedPassword: true },
    });
    expect(stored?.HashedPassword).not.toBe(input.password);
    expect(stored?.HashedPassword.length).toBeGreaterThan(20);
  });

  it('generates a one-time password when the password is omitted', async () => {
    const token = unique('generated-password');
    const input = createUserInput.parse({
      email: `${token}@ku.th`,
      studentId: `AU${token.replace(/\D/g, '').slice(-10)}`,
      firstName: 'Auto',
      lastName: 'Generated',
      role: 'borrower',
    });

    const result = await adminService.createUser(input, adminActor);
    createdUserKeys.add(result.user.id);

    expect(createUserOutput.safeParse(result).success).toBe(true);
    expect(result.temporaryPassword).toHaveLength(14);
  });

  it('rejects invalid inputs at the Zod contract boundary', () => {
    expect(
      createUserInput.safeParse({
        email: 'not-an-email',
        studentId: '',
        firstName: 'Test',
        lastName: 'User',
        role: 'unknown',
      }).success,
    ).toBe(false);
    expect(
      setUserBanInput.safeParse({ id: 0, banned: true, days: 0 }).success,
    ).toBe(false);
  });

  it('rejects duplicate email and student ID', async () => {
    const { input } = await createBorrower();

    await expect(
      adminService.createUser(
        createUserInput.parse({ ...input, studentId: `${input.studentId}X` }),
        adminActor,
      ),
    ).rejects.toThrow(BusinessError);
    await expect(
      adminService.createUser(
        createUserInput.parse({
          ...input,
          email: `${unique('different')}@ku.th`,
        }),
        adminActor,
      ),
    ).rejects.toThrow(BusinessError);
  });

  it('updates only supplied profile fields', async () => {
    const { result } = await createBorrower({ lastName: 'Unchanged' });
    const updated = await adminService.updateUser(
      { id: result.user.id, firstName: 'Updated' },
      adminActor,
    );

    expect(updated).toMatchObject({
      firstName: 'Updated',
      lastName: 'Unchanged',
    });
  });

  it('returns a typed not-found error for mutations targeting an unknown account', async () => {
    await expect(
      adminService.updateUser({ id: 999_999_999, firstName: 'Nobody' }, adminActor),
    ).rejects.toMatchObject({ businessCode: 'USER_NOT_FOUND' });
    await expect(
      adminService.resetPassword({ id: 999_999_999 }, adminActor),
    ).rejects.toMatchObject({ businessCode: 'USER_NOT_FOUND' });
    await expect(
      adminService.setUserBan({ id: 999_999_999, banned: true, days: 7 }, staffActor),
    ).rejects.toMatchObject({ businessCode: 'USER_NOT_FOUND' });
    await expect(
      adminService.setUserActive({ id: 999_999_999, active: false }, adminActor),
    ).rejects.toMatchObject({ businessCode: 'USER_NOT_FOUND' });
  });

  it('changes a user role and preserves the detail contract', async () => {
    const { result } = await createBorrower();
    const updated = await adminService.changeRole(
      { id: result.user.id, role: 'staff' },
      adminActor,
    );

    expect(adminUserDetail.safeParse(updated).success).toBe(true);
    expect(updated.role).toBe('staff');
  });

  it('prevents an administrator from demoting themself', async () => {
    await expect(
      adminService.changeRole(
        { id: seededAdminKey, role: 'borrower' },
        adminActor,
      ),
    ).rejects.toMatchObject({ businessCode: 'CANNOT_MODIFY_SELF' });
  });

  it('resets a password manually or generates a new one when omitted', async () => {
    const { result } = await createBorrower();
    await expect(
      adminService.resetPassword(
        { id: result.user.id, newPassword: 'NewManualPassword123!' },
        adminActor,
      ),
    ).resolves.toMatchObject({ ok: true, temporaryPassword: null });

    const generated = await adminService.resetPassword(
      { id: result.user.id },
      adminActor,
    );
    expect(generated).toMatchObject({ ok: true });
    expect(generated.temporaryPassword).toHaveLength(14);
  });

  it('lists a schema-valid, searchable page using parsed pagination defaults', async () => {
    const { result } = await createBorrower({ firstName: 'Searchable' });
    const input = listUsersInput.parse({
      q: 'Searchable',
      page: 1,
      pageSize: 10,
    });
    const page = await adminService.listUsers(input);

    expect(paginatedAdminUsers.safeParse(page).success).toBe(true);
    expect(page.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: result.user.id })]),
    );
  });

  it('records and lifts a borrowing ban without deleting its history', async () => {
    const { result } = await createBorrower();
    const before = Date.now();
    await expect(
      adminService.setUserBan(
        setUserBanInput.parse({
          id: result.user.id,
          banned: true,
          days: 7,
          reason: 'Late return equipment violation',
        }),
        staffActor,
      ),
    ).resolves.toEqual({ ok: true });

    const activePenalty = await prisma.penaltyInfo.findFirst({
      where: { AccountKey: result.user.id, InEffect: true },
    });
    expect(activePenalty).toMatchObject({
      Reason: 'Late return equipment violation',
      InEffect: true,
    });
    expect(activePenalty?.ExpirationTime.getTime()).toBeGreaterThan(
      before + 6 * 24 * 60 * 60 * 1000,
    );

    await adminService.setUserBan(
      setUserBanInput.parse({ id: result.user.id, banned: false }),
      staffActor,
    );
    const penalties = await prisma.penaltyInfo.findMany({
      where: { AccountKey: result.user.id },
    });
    expect(penalties).toHaveLength(1);
    expect(penalties[0].InEffect).toBe(false);
  });

  it('prevents staff from banning themself', async () => {
    await expect(
      adminService.setUserBan(
        setUserBanInput.parse({ id: seededStaffKey, banned: true, days: 7 }),
        staffActor,
      ),
    ).rejects.toMatchObject({ businessCode: 'CANNOT_MODIFY_SELF' });
  });

  it('prevents an administrator from disabling their own account', async () => {
    await expect(
      adminService.setUserActive({ id: seededAdminKey, active: false }, adminActor),
    ).rejects.toMatchObject({ businessCode: 'CANNOT_MODIFY_SELF' });
  });

  it('disables and re-enables another account without treating it as a borrowing ban', async () => {
    const { result } = await createBorrower();

    await expect(
      adminService.setUserActive({ id: result.user.id, active: false }, adminActor),
    ).resolves.toEqual({ ok: true });
    await expect(adminService.getUserById(result.user.id)).resolves.toMatchObject({
      id: result.user.id,
      status: 'disabled',
    });

    await expect(
      adminService.setUserActive({ id: result.user.id, active: true }, adminActor),
    ).resolves.toEqual({ ok: true });
    await expect(adminService.getUserById(result.user.id)).resolves.toMatchObject({
      id: result.user.id,
      status: 'active',
    });

    expect(
      await prisma.penaltyInfo.count({ where: { AccountKey: result.user.id } }),
    ).toBe(0);
  });
});
