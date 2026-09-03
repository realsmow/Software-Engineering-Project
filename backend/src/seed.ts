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

/** The four BorrowRule rows the catalogue keys its tier off (§5.4). */
const TIER_RULES = ['T0', 'T1', 'T2', 'T3'] as const;
type TierRule = (typeof TIER_RULES)[number];

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

/**
 * Refuse to run anywhere that is not obviously a development database.
 *
 * This script creates accounts whose passwords are published in two READMEs.
 * Running it against production would hand anyone who has read the repo a
 * working admin login, so the check is deliberately paranoid: production is
 * refused outright, and a non-local database host is refused unless someone
 * sets ALLOW_REMOTE_SEED and therefore cannot claim it was an accident.
 */
function assertSafeToSeed(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to seed: NODE_ENV=production. These accounts have publicly known passwords.',
    );
  }

  const url = process.env.DATABASE_URL ?? '';
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(
      'Refusing to seed: DATABASE_URL is missing or unparseable.',
    );
  }

  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres', 'db'].includes(
    host,
  );
  if (!isLocal && process.env.ALLOW_REMOTE_SEED !== 'true') {
    throw new Error(
      `Refusing to seed: database host "${host}" is not local. ` +
        'Set ALLOW_REMOTE_SEED=true only if you are certain this is a throwaway database.',
    );
  }
}

async function main() {
  assertSafeToSeed();

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

  // A tier *is* a BorrowRule row, and status.schema.ts reads the tier off
  // RuleName. A single rule called 'default' therefore maps to no tier at all,
  // and every item in the catalogue comes back with `tier: null` - which takes
  // the tier dot, the tier facet and the whole T2 serial flow down with it.
  const ruleKeys = {} as Record<(typeof TIER_RULES)[number], number>;
  for (const name of TIER_RULES) {
    const existing = await prisma.borrowRule.findFirst({
      where: { RuleName: name },
    });
    const row =
      existing ??
      (await prisma.borrowRule.create({ data: { RuleName: name } }));
    ruleKeys[name] = row.BorrowRuleKey;
  }

  for (const t of TIERS) {
    const existing = await prisma.creditTier.findFirst({
      where: { CreditTierName: t.name },
    });
    const tier =
      existing ??
      (await prisma.creditTier.create({
        data: { CreditTierName: t.name, CreditMin: t.min, CreditMax: t.max },
      }));

    // One row per (rule x credit tier) so any item can price a due date for
    // any borrower. A missing pair makes `credit.me` fall over on that tier.
    for (const ruleKey of Object.values(ruleKeys)) {
      await prisma.borrowConstraints.upsert({
        where: {
          BorrowRuleKey_CreditTierKey: {
            BorrowRuleKey: ruleKey,
            CreditTierKey: tier.CreditTierKey,
          },
        },
        update: {
          MaxBorrowDate: t.maxBorrowDays,
          MaxExtendTime: t.maxExtendTimes,
        },
        create: {
          BorrowRuleKey: ruleKey,
          CreditTierKey: tier.CreditTierKey,
          MaxBorrowDate: t.maxBorrowDays,
          MaxExtendTime: t.maxExtendTimes,
        },
      });
    }
  }

  const units = await seedUnits(faculty.FacultyKey);
  await seedCatalogue(ruleKeys, units);

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

  await seedAccess(units);
}

/**
 * Who may borrow what.
 *
 * Without this the seeded catalogue is visible and completely un-borrowable:
 * `loan.create` refuses every line with NOT_ELIGIBLE / NO_RULES_CONFIGURED,
 * which takes the approval desk and the staff counter down with it, because
 * neither has anything to show until a request exists.
 *
 * It takes two halves that only mean something together. An Eligibility row
 * says "members of group G holding role R may borrow this unit"; an Authority
 * row is what actually puts somebody in (G, R). Seeding either one alone
 * changes nothing.
 *
 * Eligibility hangs off ResourceKey, one row per unit - there is no
 * type-level rule (docs/staff.md) - so a unit registered after this runs needs
 * `item.setEligibility` or another seed.
 */
async function seedAccess(units: Record<UnitCode, number>): Promise<void> {
  // Level 0: a plain student clears no authority floor above zero, which is
  // what T0/T1 ask for. Staff get a level that can also prepare and inspect.
  const studentRole =
    (await prisma.authorityRole.findFirst({
      where: { AuthorityName: 'Student' },
    })) ??
    (await prisma.authorityRole.create({
      data: { AuthorityName: 'Student', AuthorityLevel: 0 },
    }));
  const labStaffRole =
    (await prisma.authorityRole.findFirst({
      where: { AuthorityName: 'Lab staff' },
    })) ??
    (await prisma.authorityRole.create({
      data: { AuthorityName: 'Lab staff', AuthorityLevel: 2 },
    }));

  const groupKeys = Object.values(units);
  const accounts = await prisma.accountInfo.findMany({
    where: { UserID: { in: USERS.map((u) => u.userId) } },
    select: { AccountKey: true, UserID: true, Role: { select: { RoleName: true } } },
  });

  for (const account of accounts) {
    // Everyone is a student of both departments so cross-department borrowing
    // is demonstrable; staff and above additionally administer them.
    const isStaffSide = account.Role.RoleName !== 'Student';
    for (const groupKey of groupKeys) {
      await prisma.authority.upsert({
        where: {
          AccountKey_ManageGroupKey: {
            AccountKey: account.AccountKey,
            ManageGroupKey: groupKey,
          },
        },
        update: {},
        create: {
          AccountKey: account.AccountKey,
          ManageGroupKey: groupKey,
          AuthorityRoleKey: isStaffSide
            ? labStaffRole.AuthorityRoleKey
            : studentRole.AuthorityRoleKey,
        },
      });
    }
  }

  // Both roles, one Eligibility row each.
  //
  // FR-AUTH-04 says staff and supervisors can do everything a borrower can, so
  // a staff member has to be able to borrow a multimeter like anyone else. But
  // administering a department must not by itself grant that (see the note on
  // EligibilityService): the check matches an exact (group, role) pair, so the
  // permission has to be written down as its own rule rather than inferred
  // from the Authority row that lets them manage the shelf.
  //
  // Authority is unique per (account, group), so one account cannot hold both
  // roles - which is why this opens the unit to both roles instead of trying
  // to give staff a second, student-shaped Authority row.
  let opened = 0;
  for (const groupKey of groupKeys) {
    const resources = await prisma.resourceInfo.findMany({
      where: { ManagedBy: groupKey },
      select: { ResourceKey: true },
    });
    for (const resource of resources) {
      for (const roleKey of [
        studentRole.AuthorityRoleKey,
        labStaffRole.AuthorityRoleKey,
      ]) {
        await prisma.eligibility.upsert({
          where: {
            GroupKey_ResourceKey_RoleKey: {
              GroupKey: groupKey,
              ResourceKey: resource.ResourceKey,
              RoleKey: roleKey,
            },
          },
          update: {},
          create: {
            GroupKey: groupKey,
            ResourceKey: resource.ResourceKey,
            RoleKey: roleKey,
          },
        });
      }
      opened++;
    }
  }
  console.log(
    `  access: ${accounts.length} accounts x ${groupKeys.length} groups, ${opened} units opened to students and staff`,
  );
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
/** The two lending units the MVP demos borrowing across. */
const UNITS = [
  { code: 'cpe', name: 'ภาควิชาวิศวกรรมคอมพิวเตอร์' },
  { code: 'ee', name: 'ภาควิชาวิศวกรรมไฟฟ้า' },
] as const;

type UnitCode = (typeof UNITS)[number]['code'];

const CATALOG = [
  {
    name: 'เวอร์เนียคาลิปเปอร์ดิจิทัล',
    desc: 'ความละเอียด 0.01 มม. พร้อมกล่องเก็บ',
    weight: 1,
    units: 4,
    prefix: 'ME-CAL',
    tier: 'T0' as TierRule,
    unit: 'cpe' as UnitCode,
  },
  {
    name: 'สายจัมเปอร์ชุดใหญ่',
    desc: 'สายจัมเปอร์ผู้-เมีย 120 เส้น',
    weight: 1,
    units: 6,
    prefix: 'EE-JMP',
    tier: 'T0' as TierRule,
    unit: 'ee' as UnitCode,
  },
  {
    name: 'ออสซิลโลสโคป 100MHz',
    desc: 'สองช่องสัญญาณ พร้อมโพรบ',
    weight: 3,
    units: 2,
    prefix: 'EE-OSC',
    tier: 'T2' as TierRule,
    unit: 'ee' as UnitCode,
  },
  {
    name: 'กล้องถ่ายภาพ DSLR',
    desc: 'ตัวกล้องพร้อมเลนส์คิท และแบตสำรอง',
    weight: 3,
    units: 3,
    prefix: 'MM-CAM',
    tier: 'T1' as TierRule,
    unit: 'cpe' as UnitCode,
  },
];

/**
 * Creates the two lending units and returns their ManagementGroup keys.
 *
 * A unit is a ManagementGroup plus the BranchInfo that names it. Seeding only
 * the group leaves every item owned by an unnamed "Faculty", which is why the
 * catalogue used to report owner.name as null - and why cross-department
 * borrowing could not be demonstrated.
 */
async function seedUnits(
  facultyKey: number,
): Promise<Record<UnitCode, number>> {
  const keys = {} as Record<UnitCode, number>;

  for (const unit of UNITS) {
    const existing = await prisma.branchInfo.findFirst({
      where: { BranchName: unit.name },
      select: { ManageGroupKey: true },
    });

    if (existing) {
      keys[unit.code] = existing.ManageGroupKey;
      continue;
    }

    const group = await prisma.managementGroup.create({
      data: { GroupType: 'Faculty' },
    });
    await prisma.branchInfo.create({
      data: {
        BranchName: unit.name,
        FacultyKey: facultyKey,
        ManageGroupKey: group.ManageGroupKey,
      },
    });
    keys[unit.code] = group.ManageGroupKey;
    console.log(`  unit ${unit.name}`);
  }

  return keys;
}

async function seedCatalogue(
  ruleKeys: Record<TierRule, number>,
  units: Record<UnitCode, number>,
) {
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
          ManagedBy: units[c.unit],
          BorrowRule: ruleKeys[c.tier],
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
    // Top-up alone cannot fix a type whose units were created under a
    // different rule - re-running would leave them on the old tier forever.
    // Converge them instead, so the seed describes the end state rather than
    // only the gap.
    const moved = await prisma.resourceInfo.updateMany({
      where: {
        ResourceKey: {
          in: (
            await prisma.itemIndiv.findMany({
              where: { ItemKey: type.ItemKey },
              select: { ResourceKey: true },
            })
          ).map((r) => r.ResourceKey),
        },
        BorrowRule: { not: ruleKeys[c.tier] },
      },
      data: { BorrowRule: ruleKeys[c.tier] },
    });

    console.log(
      `  catalogue ${c.name} (${c.units} units, ${c.unit}, ${c.tier}` +
        `${moved.count ? `, retiered ${moved.count}` : ''})`,
    );
  }
}

main()
  .then(() => console.log('seed complete'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
