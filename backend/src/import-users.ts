import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from './common/crypto/password';
import { BASE_CREDIT } from './common/credit/recompute-credit';
import { mailSettings } from './common/mail/mailer';
import { allowedDomainsFromConfig } from './auth/domain-policy';
import { parseUserCsv, type CsvRole } from './admin/user-csv';

/**
 * Bulk-creates real accounts from a CSV file:
 *
 *   npm run import:users -- people.csv
 *
 * Columns: email,student_id,first_name,last_name[,role][,group]. `group` is
 * the exact name of a department or club. Nothing is written if any row is
 * wrong. Accounts that already exist are skipped.
 *
 * No password is ever chosen for anyone. Each new account gets a welcome
 * email with a link to set its own password, valid for 7 days; after that the
 * person uses "Forgot password". Mail goes through the SMTP_* settings in the
 * environment, the same ones the backend uses.
 *
 * Test accounts: with IMPORT_PASSWORD set (>= 8 chars), every new account
 * gets that password instead, and no link or email is made. For trying the
 * site, not for real people.
 */
const LINK_DAYS = 7;

const ROLE_NAME: Record<CsvRole, string> = {
  borrower: 'Student',
  staff: 'Staff',
  supervisor: 'Supervisor',
};

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: npm run import:users -- <file.csv>');
  const config = new ConfigService();
  const { users, errors } = parseUserCsv(
    readFileSync(file, 'utf8'),
    allowedDomainsFromConfig(config),
  );

  // Department or club names -> group, so every row is checked before writing.
  const [branches, clubs] = await Promise.all([
    prisma.branchInfo.findMany({
      select: { BranchName: true, FacultyKey: true, ManageGroupKey: true },
    }),
    prisma.clubInfo.findMany({
      select: { ClubName: true, ManageGroupKey: true },
    }),
  ]);
  const groups = new Map<string, { key: number; faculty: number | null }[]>();
  const addGroup = (
    name: string | null,
    key: number,
    faculty: number | null,
  ) => {
    const id = (name ?? '').trim().toLowerCase();
    if (id) groups.set(id, [...(groups.get(id) ?? []), { key, faculty }]);
  };
  branches.forEach((b) =>
    addGroup(b.BranchName, b.ManageGroupKey, b.FacultyKey),
  );
  clubs.forEach((c) => addGroup(c.ClubName, c.ManageGroupKey, null));
  for (const u of users) {
    const found = u.group ? groups.get(u.group.toLowerCase()) : undefined;
    if (u.group && !found)
      errors.push(`line ${u.line}: no department or club named "${u.group}"`);
    if (found && found.length > 1)
      errors.push(`line ${u.line}: "${u.group}" matches more than one group`);
  }
  if (errors.length > 0) {
    console.error(
      `Nothing imported. Fix these and run again:\n${errors.join('\n')}`,
    );
    process.exitCode = 1;
    return;
  }

  const roles = await prisma.roleInfo.findMany();
  const memberRoles = await prisma.authorityRole.findMany();
  const roleKey = (name: string, list: { name: string; key: number }[]) => {
    const hit = list.find((r) => r.name === name);
    if (!hit)
      throw new Error(`Role "${name}" is missing; run seed:prod first.`);
    return hit.key;
  };
  const accountRoles = roles.map((r) => ({
    name: r.RoleName ?? '',
    key: r.RoleKey,
  }));
  const groupRoles = memberRoles.map((r) => ({
    name: r.AuthorityName ?? '',
    key: r.AuthorityRoleKey,
  }));
  const mail = mailSettings(config);
  const fixedPassword = process.env.IMPORT_PASSWORD;
  if (fixedPassword !== undefined && fixedPassword.length < 8) {
    throw new Error('IMPORT_PASSWORD must be at least 8 characters.');
  }
  const fixedHash = fixedPassword ? await hashPassword(fixedPassword) : null;

  let created = 0;
  let skipped = 0;
  for (const u of users) {
    const exists = await prisma.accountInfo.findFirst({
      where: {
        OR: [
          { Email: { equals: u.email, mode: 'insensitive' } },
          { UserID: u.studentId },
        ],
      },
      select: { AccountKey: true },
    });
    if (exists) {
      console.log(`skip  ${u.email} (already has an account)`);
      skipped++;
      continue;
    }

    const group = u.group ? groups.get(u.group.toLowerCase())![0] : null;
    const token = randomBytes(32).toString('base64url');
    await prisma.$transaction(async (tx) => {
      const account = await tx.accountInfo.create({
        data: {
          Email: u.email,
          // Otherwise random and never shown: the person sets their own through the link.
          HashedPassword:
            fixedHash ??
            (await hashPassword(randomBytes(24).toString('base64url'))),
          UserID: u.studentId,
          UserFName: u.firstName,
          UserLName: u.lastName,
          UserCredit: BASE_CREDIT,
          RoleKey: roleKey(ROLE_NAME[u.role], accountRoles),
          FacultyKey: group?.faculty ?? null,
          IsActive: true,
        },
      });
      if (group) {
        await tx.authority.create({
          data: {
            AccountKey: account.AccountKey,
            ManageGroupKey: group.key,
            // Same mapping the admin Users page uses.
            AuthorityRoleKey: roleKey(
              u.role === 'borrower' ? 'Student' : 'Lab staff',
              groupRoles,
            ),
          },
        });
      }
      if (fixedHash) return;
      // Same table and hashing as "Forgot password", so the normal reset page accepts it.
      await tx.passwordReset.create({
        data: {
          AccountKey: account.AccountKey,
          TokenHash: createHash('sha256').update(token).digest('hex'),
          ExpiresAt: new Date(Date.now() + LINK_DAYS * 86_400_000),
        },
      });
    });
    created++;
    if (fixedHash) {
      console.log(`ok    ${u.email} (${u.role})`);
      continue;
    }

    const link = `${mail.appUrl}/reset-password?token=${token}`;
    try {
      await mail.mailer.sendMail({
        to: u.email,
        from: mail.from,
        subject: 'ULMs: บัญชีของคุณพร้อมใช้งาน / Your account is ready',
        text: `สวัสดี ${u.firstName}\n\nบัญชี ULMs ของคุณถูกสร้างแล้ว เปิดลิงก์นี้เพื่อตั้งรหัสผ่าน ลิงก์ใช้ได้ ${LINK_DAYS} วันและใช้ได้ครั้งเดียว หากหมดอายุ ใช้ "ลืมรหัสผ่าน" ที่หน้าเข้าสู่ระบบ\n\n${link}\n\n---\nHello ${u.firstName},\n\nYour ULMs account has been created. Open the link above to set your password. It works once within ${LINK_DAYS} days; after that, use "Forgot password" on the sign-in page.`,
      });
      console.log(`ok    ${u.email}`);
    } catch (error) {
      // The account exists; the person can still use "Forgot password".
      console.log(
        `ok    ${u.email} (welcome mail failed: ${(error as Error).message})`,
      );
    }
  }
  console.log(`Created ${created}, skipped ${skipped}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
