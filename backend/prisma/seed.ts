import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Seeds the reference data the auth flow cannot work without, plus a set of
 * development accounts.
 *
 * Idempotent — every write is an upsert, so running it twice is safe.
 *
 * Run with: npx prisma db seed
 */
// Prisma 7 requires an explicit driver adapter — same one PrismaService uses.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** RoleInfo values mapUserRole() in status.schema.ts knows how to translate */
const ROLES = ['Student', 'Staff', 'Supervisor', 'Admin'];

/**
 * Credit bands, copied from the frontend's CREDIT_BANDS in
 * frontend/src/constants/index.ts. These must together cover every score
 * from 0 to 100 — AuthService.resolveCreditBand() throws on a score that
 * falls in no band, which would block login.
 */
const CREDIT_BANDS = [
  { name: 'D0', min: 80, max: 100 },
  { name: 'D1', min: 50, max: 79 },
  { name: 'D2', min: 30, max: 49 },
  { name: 'D3', min: 0, max: 29 },
];

/**
 * Development accounts. These replace the frontend's old hardcoded
 * MOCK_LOCAL_CREDENTIALS — same convenience, but the passwords are now
 * bcrypt hashes in the database and the server decides the role.
 *
 * ⚠️ Development only. Do not run this seed against production, and change
 * these passwords if the database is ever exposed.
 */
const DEV_PASSWORD = 'password1234';

const DEV_ACCOUNTS = [
  {
    email: 'student@ku.th',
    username: null,
    role: 'Student',
    userId: '6410501234',
    firstName: 'ณัฐวุฒิ',
    lastName: 'ศรีสุวรรณ',
    credit: 92,
  },
  {
    email: 'staff@ku.th',
    username: 'test_staff',
    role: 'Staff',
    userId: 'STF0001',
    firstName: 'สมชาย',
    lastName: 'พร้อมเจริญ',
    credit: 100,
  },
  {
    email: 'supervisor@ku.th',
    username: 'test_supervisor',
    role: 'Supervisor',
    userId: 'SUP0001',
    firstName: 'อรวรรณ',
    lastName: 'ภักดี',
    credit: 100,
  },
  {
    email: 'admin@ku.th',
    username: 'test_admin',
    role: 'Admin',
    userId: 'ADM0001',
    firstName: 'ธนพล',
    lastName: 'ไอที',
    credit: 100,
  },
];

async function main() {
  // RoleInfo has no unique constraint on RoleName, so upsert can't be used —
  // check first instead, to stay idempotent.
  const roleKeys = new Map<string, number>();
  for (const name of ROLES) {
    const existing = await prisma.roleInfo.findFirst({
      where: { RoleName: name },
      select: { RoleKey: true },
    });
    const role =
      existing ?? (await prisma.roleInfo.create({ data: { RoleName: name } }));
    roleKeys.set(name, role.RoleKey);
  }
  console.log(`Roles ready: ${[...roleKeys.keys()].join(', ')}`);

  for (const band of CREDIT_BANDS) {
    const existing = await prisma.creditTier.findFirst({
      where: { CreditTierName: band.name },
      select: { CreditTierKey: true },
    });
    if (existing) {
      await prisma.creditTier.update({
        where: { CreditTierKey: existing.CreditTierKey },
        data: { CreditMin: band.min, CreditMax: band.max },
      });
    } else {
      await prisma.creditTier.create({
        data: {
          CreditTierName: band.name,
          CreditMin: band.min,
          CreditMax: band.max,
        },
      });
    }
  }
  console.log(`Credit bands ready: ${CREDIT_BANDS.map((b) => b.name).join(', ')}`);

  const hashed = await bcrypt.hash(DEV_PASSWORD, 12);
  for (const account of DEV_ACCOUNTS) {
    const roleKey = roleKeys.get(account.role);
    if (!roleKey) throw new Error(`Missing role ${account.role}`);

    await prisma.accountInfo.upsert({
      where: { Email: account.email },
      // Never reset an existing account's password on re-seed.
      update: {
        Username: account.username,
        RoleKey: roleKey,
      },
      create: {
        Email: account.email,
        HashedPassword: hashed,
        Username: account.username,
        UserID: account.userId,
        UserFName: account.firstName,
        UserLName: account.lastName,
        UserCredit: account.credit,
        RoleKey: roleKey,
      },
    });
  }

  console.log(`\nDev accounts seeded (password: ${DEV_PASSWORD}):`);
  for (const a of DEV_ACCOUNTS) {
    const how = a.username ? `username ${a.username}` : `KU email ${a.email}`;
    console.log(`  ${a.role.padEnd(11)} -> ${how}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
