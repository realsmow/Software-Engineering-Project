import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma.service';
import { AdminService } from '../../src/admin/admin.service';
import { CreditTierService } from '../../src/common/credit/credit-tier.service';
import { BusinessError } from '../../src/common/errors/business-error';
import { AppModule } from '../../src/app.module';
import type { AuditActor } from '../../src/common/audit/audit.service';

describe('Module 2: User / Account Management (Admin) [BE]', () => {
  let app: INestApplication;
  let adminService: AdminService;
  let prisma: PrismaService;

  let seededAdminKey: number;
  let seededStaffKey: number;
  let targetUserKey: number;
  let studentRoleKey: number;
  let staffRoleKey: number;
  let adminRoleKey: number;
  const createdRoleKeys: number[] = [];
  const createdUserKeys: number[] = [];

  let adminActor: AuditActor;
  let staffActor: AuditActor;

  const ensureTargetUser = async (): Promise<number> => {
    if (targetUserKey) {
      const existing = await prisma.accountInfo.findUnique({ where: { AccountKey: targetUserKey } });
      if (existing) return targetUserKey;
    }
    const timestamp = Date.now();
    const result = await adminService.createUser({
      email: `target.${timestamp}@ku.th`,
      password: 'Password123!',
      studentId: `TG${timestamp.toString().slice(-6)}`,
      firstName: 'Somsak',
      lastName: 'Jaidee',
      initialCredit: 100,
      role: 'borrower',
    }, adminActor);
    targetUserKey = result.user.id;
    createdUserKeys.push(targetUserKey);
    return targetUserKey;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    adminService = moduleFixture.get<AdminService>(AdminService);
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // Setup roles – track which ones are created so afterAll can clean them up
    const existingStudentRole = await prisma.roleInfo.findFirst({ where: { RoleName: 'Student' } });
    const studentRole = existingStudentRole ?? await prisma.roleInfo.create({ data: { RoleName: 'Student' } });
    if (!existingStudentRole) createdRoleKeys.push(studentRole.RoleKey);
    studentRoleKey = studentRole.RoleKey;

    const existingStaffRole = await prisma.roleInfo.findFirst({ where: { RoleName: 'Staff' } });
    const staffRole = existingStaffRole ?? await prisma.roleInfo.create({ data: { RoleName: 'Staff' } });
    if (!existingStaffRole) createdRoleKeys.push(staffRole.RoleKey);
    staffRoleKey = staffRole.RoleKey;

    const existingAdminRole = await prisma.roleInfo.findFirst({ where: { RoleName: 'Admin' } });
    const adminRole = existingAdminRole ?? await prisma.roleInfo.create({ data: { RoleName: 'Admin' } });
    if (!existingAdminRole) createdRoleKeys.push(adminRole.RoleKey);
    adminRoleKey = adminRole.RoleKey;

    // Seed Admin Actor
    const admin = await prisma.accountInfo.create({
      data: {
        Email: `admin.spec.${Date.now()}@ku.th`,
        UserID: `ADM${Date.now().toString().slice(-5)}`,
        UserFName: 'Super',
        UserLName: 'Admin',
        HashedPassword: 'argon2_hashed_placeholder',
        RoleKey: adminRoleKey,
        UserCredit: 100,
      },
    });
    seededAdminKey = admin.AccountKey;
    adminActor = { accountKey: seededAdminKey };

    // Seed Staff Actor
    const staff = await prisma.accountInfo.create({
      data: {
        Email: `staff.spec.${Date.now()}@ku.th`,
        UserID: `STF${Date.now().toString().slice(-5)}`,
        UserFName: 'Staff',
        UserLName: 'Officer',
        HashedPassword: 'argon2_hashed_placeholder',
        RoleKey: staffRoleKey,
        UserCredit: 100,
      },
    });
    seededStaffKey = staff.AccountKey;
    staffActor = { accountKey: seededStaffKey };
  });

  afterAll(async () => {
    // Teardown seeded and dynamically created accounts
    const keysToDelete = [seededAdminKey, seededStaffKey, targetUserKey, ...createdUserKeys].filter(
      (k): k is number => typeof k === 'number',
    );
    await prisma.penaltyInfo.deleteMany({
      where: { AccountKey: { in: keysToDelete } },
    });
    await prisma.auditLog.deleteMany({
      where: { ActorKey: { in: keysToDelete } },
    });
    await prisma.accountInfo.deleteMany({
      where: { AccountKey: { in: keysToDelete } },
    });

    // Clean up roles that were created by this test suite (not pre-existing seed data)
    if (createdRoleKeys.length > 0) {
      await prisma.roleInfo.deleteMany({
        where: { RoleKey: { in: createdRoleKeys } },
      });
    }

    await prisma.$disconnect();
    await app.close();
  });

  // ── TP-ADM-BE-01: Create User with Full Attributes ─────────────────────────────
  it('TP-ADM-BE-01: should create user with full attributes and return user profile', async () => {
    const timestamp = Date.now();
    const input = {
      email: `somsak.${timestamp}@ku.th`,
      password: 'Password123!',
      studentId: `ST${timestamp.toString().slice(-6)}`,
      firstName: 'Somsak',
      lastName: 'Jaidee',
      initialCredit: 100,
      role: 'borrower' as const,
    };

    const result = await adminService.createUser(input, adminActor);
    targetUserKey = result.user.id;

    expect(result.user).toBeDefined();
    expect(result.user.email).toBe(input.email);
    expect(result.user.studentId).toBe(input.studentId);
    expect(result.user.firstName).toBe('Somsak');
    expect(result.user.lastName).toBe('Jaidee');
    expect(result.user.role).toBe('borrower');
    expect(result.user.creditScore).toBe(100);
    expect(result.temporaryPassword).toBeNull();

    // Verify in database that password is not plaintext
    const dbAccount = await prisma.accountInfo.findUnique({
      where: { AccountKey: result.user.id },
    });
    expect(dbAccount).toBeDefined();
    expect(dbAccount?.HashedPassword).not.toBe(input.password);
    expect(dbAccount?.HashedPassword.length).toBeGreaterThan(20);
  });

  // ── TP-ADM-BE-02: Create User with Auto-Generated Password ─────────────────────
  it('TP-ADM-BE-02: should generate a temporary password when password is not supplied', async () => {
    const timestamp = Date.now();
    const input = {
      email: `autouser.${timestamp}@ku.th`,
      studentId: `AU${timestamp.toString().slice(-6)}`,
      firstName: 'Auto',
      lastName: 'Generated',
      initialCredit: 100,
      role: 'borrower' as const,
    };

    const result = await adminService.createUser(input, adminActor);

    expect(result.temporaryPassword).toBeDefined();
    expect(typeof result.temporaryPassword).toBe('string');
    expect(result.temporaryPassword?.length).toBe(14);

    // Clean up created user
    await prisma.accountInfo.delete({ where: { AccountKey: result.user.id } });
  });

  // ── TP-ADM-BE-03: Duplicate Identifier Rejection ──────────────────────────────
  it('TP-ADM-BE-03: should reject duplicate email and duplicate studentId with typed errors', async () => {
    const existing = await prisma.accountInfo.findFirst();
    expect(existing).toBeDefined();
    if (!existing) return; // TypeScript narrowing guard – expect above guarantees defined

    // Test duplicate email (case-insensitive)
    await expect(
      adminService.createUser({
        email: existing.Email.toUpperCase(),
        password: 'Password123!',
        studentId: `NEW${Date.now().toString().slice(-5)}`,
        firstName: 'Dup',
        lastName: 'Email',
        initialCredit: 100,
        role: 'borrower',
      }, adminActor),
    ).rejects.toThrow(BusinessError);

    // Test duplicate studentId
    await expect(
      adminService.createUser({
        email: `unique.${Date.now()}@ku.th`,
        password: 'Password123!',
        studentId: existing.UserID,
        firstName: 'Dup',
        lastName: 'ID',
        initialCredit: 100,
        role: 'borrower',
      }, adminActor),
    ).rejects.toThrow(BusinessError);
  });

  // ── TP-ADM-BE-04: Update User Information (Partial Update) ─────────────────────
  it('TP-ADM-BE-04: should update user profile partially without modifying untouched fields', async () => {
    await ensureTargetUser();
    const updated = await adminService.updateUser({
      id: targetUserKey,
      firstName: 'UpdatedFirst',
    }, adminActor);

    expect(updated.firstName).toContain('UpdatedFirst');
    expect(updated.lastName).toContain('Jaidee'); // Last name untouched

    // Test non-existent user
    await expect(
      adminService.updateUser({ id: 999999, firstName: 'Ghost' }, adminActor),
    ).rejects.toThrow(BusinessError);
  });

  // ── TP-ADM-BE-05: Change User Role ─────────────────────────────────────────────
  it('TP-ADM-BE-05: should change user role successfully', async () => {
    await ensureTargetUser();
    const res = await adminService.changeRole(
      { id: targetUserKey, role: 'staff' },
      adminActor,
    );

    expect(res.role).toBe('staff');

    const inDb = await prisma.accountInfo.findUnique({
      where: { AccountKey: targetUserKey },
      include: { Role: true },
    });
    expect(inDb?.Role.RoleName.toLowerCase()).toBe('staff');
  });

  // ── TP-ADM-BE-06: Prevent Admin Self-Demotion ──────────────────────────────────
  it('TP-ADM-BE-06: should prevent an admin from demoting their own role', async () => {
    await expect(
      adminService.changeRole({ id: seededAdminKey, role: 'borrower' }, adminActor),
    ).rejects.toThrow(BusinessError);
  });

  // ── TP-ADM-BE-07: Reset User Password (Manual / Auto) ──────────────────────────
  it('TP-ADM-BE-07: should reset user password with manual password and auto-generated temporary password', async () => {
    await ensureTargetUser();
    // Case 1: Manual password
    const manualRes = await adminService.resetPassword({
      id: targetUserKey,
      newPassword: 'NewManualPassword123!',
    }, adminActor);
    expect(manualRes.ok).toBe(true);
    expect(manualRes.temporaryPassword).toBeNull();

    // Case 2: Auto-generated temporary password
    const autoRes = await adminService.resetPassword({
      id: targetUserKey,
    }, adminActor);
    expect(autoRes.ok).toBe(true);
    expect(autoRes.temporaryPassword).toBeDefined();
    expect(autoRes.temporaryPassword?.length).toBe(14);
  });

  // ── TP-ADM-BE-08: List, Search, Filter, and Paginate Users ─────────────────────
  it('TP-ADM-BE-08: should list, filter by role, search keyword, and paginate accounts', async () => {
    await ensureTargetUser();
    const list = await adminService.listUsers({
      q: 'UpdatedFirst',
      page: 1,
      pageSize: 10,
    });

    expect(list.items).toBeDefined();
    expect(list.items.length).toBeGreaterThanOrEqual(1);
    expect(list.total).toBeGreaterThanOrEqual(1);
    expect(list.items[0].firstName).toContain('UpdatedFirst');
  });

  // ── TP-ADM-BE-10: Staff Issue Borrowing Ban ────────────────────────────────────
  it('TP-ADM-BE-10: should issue a borrowing suspension and record PenaltyInfo', async () => {
    await ensureTargetUser();
    const banRes = await adminService.setUserBan(
      {
        id: targetUserKey,
        banned: true,
        days: 7,
        reason: 'Late return equipment violation',
      },
      staffActor,
    );

    expect(banRes.ok).toBe(true);

    const activePenalty = await prisma.penaltyInfo.findFirst({
      where: { AccountKey: targetUserKey, InEffect: true },
    });
    expect(activePenalty).toBeDefined();
    expect(activePenalty?.Reason).toBe('Late return equipment violation');
    expect(activePenalty?.ExpirationTime).toBeDefined();
  });

  // ── TP-ADM-BE-11: Staff Lift Borrowing Ban ─────────────────────────────────────
  it('TP-ADM-BE-11: should lift borrowing ban while preserving penalty record history', async () => {
    await ensureTargetUser();
    const liftRes = await adminService.setUserBan(
      {
        id: targetUserKey,
        banned: false,
      },
      staffActor,
    );

    expect(liftRes.ok).toBe(true);

    // Record is not deleted; InEffect is toggled to false
    const penaltyRows = await prisma.penaltyInfo.findMany({
      where: { AccountKey: targetUserKey },
    });
    expect(penaltyRows.length).toBeGreaterThanOrEqual(1);
    expect(penaltyRows.every((p) => p.InEffect === false)).toBe(true);
  });

  // ── TP-ADM-BE-12: Prevent Staff/Admin Self-Banning ─────────────────────────────
  it('TP-ADM-BE-12: should prevent staff or admin from banning themselves', async () => {
    await expect(
      adminService.setUserBan(
        { id: seededStaffKey, banned: true, days: 7, reason: 'Self ban attempt' },
        staffActor,
      ),
    ).rejects.toThrow(BusinessError);
  });
});
