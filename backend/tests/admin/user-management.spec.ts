import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../src/generated/prisma/client';
import {
  userLoanHistory,
  adminUserDetail,
  createUserInput,
  createUserOutput,
  updateUserInput,
  createFacultyInput,
  createGroupInput,
  orgOutput,
  listUsersInput,
  paginatedAdminUsers,
} from '../../src/admin/admin.schema';
import { CreditTierService } from '../../src/common/credit/credit-tier.service';
import { StaffScopeService } from '../../src/common/authority/staff-scope.service';
import {
  inHistoryFixture,
  requireIsolatedDatabase,
  transactionClient,
} from '../fixtures/borrower-history';
import { requestFixture } from '../fixtures/loan-request';
import { pickupFixture } from '../fixtures/pickup';
import { freezeBusinessDate } from '../fixtures/business-clock';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
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

  const createdRoleKeys = new Set<number>();
  const createdUserKeys = new Set<number>();
  const createdTierKeys = new Set<number>();
  const coverageGroupKeys = new Set<number>();
  const coverageFacultyKeys = new Set<number>();
  const coverageAuthorityRoleKeys = new Set<number>();
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
    });
    const result = await adminService.createUser(input, adminActor);
    createdUserKeys.add(result.user.id);
    expect(createUserOutput.safeParse(result).success).toBe(true);
    return { input, result };
  }

  async function attachCoverageGroup(accountKey: number) {
    const faculty = await prisma.facultyInfo.create({
      data: { FacultyName: unique('user-management-faculty') },
    });
    coverageFacultyKeys.add(faculty.FacultyKey);

    const group = await prisma.managementGroup.create({
      data: { GroupType: 'Faculty' },
    });
    coverageGroupKeys.add(group.ManageGroupKey);

    await prisma.branchInfo.create({
      data: {
        BranchName: 'User-management coverage fixture',
        FacultyKey: faculty.FacultyKey,
        ManageGroupKey: group.ManageGroupKey,
      },
    });

    const authorityRole = await prisma.authorityRole.create({
      data: {
        AuthorityName: unique('user-management-authority'),
        AuthorityLevel: 2,
      },
    });
    coverageAuthorityRoleKeys.add(authorityRole.AuthorityRoleKey);

    await prisma.authority.create({
      data: {
        AccountKey: accountKey,
        ManageGroupKey: group.ManageGroupKey,
        AuthorityRoleKey: authorityRole.AuthorityRoleKey,
      },
    });

    return group.ManageGroupKey;
  }

  async function removeCoverageGroups() {
    const groupKeys = [...coverageGroupKeys];
    const facultyKeys = [...coverageFacultyKeys];
    const authorityRoleKeys = [...coverageAuthorityRoleKeys];
    coverageGroupKeys.clear();
    coverageFacultyKeys.clear();
    coverageAuthorityRoleKeys.clear();

    if (groupKeys.length > 0) {
      await prisma.authority.deleteMany({
        where: { ManageGroupKey: { in: groupKeys } },
      });
      await prisma.branchInfo.deleteMany({
        where: { ManageGroupKey: { in: groupKeys } },
      });
      await prisma.managementGroup.deleteMany({
        where: { ManageGroupKey: { in: groupKeys } },
      });
    }
    if (authorityRoleKeys.length > 0) {
      await prisma.authorityRole.deleteMany({
        where: { AuthorityRoleKey: { in: authorityRoleKeys } },
      });
    }
    if (facultyKeys.length > 0) {
      await prisma.facultyInfo.deleteMany({
        where: { FacultyKey: { in: facultyKeys } },
      });
    }
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
    requireIsolatedDatabase();
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    adminService = module.get(AdminService);
    prisma = module.get(PrismaService);

    adminRoleKey = await roleKey('Admin');
    staffRoleKey = await roleKey('Staff');

    const existingBorrowerRole = await prisma.roleInfo.findFirst({
      where: { RoleName: { in: ['Student', 'Borrower'] } },
    });
    if (!existingBorrowerRole) {
      await roleKey('Student');
    }

    const existingTier = await prisma.creditTier.findFirst({
      where: {
        CreditMin: { lte: 100 },
        CreditMax: { gte: 100 },
      },
    });
    if (!existingTier) {
      const tier = await prisma.creditTier.create({
        data: { CreditTierName: 'D0', CreditMin: 0, CreditMax: 100 },
      });
      createdTierKeys.add(tier.CreditTierKey);
    }

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
  }, 30_000);

  afterEach(async () => {
    await removeCoverageGroups();
    await removeCreatedUsers();
  });

  afterAll(async () => {
    try {
      await removeCoverageGroups();
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
        // A spec running in parallel may have put accounts on this role;
        // only a role nobody uses is ours to remove.
        await prisma.roleInfo.deleteMany({
          where: {
            RoleKey: { in: [...createdRoleKeys] },
            Accounts: { none: {} },
          },
        });
      }
      if (createdTierKeys.size > 0) {
        // Same as roles: other specs may have hung rules on this tier.
        await prisma.creditTier.deleteMany({
          where: {
            CreditTierKey: { in: [...createdTierKeys] },
            BorrowConstraints: { none: {} },
          },
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
      adminService.updateUser(
        { id: 999_999_999, firstName: 'Nobody' },
        adminActor,
      ),
    ).rejects.toMatchObject({ businessCode: 'USER_NOT_FOUND' });
    await expect(
      adminService.resetPassword({ id: 999_999_999 }, adminActor),
    ).rejects.toMatchObject({ businessCode: 'USER_NOT_FOUND' });
    await expect(
      adminService.setUserActive(
        { id: 999_999_999, active: false },
        adminActor,
      ),
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

  it('refuses a role demotion that would orphan the user-management department', async () => {
    const groupKey = await attachCoverageGroup(seededStaffKey);

    const error = (await adminService
      .changeRole({ id: seededStaffKey, role: 'borrower' }, adminActor)
      .catch((value: unknown) => value)) as BusinessError;

    expect(error).toBeInstanceOf(BusinessError);
    expect(error.businessCode).toBe('ROLE_CHANGE_WOULD_ORPHAN_GROUP');
    expect(error.details).toMatchObject({
      accountKey: seededStaffKey,
      from: 'staff',
      to: 'borrower',
      groups: [
        expect.objectContaining({
          manageGroupKey: groupKey,
          groupName: 'User-management coverage fixture',
          losing: 'staff',
          openWork: {
            pendingRequests: 0,
            pendingExtensions: 0,
            openLoans: 0,
            openRepairs: 0,
          },
        }),
      ],
    });
    expect(
      (
        await prisma.accountInfo.findUnique({
          where: { AccountKey: seededStaffKey },
          select: { RoleKey: true },
        })
      )?.RoleKey,
    ).toBe(staffRoleKey);
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

  it('prevents an administrator from disabling their own account', async () => {
    await expect(
      adminService.setUserActive(
        { id: seededAdminKey, active: false },
        adminActor,
      ),
    ).rejects.toMatchObject({ businessCode: 'CANNOT_MODIFY_SELF' });
  });

  it('refuses disabling the last staff member of the user-management department', async () => {
    const groupKey = await attachCoverageGroup(seededStaffKey);

    const error = (await adminService
      .setUserActive({ id: seededStaffKey, active: false }, adminActor)
      .catch((value: unknown) => value)) as BusinessError;

    expect(error).toBeInstanceOf(BusinessError);
    expect(error.businessCode).toBe('DISABLE_WOULD_ORPHAN_GROUP');
    expect(error.details).toMatchObject({
      accountKey: seededStaffKey,
      from: 'staff',
      groups: [
        expect.objectContaining({ manageGroupKey: groupKey, losing: 'staff' }),
      ],
    });
    expect(
      (
        await prisma.accountInfo.findUnique({
          where: { AccountKey: seededStaffKey },
          select: { IsActive: true },
        })
      )?.IsActive,
    ).toBe(true);
  });

  it('disables and re-enables another account without writing a penalty', async () => {
    const { result } = await createBorrower();

    await expect(
      adminService.setUserActive(
        { id: result.user.id, active: false },
        adminActor,
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      adminService.getUserById(result.user.id),
    ).resolves.toMatchObject({
      id: result.user.id,
      status: 'disabled',
    });

    await expect(
      adminService.setUserActive(
        { id: result.user.id, active: true },
        adminActor,
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      adminService.getUserById(result.user.id),
    ).resolves.toMatchObject({
      id: result.user.id,
      status: 'active',
    });

    expect(
      await prisma.penaltyInfo.count({ where: { AccountKey: result.user.id } }),
    ).toBe(0);
  });
});

// Real service/adapter assertions share this module's suite; setup is scoped.
describe('Persisted business records', () => {
  const NOW = new Date('2031-09-26T03:00:00Z');

  const DAY = 86_400_000;

  function service(
    tx: Prisma.TransactionClient,
    client = transactionClient(tx),
  ) {
    return new AdminService(
      client,
      new CreditTierService(client),
      {} as never,
      { record: jest.fn() } as never,
      new StaffScopeService(client),
      {} as never,
      {} as never,
    );
  }

  describe('FR-ADM-01/02: organizations and account memberships', () => {
    let prisma: PrismaService;
    const actor: AuditActor = { accountKey: 99 };
    beforeAll(async () => {
      requireIsolatedDatabase();
      prisma = new PrismaService();
      await prisma.$connect();
    });
    afterAll(async () => prisma?.$disconnect());

    const accountInput = (
      role: 'borrower' | 'staff' | 'supervisor' | 'admin' = 'borrower',
    ) => {
      const token = randomUUID();
      return createUserInput.parse({
        email: `org-${token}@ku.th`,
        studentId: token,
        firstName: 'Organization',
        lastName: 'QA',
        role,
        password: 'QaTest123!',
      });
    };

    async function organization(tx: Prisma.TransactionClient) {
      const svc = service(tx);
      const name = `org-${randomUUID()}`;
      const faculty = await svc.createFaculty(
        createFacultyInput.parse({ name }),
        actor,
      );
      const department = await svc.createGroup(
        createGroupInput.parse({
          name: `${name}-department`,
          facultyId: faculty.id,
        }),
        actor,
      );
      const club = await svc.createGroup(
        createGroupInput.parse({ name: `${name}-club` }),
        actor,
      );
      expect(department).toMatchObject({
        type: 'Faculty',
        facultyId: faculty.id,
      });
      expect(club).toMatchObject({ type: 'Club', facultyId: null });
      return { svc, faculty, department, club };
    }

    it('reads the faculty, its department and the independent club from persisted records', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await organization(tx);
        const listed = orgOutput.strict().parse(await f.svc.listOrg());
        expect(listed.faculties).toContainEqual(f.faculty);
        expect(listed.groups).toEqual(
          expect.arrayContaining([f.department, f.club]),
        );
        expect(
          await tx.branchInfo.findUniqueOrThrow({
            where: { ManageGroupKey: f.department.id },
          }),
        ).toMatchObject({ FacultyKey: f.faculty.id });
        expect(
          await tx.clubInfo.findUniqueOrThrow({
            where: { ManageGroupKey: f.club.id },
          }),
        ).toMatchObject({ ClubName: f.club.name });
      });
    });

    it.each(['borrower', 'staff', 'supervisor', 'admin'] as const)(
      'persists faculty and deduplicated memberships for a %s account with the correct member role',
      async (role) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await organization(tx);
          const result = createUserOutput.strict().parse(
            await f.svc.createUser(
              {
                ...accountInput(role),
                facultyId: f.faculty.id,
                groupIds: [f.department.id, f.club.id, f.department.id],
              },
              actor,
            ),
          );
          expect(result.user).toMatchObject({ facultyId: f.faculty.id, role });
          expect(result.user.authorities).toHaveLength(2);
          const members = await tx.authority.findMany({
            where: { AccountKey: result.user.id },
            include: { AuthorityRole: true },
          });
          expect(
            members.map((m) => m.ManageGroupKey).sort((a, b) => a - b),
          ).toEqual([f.department.id, f.club.id].sort((a, b) => a - b));
          expect(
            members.every(
              (m) =>
                m.AuthorityRole.AuthorityName ===
                (role === 'borrower' ? 'Student' : 'Lab staff'),
            ),
          ).toBe(true);
        });
      },
    );

    it('keeps memberships and member roles when a profile-only edit omits groupIds', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await organization(tx);
        const created = await f.svc.createUser(
          {
            ...accountInput(),
            facultyId: f.faculty.id,
            groupIds: [f.department.id],
          },
          actor,
        );
        const before = await tx.authority.findMany({
          where: { AccountKey: created.user.id },
        });
        const updated = adminUserDetail.strict().parse(
          await f.svc.updateUser(
            updateUserInput.parse({
              id: created.user.id,
              firstName: 'Edited',
            }),
            actor,
          ),
        );
        expect(updated).toMatchObject({
          firstName: 'Edited',
          facultyId: f.faculty.id,
        });
        expect(
          await tx.authority.findMany({
            where: { AccountKey: created.user.id },
          }),
        ).toEqual(before);
      });
    });

    it('allows clearing borrower memberships and faculty without changing the account role', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await organization(tx);
        const created = await f.svc.createUser(
          {
            ...accountInput(),
            facultyId: f.faculty.id,
            groupIds: [f.department.id, f.club.id],
          },
          actor,
        );
        const updated = await f.svc.updateUser(
          updateUserInput.parse({
            id: created.user.id,
            facultyId: null,
            groupIds: [],
          }),
          actor,
        );
        expect(updated).toMatchObject({
          role: 'borrower',
          facultyId: null,
          authorities: [],
        });
        expect(
          await tx.authority.count({ where: { AccountKey: created.user.id } }),
        ).toBe(0);
      });
    });

    it.each(['faculty', 'group'] as const)(
      'refuses an unknown %s before changing profile or memberships',
      async (field) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await organization(tx);
          const created = await f.svc.createUser(
            {
              ...accountInput(),
              facultyId: f.faculty.id,
              groupIds: [f.department.id],
            },
            actor,
          );
          const before = await tx.accountInfo.findUniqueOrThrow({
            where: { AccountKey: created.user.id },
          });
          const members = await tx.authority.findMany({
            where: { AccountKey: created.user.id },
          });
          await expect(
            f.svc.updateUser(
              updateUserInput.parse({
                id: created.user.id,
                firstName: 'Must not save',
                ...(field === 'faculty'
                  ? { facultyId: 2_147_483_600 }
                  : { groupIds: [2_147_483_600] }),
              }),
              actor,
            ),
          ).rejects.toMatchObject({
            businessCode:
              field === 'faculty' ? 'FACULTY_NOT_FOUND' : 'GROUP_NOT_FOUND',
          });
          expect(
            await tx.accountInfo.findUniqueOrThrow({
              where: { AccountKey: created.user.id },
            }),
          ).toEqual(before);
          expect(
            await tx.authority.findMany({
              where: { AccountKey: created.user.id },
            }),
          ).toEqual(members);
        });
      },
    );

    it('allows staff membership removal when another enabled staff member still covers the department', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await organization(tx);
        const target = await f.svc.createUser(
          { ...accountInput('staff'), groupIds: [f.department.id] },
          actor,
        );
        const peer = await f.svc.createUser(
          { ...accountInput('staff'), groupIds: [f.department.id] },
          actor,
        );
        const updated = await f.svc.updateUser(
          updateUserInput.parse({ id: target.user.id, groupIds: [] }),
          actor,
        );
        expect(updated.authorities).toEqual([]);
        expect(
          await tx.authority.findMany({
            where: { ManageGroupKey: f.department.id },
          }),
        ).toEqual([expect.objectContaining({ AccountKey: peer.user.id })]);
      });
    });

    describe('known defect: membership removal bypasses the last-staff coverage guard', () => {
      let removed: boolean;
      beforeEach(async () => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await organization(tx);
          const target = await f.svc.createUser(
            { ...accountInput('staff'), groupIds: [f.department.id] },
            actor,
          );
          // Existing policy controls: the same account cannot be demoted or disabled.
          await expect(
            f.svc.changeRole({ id: target.user.id, role: 'borrower' }, actor),
          ).rejects.toMatchObject({
            businessCode: 'ROLE_CHANGE_WOULD_ORPHAN_GROUP',
          });
          await expect(
            f.svc.setUserActive({ id: target.user.id, active: false }, actor),
          ).rejects.toMatchObject({
            businessCode: 'DISABLE_WOULD_ORPHAN_GROUP',
          });
          try {
            await f.svc.updateUser(
              updateUserInput.parse({ id: target.user.id, groupIds: [] }),
              actor,
            );
          } catch (error) {
            expect(error).toBeInstanceOf(BusinessError);
            expect((error as BusinessError).businessCode).toMatch(
              /ORPHAN_GROUP/,
            );
          }
          const members = await tx.authority.findMany({
            where: { AccountKey: target.user.id },
          });
          removed = !members.some((m) => m.ManageGroupKey === f.department.id);
          expect(
            await tx.accountInfo.findUniqueOrThrow({
              where: { AccountKey: target.user.id },
            }),
          ).toMatchObject({ IsActive: true });
        });
      });
      // Reproduced against PostgreSQL before marking this product assertion.
      it.failing(
        'retains the last enabled staff member in the department',
        () => {
          expect(removed).toBe(false);
        },
      );
    });

    describe.each(['create', 'update'] as const)(
      'known defect: membership write failure during account %s',
      (operation) => {
        let accountChanged: boolean;
        beforeEach(async () => {
          await inHistoryFixture(prisma, async (tx) => {
            const f = await organization(tx);
            const input = accountInput();
            const initial =
              operation === 'update'
                ? await f.svc.createUser(input, actor)
                : null;
            const failure = new Error('QA injected membership storage failure');
            const client = transactionClient(tx);
            const failingClient = new Proxy(client, {
              get(target, key) {
                if (key === '$transaction')
                  return (work: unknown) => {
                    // Fail only the membership transaction. Profile/account SQL stays real.
                    if (Array.isArray(work)) return Promise.reject(failure);
                    return target.$transaction(
                      work as (t: Prisma.TransactionClient) => Promise<unknown>,
                    );
                  };
                return Reflect.get(target, key) as unknown;
              },
            });
            const svc = service(tx, failingClient);
            const attempted =
              operation === 'create'
                ? svc.createUser(
                    { ...input, groupIds: [f.department.id] },
                    actor,
                  )
                : svc.updateUser(
                    updateUserInput.parse({
                      id: initial!.user.id,
                      firstName: 'Partial save',
                      groupIds: [f.department.id],
                    }),
                    actor,
                  );
            await expect(attempted).rejects.toBe(failure);
            const saved = await tx.accountInfo.findUnique({
              where: { Email: input.email },
            });
            accountChanged =
              operation === 'create'
                ? saved !== null
                : saved?.UserFName !== input.firstName;
            expect(
              await tx.authority.count({
                where: { Account: { Email: input.email } },
              }),
            ).toBe(0);
          });
        });
        it.failing(
          'leaves no partial account/profile changes when the operation fails',
          () => {
            expect(accountChanged).toBe(false);
          },
        );
      },
    );
  });

  describe('FR-ADM-01 / NFR-SEC-03: account details and search from actual records', () => {
    let prisma: PrismaService;
    beforeAll(async () => {
      requireIsolatedDatabase();
      prisma = new PrismaService();
      await prisma.$connect();
    });
    afterAll(async () => prisma?.$disconnect());
    beforeEach(() => freezeBusinessDate(NOW));
    afterEach(() => jest.useRealTimers());

    it('reads creation time and the newest sign-in while excluding expired and revoked penalties', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await requestFixture(tx),
          accountKey = f.accounts[0].AccountKey;
        const createdAt = new Date(NOW.getTime() - 10 * DAY),
          recent = new Date(NOW.getTime() - DAY);
        await tx.accountInfo.update({
          where: { AccountKey: accountKey },
          data: { CreatedAt: createdAt, UserCredit: 88 },
        });
        for (const [issuedAt, revoked] of [
          [new Date(NOW.getTime() - 2 * DAY), false],
          [recent, true],
        ] as const) {
          await tx.sessionInfo.create({
            data: {
              AccountKey: accountKey,
              TokenHash: randomUUID(),
              IssuedAt: issuedAt,
              ExpiresAt: new Date(NOW.getTime() + DAY),
              RevokedAt: revoked ? NOW : null,
            },
          });
        }
        const active = await tx.penaltyInfo.create({
          data: {
            AccountKey: accountKey,
            CreditDeducted: 12,
            Reason: 'ReturnLate',
            ActionTime: NOW,
            ExpirationTime: new Date(NOW.getTime() + DAY),
            InEffect: true,
            Appealed: false,
          },
        });
        await tx.penaltyInfo.create({
          data: {
            AccountKey: accountKey,
            CreditDeducted: 40,
            ExpirationTime: NOW,
            InEffect: true,
          },
        });
        await tx.penaltyInfo.create({
          data: {
            AccountKey: accountKey,
            CreditDeducted: 40,
            ExpirationTime: new Date(NOW.getTime() + DAY),
            InEffect: false,
          },
        });
        const extra = await tx.managementGroup.create({
          data: { GroupType: 'Club' },
        });
        await tx.authority.create({
          data: {
            AccountKey: accountKey,
            ManageGroupKey: extra.ManageGroupKey,
            AuthorityRoleKey: f.authorityRole.AuthorityRoleKey,
          },
        });
        const output = adminUserDetail
          .strict()
          .parse(await service(tx).getUserById(accountKey));
        expect(output).toMatchObject({
          id: accountKey,
          createdAt: createdAt.toISOString(),
          lastActiveAt: recent.toISOString(),
          creditScore: 88,
          creditTier: 'D0',
        });
        expect(output.activePenalties.map((row) => row.id)).toEqual([
          active.PenaltyKey,
        ]);
        expect(
          output.authorities.map((row) => row.manageGroupKey).sort(),
        ).toEqual([f.group.ManageGroupKey, extra.ManageGroupKey].sort());
        expect(output).not.toHaveProperty('HashedPassword');
      });
    });

    it('reports no last active time for an account that has never signed in', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await requestFixture(tx);
        expect(
          await service(tx).getUserById(f.accounts[0].AccountKey),
        ).toMatchObject({ lastActiveAt: null, activePenalties: [] });
      });
    });

    it('combines role, active status, case-insensitive search and pagination', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await requestFixture(tx);
        await tx.accountInfo.update({
          where: { AccountKey: f.accounts[1].AccountKey },
          data: { IsActive: false },
        });
        const svc = service(tx);
        const visible = paginatedAdminUsers.strict().parse(
          await svc.listUsers(
            listUsersInput.parse({
              q: f.item.ItemName!.toUpperCase(),
              role: 'borrower',
              status: 'active',
            }),
          ),
        );
        expect(visible.total).toBe(1);
        expect(visible.items[0]).toMatchObject({
          id: f.accounts[0].AccountKey,
          role: 'borrower',
          status: 'active',
        });
        const first = await svc.listUsers(
          listUsersInput.parse({ q: f.item.ItemName!, pageSize: 1 }),
        );
        const second = await svc.listUsers(
          listUsersInput.parse({ q: f.item.ItemName!, pageSize: 1, page: 2 }),
        );
        expect([first.total, second.total]).toEqual([2, 2]);
        expect([first.items[0].id, second.items[0].id]).toEqual(
          f.accounts.map((row) => row.AccountKey),
        );
      });
    });

    it('excludes matching borrowers in another department from the staff lookup', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const own = await pickupFixture(tx),
          foreign = await requestFixture(tx);
        const q = `scope-${randomUUID()}`;
        await tx.accountInfo.updateMany({
          where: {
            AccountKey: {
              in: [own.accounts[0].AccountKey, foreign.accounts[0].AccountKey],
            },
          },
          data: { UserFName: q },
        });
        const output = paginatedAdminUsers.parse(
          await service(tx).listUsersInScope(
            own.staff,
            listUsersInput.parse({ q, role: 'borrower' }),
          ),
        );
        expect(output.total).toBe(1);
        expect(output.items[0].id).toBe(own.accounts[0].AccountKey);
      });
    });

    it("returns only the addressed account's real loan history with nullable check-in time", async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await pickupFixture(tx);
        const condition = await tx.conditionLog.create({
          data: {
            ResourceKey: f.units[0].ResourceKey,
            LoggedBy: f.staff.accountKey,
            Condition: 'Normal',
            LoggedAt: NOW,
          },
        });
        const create = (
          accountKey: number,
          resourceKey: number,
          checkout: Date,
          returned: boolean,
        ) =>
          tx.usageLog.create({
            data: {
              AccountKey: accountKey,
              ResourceKey: resourceKey,
              CheckoutCondition: condition.ConditionKey,
              CheckoutTime: checkout,
              DueTime: NOW,
              CurrentStatus: returned ? 'Inspected' : 'Lended',
              CheckInTime: returned ? NOW : null,
            },
          });
        const old = await create(
          f.accounts[0].AccountKey,
          f.units[0].ResourceKey,
          new Date(NOW.getTime() - 2 * DAY),
          true,
        );
        const current = await create(
          f.accounts[0].AccountKey,
          f.units[0].ResourceKey,
          new Date(NOW.getTime() - DAY),
          false,
        );
        const otherCondition = await tx.conditionLog.create({
          data: {
            ResourceKey: f.units[1].ResourceKey,
            LoggedBy: f.staff.accountKey,
            Condition: 'Normal',
            LoggedAt: NOW,
          },
        });
        await tx.usageLog.create({
          data: {
            AccountKey: f.accounts[1].AccountKey,
            ResourceKey: f.units[1].ResourceKey,
            CheckoutCondition: otherCondition.ConditionKey,
            CheckoutTime: NOW,
            DueTime: new Date(NOW.getTime() + DAY),
            CurrentStatus: 'Lended',
          },
        });
        const output = userLoanHistory.parse(
          await service(tx).getUserLoans(f.accounts[0].AccountKey),
        );
        expect(output.map((row) => row.id)).toEqual([
          current.UsageKey,
          old.UsageKey,
        ]);
        expect(output[0]).toMatchObject({
          itemName: f.item.ItemName,
          checkInTime: null,
        });
        expect(output[1].checkInTime).toBe(NOW.toISOString());
      });
    });
  });
});
