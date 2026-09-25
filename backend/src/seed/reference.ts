import type { PrismaClient } from '../generated/prisma/client';

/**
 * Reference data the app cannot run without: roles, borrow-rule tiers, credit
 * bands, and the constraints that price a due date for every (rule x tier)
 * pair. Shared by the dev seed (src/seed.ts) and the production bootstrap
 * (src/seed-prod.ts), and by prisma/seed.ts, so all three agree on one table
 * instead of drifting the way src/seed.ts and prisma/seed.ts used to.
 *
 * Idempotent and safe against an existing database: rows are matched by name
 * and CreditTier's CreditMin/CreditMax are updated in place, not just created
 * when missing, so a database seeded from the old (wrong) ranges converges to
 * the canonical ones here.
 */

/** RoleInfo rows. Names match schema.prisma's comment on AccountInfo and
 * status.schema.ts's tryMapUserRole. */
const ROLES = ['Student', 'Staff', 'Supervisor', 'Admin'];

/** The four BorrowRule rows the catalogue keys its tier off (§5.4). */
const TIER_RULES = ['T0', 'T1', 'T2', 'T3'] as const;

/**
 * Credit bands (proposal §5.7, docs/sections/05_scope.tex ~line 301).
 * CreditTier buckets must cover 0-100 with no gap, or resolveBorrowLimits
 * throws.
 */
const CREDIT_TIERS = [
  { name: 'D0', min: 80, max: 100, maxBorrowDays: 14, maxExtendTimes: 3 },
  { name: 'D1', min: 50, max: 79, maxBorrowDays: 7, maxExtendTimes: 2 },
  { name: 'D2', min: 30, max: 49, maxBorrowDays: 7, maxExtendTimes: 1 },
  { name: 'D3', min: 0, max: 29, maxBorrowDays: 5, maxExtendTimes: 0 },
];

export async function seedReference(prisma: PrismaClient): Promise<void> {
  for (const name of ROLES) {
    const existing = await prisma.roleInfo.findFirst({
      where: { RoleName: name },
    });
    if (!existing) {
      await prisma.roleInfo.create({ data: { RoleName: name } });
    }
  }

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

  for (const t of CREDIT_TIERS) {
    const existing = await prisma.creditTier.findFirst({
      where: { CreditTierName: t.name },
    });
    const tier = existing
      ? await prisma.creditTier.update({
          where: { CreditTierKey: existing.CreditTierKey },
          data: { CreditMin: t.min, CreditMax: t.max },
        })
      : await prisma.creditTier.create({
          data: {
            CreditTierName: t.name,
            CreditMin: t.min,
            CreditMax: t.max,
          },
        });

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
}
