import { AdminService } from './admin.service';
import type { PrismaService } from '../prisma.service';
import type { AuditActor, AuditService } from '../common/audit/audit.service';
import type { CreditTierService } from '../common/credit/credit-tier.service';
import type { SessionService } from '../auth/session.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { CronService } from '../cron/cron.service';
import type { ConfigService } from '@nestjs/config';
import { createFacultyInput, createGroupInput } from './admin.schema';

// Faculties, departments, clubs, and attaching accounts to them.
const ACTOR: AuditActor = { accountKey: 99, ip: null, userAgent: null };

describe('NFR-SEC-03: organization create input boundaries', () => {
  it.each(['', '   ', 'x'.repeat(101)])(
    'refuses an empty or oversized organization name (%s)',
    (name) => {
      expect(createFacultyInput.safeParse({ name }).success).toBe(false);
      expect(createGroupInput.safeParse({ name, facultyId: 1 }).success).toBe(
        false,
      );
    },
  );
  it('trims names and refuses non-integer faculty references', () => {
    expect(createFacultyInput.parse({ name: '  Engineering  ' })).toEqual({
      name: 'Engineering',
    });
    for (const facultyId of [1.5, '1', null]) {
      expect(
        createGroupInput.safeParse({ name: 'CPE', facultyId }).success,
      ).toBe(false);
    }
  });
});

function setup(
  options: {
    facultyExists?: boolean;
    groupsFound?: number;
    membershipFails?: boolean;
  } = {},
) {
  const authority = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    upsert: options.membershipFails
      ? jest.fn().mockRejectedValue(new Error('membership write failed'))
      : jest.fn().mockResolvedValue({}),
  };
  const authorityRole = {
    findFirst: jest.fn().mockImplementation(({ where }) =>
      Promise.resolve({
        AuthorityRoleKey: where.AuthorityName === 'Student' ? 10 : 11,
      }),
    ),
  };
  // Account and membership writes must go through the transaction client.
  const tx = {
    managementGroup: {
      create: jest.fn().mockResolvedValue({ ManageGroupKey: 5 }),
    },
    branchInfo: { create: jest.fn() },
    clubInfo: { create: jest.fn() },
    accountInfo: {
      create: jest.fn().mockResolvedValue({ AccountKey: 7 }),
      update: jest.fn().mockResolvedValue({ AccountKey: 7 }),
    },
    authority,
    authorityRole,
  };
  const prisma = {
    facultyInfo: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.facultyExists === false ? null : { FacultyKey: 2 },
        ),
    },
    managementGroup: {
      count: jest.fn().mockResolvedValue(options.groupsFound ?? 2),
    },
    authorityRole,
    authority: { findMany: jest.fn().mockResolvedValue([]) },
    accountInfo: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({
        AccountKey: 7,
        UserID: 's1',
        UserFName: 'Ana',
        UserLName: 'Lek',
        Email: 'ana@ku.th',
        UserCredit: 100,
        IsActive: true,
        CreatedAt: null,
        FacultyKey: 2,
        Sessions: [],
        Role: { RoleName: 'Student' },
        Authorities: [],
        Penalties: [],
      }),
      create: jest.fn(),
      update: jest.fn(),
    },
    roleInfo: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ RoleKey: 1, RoleName: 'Student' }]),
    },
    $transaction: jest
      .fn()
      .mockImplementation((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (t: typeof tx) => unknown)(tx)
          : Promise.resolve(arg),
      ),
  };
  const audit = { record: jest.fn() };
  const service = new AdminService(
    prisma as unknown as PrismaService,
    {
      resolveBorrowLimits: jest.fn().mockResolvedValue({
        creditTier: 'D0',
        maxBorrowDays: 7,
        maxExtendTimes: 2,
      }),
    } as unknown as CreditTierService,
    {} as SessionService,
    audit as unknown as AuditService,
    {} as StaffScopeService,
    {} as ConfigService,
    {} as CronService,
  );
  return { service, prisma, tx, authority, audit };
}

describe('createGroup', () => {
  it('makes a department under a faculty', async () => {
    const t = setup();
    const group = await t.service.createGroup(
      { name: 'CPE', facultyId: 2 },
      ACTOR,
    );
    expect(group).toEqual({
      id: 5,
      name: 'CPE',
      type: 'Faculty',
      facultyId: 2,
    });
    expect(t.tx.managementGroup.create).toHaveBeenCalledWith({
      data: { GroupType: 'Faculty' },
    });
    expect(t.tx.branchInfo.create).toHaveBeenCalled();
    expect(t.tx.clubInfo.create).not.toHaveBeenCalled();
  });

  it('makes a club when no faculty is given', async () => {
    const t = setup();
    const group = await t.service.createGroup({ name: 'Robotics' }, ACTOR);
    expect(group.type).toBe('Club');
    expect(t.tx.clubInfo.create).toHaveBeenCalled();
  });

  it('refuses an unknown faculty', async () => {
    const t = setup({ facultyExists: false });
    await expect(
      t.service.createGroup({ name: 'CPE', facultyId: 9 }, ACTOR),
    ).rejects.toMatchObject({ businessCode: 'FACULTY_NOT_FOUND' });
  });
});

describe('createUser memberships', () => {
  const base = {
    email: 'ana@ku.th',
    studentId: 's1',
    firstName: 'Ana',
    lastName: 'Lek',
    role: 'borrower' as const,
  };

  it('stores the faculty and joins borrowers as Student', async () => {
    const t = setup();
    await t.service.createUser(
      { ...base, facultyId: 2, groupIds: [5, 6] },
      ACTOR,
    );
    expect(t.tx.accountInfo.create.mock.calls[0][0].data.FacultyKey).toBe(2);
    expect(t.authority.deleteMany).toHaveBeenCalledWith({
      where: { AccountKey: 7, ManageGroupKey: { notIn: [5, 6] } },
    });
    expect(t.authority.upsert).toHaveBeenCalledTimes(2);
    expect(t.authority.upsert.mock.calls[0][0].create.AuthorityRoleKey).toBe(
      10,
    );
  });

  it('refuses a group that does not exist', async () => {
    const t = setup({ groupsFound: 1 });
    await expect(
      t.service.createUser({ ...base, groupIds: [5, 6] }, ACTOR),
    ).rejects.toMatchObject({ businessCode: 'GROUP_NOT_FOUND' });
    expect(t.prisma.accountInfo.create).not.toHaveBeenCalled();
  });
});

describe('account and memberships in one transaction (#153)', () => {
  const base = {
    email: 'ana@ku.th',
    studentId: 's1',
    firstName: 'Ana',
    lastName: 'Lek',
    role: 'borrower' as const,
  };

  it('creates nothing outside the transaction when a membership write fails', async () => {
    const t = setup({ membershipFails: true, groupsFound: 1 });
    await expect(
      t.service.createUser({ ...base, groupIds: [5] }, ACTOR),
    ).rejects.toThrow('membership write failed');
    expect(t.tx.accountInfo.create).toHaveBeenCalled();
    expect(t.prisma.accountInfo.create).not.toHaveBeenCalled();
    expect(t.audit.record).not.toHaveBeenCalled();
  });

  it('updates nothing outside the transaction when a membership write fails', async () => {
    const t = setup({ membershipFails: true, groupsFound: 1 });
    await expect(
      t.service.updateUser({ id: 7, firstName: 'New', groupIds: [5] }, ACTOR),
    ).rejects.toThrow('membership write failed');
    expect(t.tx.accountInfo.update).toHaveBeenCalled();
    expect(t.prisma.accountInfo.update).not.toHaveBeenCalled();
    expect(t.audit.record).not.toHaveBeenCalled();
  });
});

describe('renaming and deleting faculties and groups (demo feedback)', () => {
  function org(counts: Partial<Record<string, number>> = {}) {
    const count = (key: string) =>
      jest.fn().mockResolvedValue(counts[key] ?? 0);
    const prisma = {
      facultyInfo: {
        findUnique: jest.fn().mockResolvedValue({ FacultyKey: 2 }),
        update: jest.fn(),
        delete: jest.fn(),
        count: count('faculties'),
      },
      branchInfo: {
        count: count('departments'),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      clubInfo: { update: jest.fn(), deleteMany: jest.fn() },
      accountInfo: { count: count('accounts') },
      authority: { count: count('members') },
      resourceInfo: { count: count('items') },
      eligibility: { count: count('rules') },
      managementGroup: {
        findUnique: jest.fn().mockResolvedValue({
          GroupType: 'Faculty',
          Branch: { FacultyKey: 2 },
        }),
        count: count('groups'),
        delete: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const audit = { record: jest.fn() };
    const service = new AdminService(
      prisma as unknown as PrismaService,
      {} as CreditTierService,
      {} as SessionService,
      audit as unknown as AuditService,
      {} as StaffScopeService,
      {} as ConfigService,
      {} as CronService,
    );
    return { service, prisma };
  }

  it('renames a department through its branch row', async () => {
    const t = org();
    await expect(
      t.service.renameGroup({ id: 5, name: 'CPE 2' }, ACTOR),
    ).resolves.toEqual({
      id: 5,
      name: 'CPE 2',
      type: 'Faculty',
      facultyId: 2,
    });
    expect(t.prisma.branchInfo.update).toHaveBeenCalledWith({
      where: { ManageGroupKey: 5 },
      data: { BranchName: 'CPE 2' },
    });
  });

  it.each([
    ['members', { members: 1, groups: 3 }],
    ['items', { items: 2, groups: 3 }],
    ['rules', { rules: 1, groups: 3 }],
  ])('refuses to delete a group that still has %s', async (_, counts) => {
    const t = org(counts);
    await expect(t.service.deleteGroup({ id: 5 }, ACTOR)).rejects.toMatchObject(
      {
        businessCode: 'ORG_IN_USE',
      },
    );
    expect(t.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to delete the last group or the last faculty', async () => {
    const t = org({ groups: 1, faculties: 1 });
    await expect(t.service.deleteGroup({ id: 5 }, ACTOR)).rejects.toMatchObject(
      {
        businessCode: 'ORG_LAST_ONE',
      },
    );
    await expect(
      t.service.deleteFaculty({ id: 2 }, ACTOR),
    ).rejects.toMatchObject({
      businessCode: 'ORG_LAST_ONE',
    });
  });

  it('refuses to delete a faculty with departments or people, deletes an empty one', async () => {
    await expect(
      org({ departments: 1, faculties: 2 }).service.deleteFaculty(
        { id: 2 },
        ACTOR,
      ),
    ).rejects.toMatchObject({ businessCode: 'ORG_IN_USE' });
    const t = org({ faculties: 2 });
    await t.service.deleteFaculty({ id: 2 }, ACTOR);
    expect(t.prisma.facultyInfo.delete).toHaveBeenCalledWith({
      where: { FacultyKey: 2 },
    });
  });
});
