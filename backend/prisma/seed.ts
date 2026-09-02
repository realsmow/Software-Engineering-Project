/**
 * Minimum data the staff domain needs before it will do anything.
 *
 * Not sample equipment — the *reference rows* the code refuses to work
 * without, each of which produces a specific error when missing:
 *
 *   BorrowRule T0–T3   -> without it `item.createUnit` throws TIER_NOT_CONFIGURED,
 *                         because a tier is a BorrowRule row (§5.4)
 *   ManagementGroup    -> ResourceInfo.ManagedBy points at one
 *   Authority          -> without a row here every staff call throws
 *                         NO_MANAGEMENT_SCOPE (§5.1: authority is departmental)
 *   CreditTier         -> `auth.me` throws CREDIT_TIER_NOT_CONFIGURED
 *   PenaltyRule        -> optional; absent, penalties fall back to the
 *                         proposal's formulas
 *
 * Safe to run repeatedly: everything is keyed on a natural identifier and
 * upserted, so a second run changes nothing.
 *
 *   npx tsx prisma/seed.ts
 */
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomBytes, scrypt } from 'node:crypto';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** The account the smoke test signs in as. */
const STAFF_EMAIL = 'staff.demo@ku.th';
const STAFF_USER_ID = 'STAFF001';

/** Password for both demo accounts. Only usable on a branch that has auth.login. */
const STAFF_PASSWORD_PLAINTEXT = 'staff1234';

async function main() {
  // --- tiers: the four BorrowRule rows the whole catalogue keys off ----------
  const tiers: Record<string, number> = {};
  for (const name of ['T0', 'T1', 'T2', 'T3']) {
    const existing = await prisma.borrowRule.findFirst({
      where: { RuleName: name },
    });
    const row =
      existing ??
      (await prisma.borrowRule.create({ data: { RuleName: name } }));
    tiers[name] = row.BorrowRuleKey;
  }
  console.log('BorrowRule  :', tiers);

  // --- credit tiers (proposal §5.7) -----------------------------------------
  const creditTiers = [
    { name: 'D0', min: 80, max: 100, days: 14, extend: 2 },
    { name: 'D1', min: 50, max: 79, days: 7, extend: 1 },
    { name: 'D2', min: 30, max: 49, days: 7, extend: 0 },
    { name: 'D3', min: 0, max: 29, days: 5, extend: 0 },
  ];
  for (const t of creditTiers) {
    const existing = await prisma.creditTier.findFirst({
      where: { CreditTierName: t.name },
    });
    const tier =
      existing ??
      (await prisma.creditTier.create({
        data: { CreditTierName: t.name, CreditMin: t.min, CreditMax: t.max },
      }));

    // One constraint per tier x borrow rule, so any item can price a due date.
    for (const ruleKey of Object.values(tiers)) {
      await prisma.borrowConstraints.upsert({
        where: {
          BorrowRuleKey_CreditTierKey: {
            BorrowRuleKey: ruleKey,
            CreditTierKey: tier.CreditTierKey,
          },
        },
        update: {},
        create: {
          BorrowRuleKey: ruleKey,
          CreditTierKey: tier.CreditTierKey,
          MaxBorrowDate: t.days,
          MaxExtendTime: t.extend,
        },
      });
    }
  }
  console.log('CreditTier  : D0–D3 + BorrowConstraints');

  // --- the department that owns the equipment -------------------------------
  const faculty =
    (await prisma.facultyInfo.findFirst({
      where: { FacultyName: 'วิศวกรรมศาสตร์' },
    })) ??
    (await prisma.facultyInfo.create({
      data: { FacultyName: 'วิศวกรรมศาสตร์' },
    }));

  let branch = await prisma.branchInfo.findFirst({
    where: { BranchName: 'วิศวกรรมคอมพิวเตอร์' },
    include: { ManageGroup: true },
  });
  if (!branch) {
    const group = await prisma.managementGroup.create({
      data: { GroupType: 'Faculty' },
    });
    branch = await prisma.branchInfo.create({
      data: {
        BranchName: 'วิศวกรรมคอมพิวเตอร์',
        FacultyKey: faculty.FacultyKey,
        ManageGroupKey: group.ManageGroupKey,
      },
      include: { ManageGroup: true },
    });
  }
  const manageGroupKey = branch.ManageGroupKey;
  console.log(
    'Department  : วิศวกรรมคอมพิวเตอร์ (ManageGroupKey =',
    manageGroupKey,
    ')',
  );

  // --- roles ----------------------------------------------------------------
  const staffRole =
    (await prisma.roleInfo.findFirst({ where: { RoleName: 'Staff' } })) ??
    (await prisma.roleInfo.create({ data: { RoleName: 'Staff' } }));
  const studentRole =
    (await prisma.roleInfo.findFirst({ where: { RoleName: 'Student' } })) ??
    (await prisma.roleInfo.create({ data: { RoleName: 'Student' } }));

  const authorityRole =
    (await prisma.authorityRole.findFirst({
      where: { AuthorityName: 'Lab staff' },
    })) ??
    (await prisma.authorityRole.create({
      data: { AuthorityName: 'Lab staff', AuthorityLevel: 2 },
    }));
  const borrowerAuthorityRole =
    (await prisma.authorityRole.findFirst({
      where: { AuthorityName: 'Student' },
    })) ??
    (await prisma.authorityRole.create({
      data: { AuthorityName: 'Student', AuthorityLevel: 0 },
    }));

  // --- the staff account, and its Authority in that department --------------
  const staff =
    (await prisma.accountInfo.findFirst({
      where: { UserID: STAFF_USER_ID },
    })) ??
    (await prisma.accountInfo.create({
      data: {
        Email: STAFF_EMAIL,
        HashedPassword: await hashPassword(STAFF_PASSWORD_PLAINTEXT),
        UserID: STAFF_USER_ID,
        UserFName: 'สมชาย',
        UserLName: 'ดูแลครุภัณฑ์',
        UserCredit: 100,
        RoleKey: staffRole.RoleKey,
      },
    }));

  await prisma.authority.upsert({
    where: {
      AccountKey_ManageGroupKey: {
        AccountKey: staff.AccountKey,
        ManageGroupKey: manageGroupKey,
      },
    },
    update: {},
    create: {
      AccountKey: staff.AccountKey,
      ManageGroupKey: manageGroupKey,
      AuthorityRoleKey: authorityRole.AuthorityRoleKey,
    },
  });
  console.log('Staff       :', STAFF_EMAIL, '/ AccountKey =', staff.AccountKey);

  // --- one borrower, so the handover queue has somebody to hand things to ----
  const borrower =
    (await prisma.accountInfo.findFirst({ where: { UserID: '6710500000' } })) ??
    (await prisma.accountInfo.create({
      data: {
        Email: 'student.demo@ku.th',
        HashedPassword: await hashPassword('student1234'),
        UserID: '6710500000',
        UserFName: 'สมหญิง',
        UserLName: 'ผู้ยืม',
        UserCredit: 100,
        RoleKey: studentRole.RoleKey,
      },
    }));
  console.log(
    'Borrower    : student.demo@ku.th / AccountKey =',
    borrower.AccountKey,
  );

  // --- the borrower's Authority, and the Eligibility rules that match it -----
  //
  // Without both halves `loan.create` refuses every request with NOT_ELIGIBLE:
  // an Eligibility row says "members of group G holding role R may borrow this
  // unit", and it only means anything if somebody actually holds (G, R).
  //
  // Eligibility hangs off ResourceKey, one row per unit - there is no
  // type-level rule (docs/staff.md ส่วนที่ 3 ข้อ 6), so anything registered
  // after this runs needs `item.setEligibility` or another `npm run db:seed`.
  await prisma.authority.upsert({
    where: {
      AccountKey_ManageGroupKey: {
        AccountKey: borrower.AccountKey,
        ManageGroupKey: manageGroupKey,
      },
    },
    update: {},
    create: {
      AccountKey: borrower.AccountKey,
      ManageGroupKey: manageGroupKey,
      AuthorityRoleKey: borrowerAuthorityRole.AuthorityRoleKey,
    },
  });

  const resources = await prisma.resourceInfo.findMany({
    where: { ManagedBy: manageGroupKey },
    select: { ResourceKey: true },
  });
  for (const resource of resources) {
    await prisma.eligibility.upsert({
      where: {
        GroupKey_ResourceKey_RoleKey: {
          GroupKey: manageGroupKey,
          ResourceKey: resource.ResourceKey,
          RoleKey: borrowerAuthorityRole.AuthorityRoleKey,
        },
      },
      update: {},
      create: {
        GroupKey: manageGroupKey,
        ResourceKey: resource.ResourceKey,
        RoleKey: borrowerAuthorityRole.AuthorityRoleKey,
      },
    });
  }
  console.log(
    `Eligibility : ${resources.length} ชิ้น → role "Student" ในกลุ่ม ${manageGroupKey}`,
  );

  console.log('\nseed เสร็จแล้ว — ใช้ค่าเหล่านี้กับ smoke test:');
  console.log(`  STAFF_ACCOUNT_KEY=${staff.AccountKey}`);
  console.log(`  MANAGE_GROUP_KEY=${manageGroupKey}`);
  console.log(`  BORROWER_ACCOUNT_KEY=${borrower.AccountKey}`);
  console.log(`  AUTHORITY_ROLE_KEY=${borrowerAuthorityRole.AuthorityRoleKey}`);
}

/**
 * scrypt hash in the format `common/crypto/password.ts` reads.
 *
 * Reimplemented in eight lines rather than imported, because that module only
 * exists on branches that have the auth slice, and a seed script that cannot
 * run on this branch is no use. The format is self-describing
 * (`scrypt$N$r$p$salt$key`), so a branch with a login verifies these fine.
 */
async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const params = { N: 16384, r: 8, p: 1 };

  const key = await new Promise<Buffer>((resolve, reject) =>
    scrypt(
      plain.normalize('NFKC'),
      salt,
      64,
      { ...params, maxmem: 64 * 1024 * 1024 },
      (err, derived) => (err ? reject(err) : resolve(derived)),
    ),
  );

  return [
    'scrypt',
    params.N,
    params.r,
    params.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
