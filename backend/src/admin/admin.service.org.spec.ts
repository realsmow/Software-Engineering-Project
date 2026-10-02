import { AdminService } from './admin.service';
import type { PrismaService } from '../prisma.service';
import type { AuditActor, AuditService } from '../common/audit/audit.service';
import type { CreditTierService } from '../common/credit/credit-tier.service';
import type { SessionService } from '../auth/session.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { CronService } from '../cron/cron.service';
import type { ConfigService } from '@nestjs/config';

// Faculties, departments, clubs, and attaching accounts to them.
const ACTOR: AuditActor = { accountKey: 99, ip: null, userAgent: null };

function setup(
  options: { facultyExists?: boolean; groupsFound?: number } = {},
) {
  const tx = {
    managementGroup: {
      create: jest.fn().mockResolvedValue({ ManageGroupKey: 5 }),
    },
    branchInfo: { create: jest.fn() },
    clubInfo: { create: jest.fn() },
  };
  const authority = {
    deleteMany: jest.fn().mockReturnValue('delete'),
    upsert: jest.fn().mockReturnValue('upsert'),
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
    authorityRole: {
      findFirst: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve({
          AuthorityRoleKey: where.AuthorityName === 'Student' ? 10 : 11,
        }),
      ),
    },
    authority,
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
      create: jest.fn().mockResolvedValue({ AccountKey: 7 }),
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
    { record: jest.fn() } as unknown as AuditService,
    {} as StaffScopeService,
    {} as ConfigService,
    {} as CronService,
  );
  return { service, prisma, tx, authority };
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
    expect(t.prisma.accountInfo.create.mock.calls[0][0].data.FacultyKey).toBe(
      2,
    );
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
