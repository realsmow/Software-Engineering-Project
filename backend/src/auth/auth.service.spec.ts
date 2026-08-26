import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma.service';
import { CreditTierService } from '../common/credit/credit-tier.service';
import { hashPassword } from '../common/crypto/password';
import { AuthService } from './auth.service';
import { userOutput } from '../common/schemas/user.schema';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;

  let roleKey: number;
  let creditTierKey: number;
  let borrowRuleKey: number;
  let accountKey: number;

  const EMAIL = 'auth.service.spec@example.com';
  const PASSWORD = 'correct horse battery staple';

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      // CreditTierService: the credit-score-to-borrow-limit lookup moved out
      // of AuthService so admin.getUserById can reuse it.
      providers: [AuthService, CreditTierService, PrismaService],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);

    // Seed the minimum graph getProfile() needs: a role, a credit tier with
    // a borrow constraint, and an account that references both.
    // "Student" (not "Borrower") is what schema.prisma's own comment on
    // AccountInfo says real RoleInfo rows use - exercises the alias
    // mapping in mapUserRole(), not just the literal enum values.
    const role = await prisma.roleInfo.create({
      data: { RoleName: 'Student' },
    });
    roleKey = role.RoleKey;

    // A range no real tier occupies. resolveBorrowLimits() picks the tier by
    // findFirst on CreditMin/CreditMax, so a fixture inside the normal 0-100
    // band would tie with whatever the dev seed put there and the winner would
    // depend on insertion order. Out here the lookup can only match this row.
    const tier = await prisma.creditTier.create({
      data: { CreditTierName: 'D2', CreditMin: 9000, CreditMax: 9001 },
    });
    creditTierKey = tier.CreditTierKey;

    const rule = await prisma.borrowRule.create({
      data: { RuleName: 'auth.service.spec default rule' },
    });
    borrowRuleKey = rule.BorrowRuleKey;

    await prisma.borrowConstraints.create({
      data: {
        BorrowRuleKey: borrowRuleKey,
        CreditTierKey: creditTierKey,
        MaxBorrowDate: 10,
        MaxExtendTime: 2,
      },
    });

    const account = await prisma.accountInfo.create({
      data: {
        Email: EMAIL,
        // A real hash, so authenticate() below is exercising the actual
        // verification path rather than a placeholder string.
        HashedPassword: await hashPassword(PASSWORD),
        UserID: 'TEST0001',
        UserFName: 'Test',
        UserLName: 'User',
        UserCredit: 9000,
        RoleKey: roleKey,
      },
    });
    accountKey = account.AccountKey;
    // A cold Prisma engine plus these five writes overruns jest's 5s default.
  }, 30_000);

  // Every delete is guarded because a failed beforeAll leaves the keys
  // undefined, and `where: { AccountKey: undefined }` throws a Prisma
  // validation error that buries the real failure. $disconnect must still run
  // or the jest worker never exits.
  afterAll(async () => {
    try {
      if (accountKey)
        await prisma.accountInfo.delete({ where: { AccountKey: accountKey } });
      if (borrowRuleKey) {
        await prisma.borrowConstraints.deleteMany({
          where: { BorrowRuleKey: borrowRuleKey },
        });
        await prisma.borrowRule.delete({
          where: { BorrowRuleKey: borrowRuleKey },
        });
      }
      if (creditTierKey)
        await prisma.creditTier.delete({
          where: { CreditTierKey: creditTierKey },
        });
      if (roleKey)
        await prisma.roleInfo.delete({ where: { RoleKey: roleKey } });
    } finally {
      await prisma?.$disconnect();
    }
  }, 30_000);

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('maps a seeded account into a schema-valid profile', async () => {
    const profile = await service.getProfile(accountKey);

    const parsed = userOutput.safeParse(profile);
    expect(parsed.success).toBe(true);

    expect(profile).toMatchObject({
      id: accountKey,
      studentId: 'TEST0001',
      firstName: 'Test',
      lastName: 'User',
      email: EMAIL,
      role: 'borrower', // mapRoleName('Student') -> 'borrower'
      facultyName: null,
      creditScore: 9000,
      creditTier: 'D2',
      maxBorrowDays: 10,
      maxExtendTimes: 2,
    });
  });

  describe('authenticate', () => {
    it('accepts the KU email', async () => {
      await expect(service.authenticate(EMAIL, PASSWORD)).resolves.toBe(
        accountKey,
      );
    });

    it('accepts the user ID, which is how local staff accounts sign in', async () => {
      await expect(service.authenticate('TEST0001', PASSWORD)).resolves.toBe(
        accountKey,
      );
    });

    it('ignores email casing and surrounding whitespace', async () => {
      await expect(
        service.authenticate(`  ${EMAIL.toUpperCase()} `, PASSWORD),
      ).resolves.toBe(accountKey);
    });

    it('rejects a wrong password', async () => {
      await expect(service.authenticate(EMAIL, 'wrong')).rejects.toMatchObject({
        message: 'INVALID_CREDENTIALS',
        code: 'UNAUTHORIZED',
      });
    });

    it('gives an unknown account the same error, so accounts cannot be enumerated', async () => {
      await expect(
        service.authenticate('nobody@example.com', PASSWORD),
      ).rejects.toMatchObject({
        message: 'INVALID_CREDENTIALS',
        code: 'UNAUTHORIZED',
      });
    });
  });
});
