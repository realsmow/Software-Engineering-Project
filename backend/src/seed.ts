import 'dotenv/config';
import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from './common/crypto/password';

/**
 * Development seed - the minimum graph login needs.
 *
 * Idempotent: every write is keyed on something stable and re-running only
 * updates. That matters because this runs against a database a teammate may
 * already have data in; a seed that throws on the second run gets deleted from
 * package.json within a week.
 *
 * The passwords here are the same ones the frontend used to hardcode. They are
 * DEVELOPMENT ONLY and this file must never run against a shared database.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** CreditTier buckets must cover 0-100 with no gap, or resolveBorrowLimits throws. */
const TIERS = [
  { name: 'D0', min: 90, max: 100, maxBorrowDays: 14, maxExtendTimes: 3 },
  { name: 'D1', min: 80, max: 89, maxBorrowDays: 10, maxExtendTimes: 2 },
  { name: 'D2', min: 50, max: 79, maxBorrowDays: 7, maxExtendTimes: 1 },
  { name: 'D3', min: 0, max: 49, maxBorrowDays: 3, maxExtendTimes: 0 },
];

const ROLES = ['Student', 'Staff', 'Supervisor', 'Admin'];

const USERS = [
  {
    userId: 'test_borrower',
    email: 'natthawut.s@ku.th',
    pass: 'borrower1234',
    role: 'Student',
    first: 'Natthawut',
    last: 'Srisuwan',
    credit: 92,
  },
  {
    userId: 'test_staff',
    email: 'somchai.p@ku.th',
    pass: 'staff1234',
    role: 'Staff',
    first: 'Somchai',
    last: 'Promcharoen',
    credit: 100,
  },
  {
    userId: 'test_supervisor',
    email: 'orawan.p@ku.th',
    pass: 'supervisor1234',
    role: 'Supervisor',
    first: 'Orawan',
    last: 'Phakdee',
    credit: 100,
  },
  {
    userId: 'test_admin',
    email: 'thanapon.it@ku.th',
    pass: 'admin1234',
    role: 'Admin',
    first: 'Thanapon',
    last: 'IT',
    credit: 100,
  },
];

async function main() {
  const roleKeys = new Map<string, number>();
  for (const name of ROLES) {
    const existing = await prisma.roleInfo.findFirst({
      where: { RoleName: name },
    });
    const row =
      existing ?? (await prisma.roleInfo.create({ data: { RoleName: name } }));
    roleKeys.set(name, row.RoleKey);
  }

  const rule =
    (await prisma.borrowRule.findFirst({ where: { RuleName: 'default' } })) ??
    (await prisma.borrowRule.create({ data: { RuleName: 'default' } }));

  for (const t of TIERS) {
    const existing = await prisma.creditTier.findFirst({
      where: { CreditTierName: t.name },
    });
    const tier =
      existing ??
      (await prisma.creditTier.create({
        data: { CreditTierName: t.name, CreditMin: t.min, CreditMax: t.max },
      }));

    await prisma.borrowConstraints.upsert({
      where: {
        BorrowRuleKey_CreditTierKey: {
          BorrowRuleKey: rule.BorrowRuleKey,
          CreditTierKey: tier.CreditTierKey,
        },
      },
      update: {
        MaxBorrowDate: t.maxBorrowDays,
        MaxExtendTime: t.maxExtendTimes,
      },
      create: {
        BorrowRuleKey: rule.BorrowRuleKey,
        CreditTierKey: tier.CreditTierKey,
        MaxBorrowDate: t.maxBorrowDays,
        MaxExtendTime: t.maxExtendTimes,
      },
    });
  }

  for (const u of USERS) {
    const hashed = await hashPassword(u.pass);
    const existing = await prisma.accountInfo.findFirst({
      where: { UserID: u.userId },
    });

    if (existing) {
      await prisma.accountInfo.update({
        where: { AccountKey: existing.AccountKey },
        data: {
          HashedPassword: hashed,
          RoleKey: roleKeys.get(u.role)!,
          UserCredit: u.credit,
        },
      });
    } else {
      await prisma.accountInfo.create({
        data: {
          Email: u.email,
          HashedPassword: hashed,
          UserID: u.userId,
          UserFName: u.first,
          UserLName: u.last,
          UserCredit: u.credit,
          RoleKey: roleKeys.get(u.role)!,
        },
      });
    }
    console.log(`  seeded ${u.userId} (${u.role})`);
  }
}

main()
  .then(() => console.log('seed complete'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
