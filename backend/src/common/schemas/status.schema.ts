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

/**
 * Equipment tier — T0 cheap/easy, T2 high-value, T3 a room or fixed facility.
 *
 * The schema has no tier column, but it does not need one: the team's own
 * TIER_CONFIG (frontend/src/constants/index.ts) defines each tier by its
 * credit weight (T0=0, T1=5, T2=10, T3=rooms), and CreditWeight is a real
 * column on both ItemInfo and RoomInfo. Deriving it here keeps one source of
 * truth instead of a second column that can disagree with the weight.
 */
export const equipmentTier = z.enum(['T0', 'T1', 'T2', 'T3']);
export type EquipmentTier = z.infer<typeof equipmentTier>;

/**
 * Credit weight -> tier.
 *
 * Ranges rather than exact equality, so a weight nobody anticipated (7, 12)
 * still lands somewhere sensible instead of throwing on a catalogue page.
 * Rooms skip the weight entirely — a facility is T3 because of what it is,
 * not what it costs.
 */
export function tierFromCreditWeight(
  creditWeight: number,
  resourceType: 'Item' | 'Room',
): EquipmentTier {
  if (resourceType === 'Room') return 'T3';
  if (creditWeight <= 0) return 'T0';
  if (creditWeight <= 5) return 'T1';
  return 'T2';
}

/** The CreditWeight range each tier covers, for turning a tier filter into a query. */
export function creditWeightRangeForTier(
  tier: EquipmentTier,
): { gte?: number; lte?: number } | null {
  switch (tier) {
    case 'T0':
      return { lte: 0 };
    case 'T1':
      return { gte: 0.0001, lte: 5 };
    case 'T2':
      return { gte: 5.0001 };
    // T3 is not a weight range — it is "this row is a room", which the caller
    // expresses by querying RoomInfo instead of ItemInfo.
    case 'T3':
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
