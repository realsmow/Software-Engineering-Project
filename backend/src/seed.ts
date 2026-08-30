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
    email: 'borrower@ku.th',
    pass: 'borrower1234',
    role: 'Student',
    first: 'Natthawut',
    last: 'Srisuwan',
    credit: 92,
  },
  {
    userId: 'test_staff',
    email: 'staff@ku.th',
    pass: 'staff1234',
    role: 'Staff',
    first: 'Somchai',
    last: 'Promcharoen',
    credit: 100,
  },
  {
    userId: 'test_supervisor',
    email: 'supervisor@ku.th',
    pass: 'supervisor1234',
    role: 'Supervisor',
    first: 'Orawan',
    last: 'Phakdee',
    credit: 100,
  },
  {
    userId: 'test_admin',
    email: 'admin@ku.th',
    pass: 'admin1234',
    role: 'Admin',
    first: 'Thanapon',
    last: 'IT',
    credit: 100,
  },
];

const FACULTY_NAME = 'คณะวิศวกรรมศาสตร์';

async function main() {
  // One faculty, assigned to every seeded account. Without it FacultyKey stays
  // null and the profile's department field reads empty, which looks like a
  // bug rather than "nobody has been assigned yet".
  const faculty =
    (await prisma.facultyInfo.findFirst({
      where: { FacultyName: FACULTY_NAME },
    })) ??
    (await prisma.facultyInfo.create({ data: { FacultyName: FACULTY_NAME } }));

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

  await seedCatalogue(rule.BorrowRuleKey);

  for (const u of USERS) {
    const hashed = await hashPassword(u.pass);
    const existing = await prisma.accountInfo.findFirst({
      where: { UserID: u.userId },
    });

    if (existing) {
      await prisma.accountInfo.update({
        where: { AccountKey: existing.AccountKey },
        data: {
          // Email and names are refreshed too, otherwise editing this file
          // silently does nothing to a database that was already seeded.
          Email: u.email,
          HashedPassword: hashed,
          UserFName: u.first,
          UserLName: u.last,
          RoleKey: roleKeys.get(u.role)!,
          UserCredit: u.credit,
          FacultyKey: faculty.FacultyKey,
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
          FacultyKey: faculty.FacultyKey,
        },
      });
    }
    console.log(`  seeded ${u.userId} (${u.role})`);
  }
}

/**
 * Catalogue fixtures.
 *
 * An item the borrower can see needs three rows, not one: ItemInfo is the
 * *type* ("Digital vernier caliper"), ItemIndiv is a physical unit with an
 * asset tag, and ResourceInfo carries the lending state that both the item and
 * room flows share. Seeding only ItemInfo produces a catalogue entry with zero
 * units, which lists as permanently unavailable.
 */
const CATALOG = [
  {
    name: 'เวอร์เนียคาลิปเปอร์ดิจิทัล',
    desc: 'ความละเอียด 0.01 มม. พร้อมกล่องเก็บ',
    weight: 1,
    units: 4,
    prefix: 'ME-CAL',
  },
  {
    name: 'สายจัมเปอร์ชุดใหญ่',
    desc: 'สายจัมเปอร์ผู้-เมีย 120 เส้น',
    weight: 1,
    units: 6,
    prefix: 'EE-JMP',
  },
  {
    name: 'ออสซิลโลสโคป 100MHz',
    desc: 'สองช่องสัญญาณ พร้อมโพรบ',
    weight: 3,
    units: 2,
    prefix: 'EE-OSC',
  },
  {
    name: 'กล้องถ่ายภาพ DSLR',
    desc: 'ตัวกล้องพร้อมเลนส์คิท และแบตสำรอง',
    weight: 3,
    units: 3,
    prefix: 'MM-CAM',
  },
];

async function seedCatalogue(borrowRuleKey: number) {
  const group =
    (await prisma.managementGroup.findFirst({
      where: { GroupType: 'Faculty' },
    })) ??
    (await prisma.managementGroup.create({ data: { GroupType: 'Faculty' } }));

  for (const c of CATALOG) {
    const existing = await prisma.itemInfo.findFirst({
      where: { ItemName: c.name },
    });
    const type =
      existing ??
      (await prisma.itemInfo.create({
        data: { ItemName: c.name, ItemDesc: c.desc, CreditWeight: c.weight },
      }));

    // Top the type up to its unit count rather than recreating, so re-running
    // the seed does not multiply the inventory.
    const have = await prisma.itemIndiv.count({
      where: { ItemKey: type.ItemKey },
    });
    for (let i = have; i < c.units; i++) {
      const resource = await prisma.resourceInfo.create({
        data: {
          ManagedBy: group.ManageGroupKey,
          BorrowRule: borrowRuleKey,
          ResourceStatus: 'InStorage',
          ResourceType: 'Item',
          BufferTime: 0,
          AllowBorrow: true,
        },
      });
      await prisma.itemIndiv.create({
        data: {
          ResourceKey: resource.ResourceKey,
          ItemKey: type.ItemKey,
          ItemID: `${c.prefix}-${String(i + 1).padStart(3, '0')}`,
        },
      });
    }
    console.log(`  catalogue ${c.name} (${c.units} units)`);
  }
}

main()
  .then(() => console.log('seed complete'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
