import 'dotenv/config';
import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from './common/crypto/password';
import { seedReference } from './seed/reference';
import { BASE_CREDIT } from './common/credit/recompute-credit';

/**
 * Production bootstrap.
 *
 * Unlike src/seed.ts (dev-only, hardcoded passwords, demo catalogue) this
 * creates nothing but the reference data the app cannot run without and the
 * first administrator, read entirely from the environment. Idempotent: a
 * second run finds the admin account it already made and leaves it alone
 * rather than resetting its password.
 *
 *   ADMIN_EMAIL, ADMIN_USER_ID, ADMIN_PASSWORD (>= 12 chars),
 *   ADMIN_FIRST_NAME, ADMIN_LAST_NAME are required.
 *   ADMIN_FACULTY_NAME is only used if AccountInfo.FacultyKey is required by
 *   the schema, which it currently is not.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const MIN_PASSWORD_LENGTH = 12;

interface AdminConfig {
  email: string;
  userId: string;
  password: string;
  firstName: string;
  lastName: string;
}

function readConfig(): AdminConfig {
  const required = {
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_USER_ID: process.env.ADMIN_USER_ID,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_FIRST_NAME: process.env.ADMIN_FIRST_NAME,
    ADMIN_LAST_NAME: process.env.ADMIN_LAST_NAME,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(
      `Refusing to seed: missing required env var(s): ${missing.join(', ')}.`,
    );
  }

  if (required.ADMIN_PASSWORD!.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Refusing to seed: ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  return {
    email: required.ADMIN_EMAIL!,
    userId: required.ADMIN_USER_ID!,
    password: required.ADMIN_PASSWORD!,
    firstName: required.ADMIN_FIRST_NAME!,
    lastName: required.ADMIN_LAST_NAME!,
  };
}

async function main() {
  const config = readConfig();

  await seedReference(prisma);

  const adminRole = await prisma.roleInfo.findFirst({
    where: { RoleName: 'Admin' },
  });
  if (!adminRole) {
    // seedReference just created it; this can only mean the two have drifted.
    throw new Error('RoleInfo "Admin" not found after seedReference.');
  }

  const existing = await prisma.accountInfo.findFirst({
    where: { OR: [{ Email: config.email }, { UserID: config.userId }] },
  });

  if (existing) {
    console.log(
      `Admin account already exists (AccountKey=${existing.AccountKey}, ` +
        `Email=${existing.Email}, UserID=${existing.UserID}). Password left unchanged.`,
    );
    return;
  }

  const created = await prisma.accountInfo.create({
    data: {
      Email: config.email,
      HashedPassword: await hashPassword(config.password),
      UserID: config.userId,
      UserFName: config.firstName,
      UserLName: config.lastName,
      UserCredit: BASE_CREDIT,
      RoleKey: adminRole.RoleKey,
      IsActive: true,
    },
  });

  console.log(
    `Created admin account (AccountKey=${created.AccountKey}, Email=${config.email}, UserID=${config.userId}).`,
  );
}

main()
  .then(() => console.log('seed-prod complete'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
