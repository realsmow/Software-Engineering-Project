import 'dotenv/config';
import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from './common/crypto/password';
import { BASE_CREDIT } from './common/credit/recompute-credit';

/**
 * Creates borrower test accounts test01@ku.th ... testNN@ku.th.
 *
 *   TEST_USER_PASSWORD (>= 8 chars, the app's minimum) is required; every
 *   account shares it.
 *   TEST_USER_COUNT defaults to 20.
 *   TEST_GROUP_ID, if set, joins each account to that department or club as
 *   Student, so it can borrow that group's equipment.
 *
 * Idempotent: an account that already exists is left alone.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const password = process.env.TEST_USER_PASSWORD ?? '';
  if (password.length < 8) {
    throw new Error('TEST_USER_PASSWORD must be at least 8 characters.');
  }
  const count = Number(process.env.TEST_USER_COUNT ?? 20);
  const groupKey = process.env.TEST_GROUP_ID
    ? Number(process.env.TEST_GROUP_ID)
    : null;

  const role = await prisma.roleInfo.findFirstOrThrow({
    where: { RoleName: 'Student' },
  });
  const member = groupKey
    ? await prisma.authorityRole.findFirstOrThrow({
        where: { AuthorityName: 'Student' },
      })
    : null;
  const hashed = await hashPassword(password);

  let created = 0;
  for (let n = 1; n <= count; n++) {
    const nn = String(n).padStart(2, '0');
    const email = `test${nn}@ku.th`;
    const userId = `TEST${nn}`;
    const exists = await prisma.accountInfo.findFirst({
      where: { OR: [{ Email: email }, { UserID: userId }] },
    });
    if (exists) continue;

    const account = await prisma.accountInfo.create({
      data: {
        Email: email,
        HashedPassword: hashed,
        UserID: userId,
        UserFName: 'Test',
        UserLName: `User ${nn}`,
        UserCredit: BASE_CREDIT,
        RoleKey: role.RoleKey,
        IsActive: true,
      },
    });
    if (groupKey && member) {
      await prisma.authority.create({
        data: {
          AccountKey: account.AccountKey,
          ManageGroupKey: groupKey,
          AuthorityRoleKey: member.AuthorityRoleKey,
        },
      });
    }
    created++;
  }
  console.log(
    `Created ${created} test account(s); ${count - created} already existed.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
