import { z } from 'zod';

/** User role — sourced from the RoleInfo table (not a DB enum) */
export const userRole = z.enum(['borrower', 'staff', 'supervisor', 'admin']);
export type UserRole = z.infer<typeof userRole>;

/**
 * Converts RoleInfo.RoleName into one of our fixed role strings.
 *
 * RoleInfo rows use the names in schema.prisma's own comment on AccountInfo
 * (Student / Professor / Staff / Supervisor / Admin), which aren't the same
 * strings as `userRole` — this is the one place that knows the mapping.
 * Never let the raw RoleKey number or an unmapped RoleName leak past here.
 */
export function mapUserRole(roleName: string): UserRole {
  const role = tryMapUserRole(roleName);
  if (role === null) {
    throw new Error(
      `Unknown RoleName "${roleName}" — add a mapping in tryMapUserRole`,
    );
  }
  return role;
}

/**
 * Same mapping, but null instead of throwing.
 *
 * Needed wherever RoleInfo rows are *scanned* rather than resolved — e.g.
 * finding which RoleKey corresponds to 'staff'. A row somebody added by hand
 * should not blow up a list query; it should just not match.
 */
export function tryMapUserRole(roleName: string): UserRole | null {
  switch (roleName.trim().toLowerCase()) {
    case 'student':
    case 'borrower':
      return 'borrower';
    case 'staff':
      return 'staff';
    case 'professor':
    case 'supervisor':
      return 'supervisor';
    case 'admin':
      return 'admin';
    default:
      return null;
  }
}

/** Credit tier — sourced from the CreditTier table (CreditMin/CreditMax) */
export const creditTier = z.enum(['D0', 'D1', 'D2', 'D3']);
export type CreditTier = z.infer<typeof creditTier>;

/**
 * Converts a raw DB string column into one of our fixed status strings.
 *
 * Throws on an unrecognized value instead of silently falling back, so a
 * new row added to a status table (without a matching update here) fails
 * loudly instead of shipping a wrong value to the client.
 */
export function mapStatus<T extends string>(
  schema: z.ZodEnum<Record<string, T>>,
  raw: string,
  field: string,
): T {
  const result = schema.safeParse(raw.toLowerCase());
  if (!result.success) {
    throw new Error(
      `Value "${raw}" of ${field} is not in the set defined in status.schema.ts — add it there first.`,
    );
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Equipment tier — sourced from the BorrowRule table (BorrowRule.RuleName)
// ---------------------------------------------------------------------------

/**
 * Equipment tier T0–T3 (proposal §5.4).
 *
 * The schema has no tier column: a tier *is* a BorrowRule row, because the
 * only thing a tier changes is how the thing may be borrowed (who approves,
 * whether a serial is bound, how extensions work). RuleName carries the label.
 *
 * ── Why this and not CreditWeight ─────────────────────────────────────────
 * The two branches merged here each derived the tier differently, so the
 * question had to be settled once. It was settled from the documents, not by
 * preference:
 *
 *  1. `BorrowConstraints` is unique on (BorrowRuleKey, CreditTierKey) and
 *     carries MaxBorrowDate / MaxExtendTime / MinimumAuthorityLevel. That is
 *     exactly the T-tier × D-tier matrix CONTRACT.md describes ("เครดิตกำหนดแค่
 *     จำนวนวันยืมสูงสุด ผ่าน CreditTier → BorrowConstraints.MaxBorrowDate").
 *     A tier therefore has to be a BorrowRule row — nothing else can key that
 *     table.
 *  2. `admin.getLendingSettings` already edits those rules per BorrowRule row,
 *     so deriving the tier from anywhere else makes the admin screen and the
 *     catalogue disagree about the same equipment.
 *  3. TIER_CONFIG (frontend/src/constants/index.ts) gives T0 and T3 the *same*
 *     creditWeight of 0, so credit weight cannot tell those two tiers apart on
 *     its own. It is the credit *cost* of a thing, not its tier.
 *
 * `ResourceInfo.BorrowRule` is a required FK, so every unit has exactly one.
 * An ItemInfo row (a *type*) has no tier of its own — it takes the tier of its
 * units, and a type with no units yet has none. See docs/staff.md §2.
 */
export const resourceTier = z.enum(['T0', 'T1', 'T2', 'T3']);
export type ResourceTier = z.infer<typeof resourceTier>;

/** BorrowRule.RuleName -> tier, or null for a rule that is not one of the four. */
export function tryMapTier(ruleName: string | null): ResourceTier | null {
  if (ruleName === null) return null;
  const result = resourceTier.safeParse(ruleName.trim().toUpperCase());
  return result.success ? result.data : null;
}

// ---------------------------------------------------------------------------
// Damage levels — the staff-facing name for ConditionType
// ---------------------------------------------------------------------------

/**
 * Damage grade B0–B3 assessed by staff after a return (proposal §5.7).
 *
 * Kept separate from Prisma's ConditionType enum for two reasons: the contract
 * says statuses cross the wire as our own fixed strings (ว-10), and the two
 * sets are not the same size — ConditionType also has `Missing`, which is not
 * a grade a staff member awards but a state the overdue job assigns.
 */
export const damageLevel = z.enum(['B0', 'B1', 'B2', 'B3']);
export type DamageLevel = z.infer<typeof damageLevel>;

/** Condition of a single unit, as reported to clients. Mirrors ConditionType. */
export const conditionType = z.enum([
  'Normal',
  'MinorDamage',
  'MajorDamage',
  'Broken',
  'Missing',
]);
export type ConditionType = z.infer<typeof conditionType>;

/** B0–B3 -> the ConditionType row written to ConditionLog. */
export const DAMAGE_CONDITION: Record<DamageLevel, ConditionType> = {
  B0: 'Normal',
  B1: 'MinorDamage',
  B2: 'MajorDamage',
  B3: 'Broken',
};

/**
 * Credit multiplier per damage grade (proposal §5.7).
 *
 * discredit = ItemInfo.CreditWeight x this number. B0 is 0 because fair wear
 * is the university's cost, not the borrower's — grading a return B0 must
 * never produce a penalty row.
 */
export const DAMAGE_CREDIT_WEIGHT: Record<DamageLevel, number> = {
  B0: 0,
  B1: 1,
  B2: 3,
  B3: 5,
};

/** ConditionType -> the grade it came from, for reading history back out. */
export function tryMapDamageLevel(
  condition: ConditionType,
): DamageLevel | null {
  const entry = Object.entries(DAMAGE_CONDITION).find(
    ([, value]) => value === condition,
  );
  return entry ? (entry[0] as DamageLevel) : null;
}

// ---------------------------------------------------------------------------
// Lifecycle states — mirrors of the Prisma enums, as contract strings
// ---------------------------------------------------------------------------

/** ResourceInfo.ResourceStatus — where a physical unit is right now. */
export const resourceStatus = z.enum(['InStorage', 'Lended', 'Missing']);
export type ResourceStatus = z.infer<typeof resourceStatus>;

/** UsageLog.CurrentStatus — how far along one borrowing is. */
export const usageStatus = z.enum([
  'Pending',
  'Prepared',
  'Lended',
  'Returned',
  'Inspected',
]);
export type UsageStatus = z.infer<typeof usageStatus>;

/** Reservations.ApproveStatus / ExtensionRequest.ApproveStatus. */
export const approveStatus = z.enum([
  'Pending',
  'Approved',
  'Rejected',
  'Canceled',
]);
export type ApproveStatus = z.infer<typeof approveStatus>;

/** PenaltyInfo reasons — mirrors the PenaltyReason enum in schema.prisma. */
export const penaltyReason = z.enum([
  'DamagedItem',
  'BrokenItem',
  'LostItem',
  'DidntReturn',
  'ReturnLate',
]);
export type PenaltyReason = z.infer<typeof penaltyReason>;
