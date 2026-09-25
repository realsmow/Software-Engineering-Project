import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import {
  lendingSettingsOutput,
  updateLendingSettingsInput,
} from '../../src/admin/admin.schema';
import { AdminService } from '../../src/admin/admin.service';
import type { AuditActor } from '../../src/common/audit/audit.service';
import { BusinessError } from '../../src/common/errors/business-error';
import { PrismaService } from '../../src/prisma.service';

describe('AdminService lending settings', () => {
  let app: INestApplication;
  let adminService: AdminService;
  let prisma: PrismaService;
  let actorKey: number;
  let borrowRuleKey: number;
  let creditTierKey: number;
  let roleKey: number;
  const actorKeys = new Set<number>();
  const createdRoleKeys = new Set<number>();
  let sequence = 0;

  const unique = (prefix: string) => `${prefix}.${Date.now()}.${++sequence}`;
  const actor = (): AuditActor => ({ accountKey: actorKey });

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    adminService = module.get(AdminService);
    prisma = module.get(PrismaService);

    const existingRole = await prisma.roleInfo.findFirst({
      where: { RoleName: { in: ['Admin', 'Staff', 'admin', 'staff'] } },
    });
    if (existingRole) {
      roleKey = existingRole.RoleKey;
    } else {
      const createdRole = await prisma.roleInfo.create({
        data: { RoleName: 'Admin' },
      });
      roleKey = createdRole.RoleKey;
      createdRoleKeys.add(roleKey);
    }

    const createdActor = await prisma.accountInfo.create({
      data: {
        Email: `${unique('module4-actor')}@ku.th`,
        UserID: unique('module4-user'),
        UserFName: 'Module',
        UserLName: 'Four',
        HashedPassword: 'not-used-by-this-suite',
        RoleKey: roleKey,
        UserCredit: 100,
      },
    });
    actorKey = createdActor.AccountKey;
    actorKeys.add(actorKey);

    const existingTier = await prisma.creditTier.findFirst({
      where: { CreditTierName: 'D0' },
    });
    if (existingTier) {
      creditTierKey = existingTier.CreditTierKey;
    } else {
      const tier = await prisma.creditTier.create({
        data: {
          CreditTierName: 'D0',
          CreditMin: 0,
          CreditMax: 100,
        },
      });
      creditTierKey = tier.CreditTierKey;
    }

    const rule = await prisma.borrowRule.create({
      data: { RuleName: unique('module4-rule') },
    });
    borrowRuleKey = rule.BorrowRuleKey;
  }, 30_000);

  afterEach(async () => {
    await prisma.penaltyRule.deleteMany({ where: { BorrowRuleKey: borrowRuleKey } });
    await prisma.borrowConstraints.deleteMany({ where: { BorrowRuleKey: borrowRuleKey } });
  });

  afterAll(async () => {
    try {
      await prisma.penaltyRule.deleteMany({ where: { BorrowRuleKey: borrowRuleKey } });
      await prisma.borrowConstraints.deleteMany({ where: { BorrowRuleKey: borrowRuleKey } });
      await prisma.borrowRule.deleteMany({ where: { BorrowRuleKey: borrowRuleKey } });

      if (actorKeys.size > 0) {
        await prisma.auditLog.deleteMany({ where: { ActorKey: { in: [...actorKeys] } } });
        await prisma.accountInfo.deleteMany({ where: { AccountKey: { in: [...actorKeys] } } });
      }
      if (createdRoleKeys.size > 0) {
        await prisma.roleInfo.deleteMany({
          where: {
            RoleKey: { in: [...createdRoleKeys] },
            RoleName: { notIn: ['Admin', 'Staff', 'Student', 'Borrower', 'Supervisor'] },
          },
        });
      }
    } finally {
      await prisma?.$disconnect();
      await app?.close();
    }
  }, 30_000);

  it('reads credit tiers and borrow rules in the public settings shape', async () => {
    const settings = await adminService.getLendingSettings();

    expect(lendingSettingsOutput.safeParse(settings).success).toBe(true);
    expect(settings.creditTiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: creditTierKey, min: 0, max: 100 }),
      ]),
    );
    expect(settings.borrowRules).toEqual(
      expect.arrayContaining([
        { id: borrowRuleKey, name: expect.any(String), constraints: [], penalties: [] },
      ]),
    );
  });

  it('upserts constraints and penalty rules and returns the updated settings', async () => {
    const input = updateLendingSettingsInput.parse({
      borrowRuleKey,
      constraints: [
        {
          creditTierKey,
          maxBorrowDays: 14,
          maxExtendTimes: 2,
          minimumAuthorityLevel: 3,
        },
      ],
      penalties: [
        { reason: 'DamagedItem', amount: 20, lengthDays: 30 },
      ],
    });

    const settings = await adminService.updateLendingSettings(input, actor());
    const rule = settings.borrowRules.find((candidate) => candidate.id === borrowRuleKey);

    expect(rule).toMatchObject({
      id: borrowRuleKey,
      constraints: [
        {
          creditTierKey,
          maxBorrowDays: 14,
          maxExtendTimes: 2,
          minimumAuthorityLevel: 3,
        },
      ],
      penalties: [{ reason: 'DamagedItem', amount: 20, lengthDays: 30 }],
    });
    await expect(
      prisma.borrowConstraints.findUnique({
        where: { BorrowRuleKey_CreditTierKey: { BorrowRuleKey: borrowRuleKey, CreditTierKey: creditTierKey } },
      }),
    ).resolves.toMatchObject({ MaxBorrowDate: 14, MaxExtendTime: 2 });
  });

  it('updates an existing row without deleting omitted penalty settings', async () => {
    await adminService.updateLendingSettings(
      updateLendingSettingsInput.parse({
        borrowRuleKey,
        constraints: [{ creditTierKey, maxBorrowDays: 7, maxExtendTimes: 1 }],
        penalties: [{ reason: 'LostItem', amount: 80, lengthDays: 90 }],
      }),
      actor(),
    );

    const settings = await adminService.updateLendingSettings(
      updateLendingSettingsInput.parse({
        borrowRuleKey,
        constraints: [{ creditTierKey, maxBorrowDays: 10, maxExtendTimes: 4 }],
      }),
      actor(),
    );
    const rule = settings.borrowRules.find((candidate) => candidate.id === borrowRuleKey)!;

    expect(rule.constraints).toEqual(
      expect.arrayContaining([expect.objectContaining({ maxBorrowDays: 10, maxExtendTimes: 4 })]),
    );
    expect(rule.penalties).toEqual([{ reason: 'LostItem', amount: 80, lengthDays: 90 }]);
  });

  it('rejects an unknown borrow rule with a typed business error', async () => {
    const error = (await adminService
      .updateLendingSettings(
        updateLendingSettingsInput.parse({ borrowRuleKey: 999_999_999, constraints: [] }),
        actor(),
      )
      .catch((value: unknown) => value)) as BusinessError;

    expect(error).toBeInstanceOf(BusinessError);
    expect(error.businessCode).toBe('BORROW_RULE_NOT_FOUND');
    expect(error.details).toEqual({ id: 999_999_999 });
  });

  it.each([
    ['maxBorrowDays below one', { constraints: [{ creditTierKey: 1, maxBorrowDays: 0, maxExtendTimes: 0 }] }],
    ['maxBorrowDays above one year', { constraints: [{ creditTierKey: 1, maxBorrowDays: 366, maxExtendTimes: 0 }] }],
    ['maxExtendTimes above the ceiling', { constraints: [{ creditTierKey: 1, maxBorrowDays: 1, maxExtendTimes: 51 }] }],
    ['penalty amount above the credit scale', { penalties: [{ reason: 'LostItem', amount: 101, lengthDays: 1 }] }],
    ['penalty length above the ten-year ceiling', { penalties: [{ reason: 'LostItem', amount: 1, lengthDays: 3651 }] }],
  ])('rejects %s at the input boundary', (_description, patch) => {
    expect(() => updateLendingSettingsInput.parse({ borrowRuleKey, ...patch })).toThrow();
  });

  it('rolls back all writes when one constraint violates a foreign key', async () => {
    await prisma.borrowConstraints.create({
      data: {
        BorrowRuleKey: borrowRuleKey,
        CreditTierKey: creditTierKey,
        MaxBorrowDate: 7,
        MaxExtendTime: 1,
        MinimumAuthorityLevel: null,
      },
    });

    await expect(
      adminService.updateLendingSettings(
        updateLendingSettingsInput.parse({
          borrowRuleKey,
          constraints: [
            { creditTierKey, maxBorrowDays: 21, maxExtendTimes: 3 },
            { creditTierKey: 999_999_999, maxBorrowDays: 21, maxExtendTimes: 3 },
          ],
          penalties: [{ reason: 'BrokenItem', amount: 50, lengthDays: 30 }],
        }),
        actor(),
      ),
    ).rejects.toThrow();

    await expect(
      prisma.borrowConstraints.findUnique({
        where: { BorrowRuleKey_CreditTierKey: { BorrowRuleKey: borrowRuleKey, CreditTierKey: creditTierKey } },
      }),
    ).resolves.toMatchObject({ MaxBorrowDate: 7, MaxExtendTime: 1 });
    await expect(
      prisma.penaltyRule.findUnique({
        where: { BorrowRuleKey_PenaltyReason: { BorrowRuleKey: borrowRuleKey, PenaltyReason: 'BrokenItem' } },
      }),
    ).resolves.toBeNull();
  });
});
