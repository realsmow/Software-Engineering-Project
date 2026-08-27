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
  switch (roleName.toLowerCase()) {
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
      throw new Error(`Unknown RoleName "${roleName}" — add a mapping in mapUserRole`);
  }
}

/**
 * Credit band — sourced from the CreditTier table (CreditMin/CreditMax).
 *
 * The DB calls this a "tier", the frontend calls it a "band"
 * (User.creditBand in frontend/src/types/domain.ts). The frontend name wins
 * at the API boundary, so the DB term stops here.
 */
export const creditBand = z.enum(['D0', 'D1', 'D2', 'D3']);
export type CreditBand = z.infer<typeof creditBand>;

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
