import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { userOutput } from '../common/schemas/user.schema';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;

  let roleKey: number;
  let creditTierKey: number;
  let accountKey: number;

  const PASSWORD = 'correct-horse-battery';
  const EMAIL = 'auth.service.spec@ku.th';
  const USERNAME = 'auth_service_spec';

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService, PasswordService, PrismaService],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    const password = module.get<PasswordService>(PasswordService);

    // Seed the minimum graph getProfile() needs: a role, a credit tier that
    // covers the account's score, and an account referencing the role.
    // "Student" (not "Borrower") is what schema.prisma's own comment on
    // AccountInfo says real RoleInfo rows use — exercises the alias
    // mapping in mapUserRole(), not just the literal enum values.
    const role = await prisma.roleInfo.create({
      data: { RoleName: 'Student' },
    });
    roleKey = role.RoleKey;

    const tier = await prisma.creditTier.create({
      data: { CreditTierName: 'D2', CreditMin: 50, CreditMax: 79 },
    });
    creditTierKey = tier.CreditTierKey;

    const account = await prisma.accountInfo.create({
      data: {
        Email: EMAIL,
        HashedPassword: await password.hash(PASSWORD),
        Username: USERNAME,
        UserID: 'TEST0001',
        UserFName: 'Test',
        UserLName: 'User',
        UserCredit: 65,
        RoleKey: roleKey,
      },
    });
    accountKey = account.AccountKey;
  });

  afterAll(async () => {
    await prisma.accountInfo.delete({ where: { AccountKey: accountKey } });
    await prisma.creditTier.delete({ where: { CreditTierKey: creditTierKey } });
    await prisma.roleInfo.delete({ where: { RoleKey: roleKey } });
    await prisma.$disconnect();
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('maps a seeded account into a schema-valid profile', async () => {
    const profile = await service.getProfile(accountKey);

    const parsed = userOutput.safeParse(profile);
    expect(parsed.success).toBe(true);

    expect(profile).toEqual({
      id: String(accountKey),
      studentId: 'TEST0001',
      name: 'Test User',
      email: EMAIL,
      role: 'borrower', // mapUserRole('Student') -> 'borrower'
      departmentId: '', // no faculty assigned yet
      creditScore: 65,
      creditBand: 'D2',
    });
  });

  it('never exposes the password hash in a profile', async () => {
    const profile = await service.getProfile(accountKey);

    // Guards the PROFILE_SELECT allowlist: a stray `HashedPassword: true`
    // would otherwise ship the hash to every client.
    expect(Object.keys(profile)).not.toContain('HashedPassword');
    expect(JSON.stringify(profile)).not.toContain('$2');
  });

  describe('login', () => {
    it('accepts the right KU email password', async () => {
      const result = await service.loginWithKuEmail({
        email: EMAIL,
        password: PASSWORD,
      });

      expect(result.accountKey).toBe(accountKey);
      expect(result.user.email).toBe(EMAIL);
    });

    it('accepts the right local-account password', async () => {
      const result = await service.loginWithLocalAccount({
        username: USERNAME,
        password: PASSWORD,
      });

      expect(result.accountKey).toBe(accountKey);
    });

    it('rejects a wrong password', async () => {
      await expect(
        service.loginWithKuEmail({ email: EMAIL, password: 'wrong-password' }),
      ).rejects.toMatchObject({ message: 'INVALID_CREDENTIALS' });
    });

    it('rejects an unknown account with the same error as a wrong password', async () => {
      // Identical message on both paths — otherwise the response tells an
      // attacker which emails are registered.
      await expect(
        service.loginWithKuEmail({ email: 'nobody@ku.th', password: PASSWORD }),
      ).rejects.toMatchObject({ message: 'INVALID_CREDENTIALS' });
    });
  });
});
