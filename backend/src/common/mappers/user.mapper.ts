import { mapUserRole } from '../schemas/status.schema';
import type { UserOutput } from '../schemas/user.schema';
import type { BorrowLimits } from '../credit/credit-tier.service';

/**
 * Shape the mapper needs — declared by hand rather than imported from
 * Prisma's generated types, so the caller decides exactly which columns to
 * select (AccountInfo.HashedPassword lives in the same row and must never
 * be fetched just because a type wanted it).
 */
export interface AccountRow {
  AccountKey: number;
  UserID: string;
  UserFName: string;
  UserLName: string;
  Email: string;
  UserCredit: number;
  Role: { RoleName: string };
  Faculty?: { FacultyName: string } | null;
}

/**
 * Borrow limits resolved from CreditTier x BorrowConstraints.
 *
 * Defined by CreditTierService rather than here, so `auth.me` and
 * `admin.getUserById` cannot end up with two slightly different ideas of what
 * a limit is. Re-exported because callers of this mapper already import from
 * it.
 */
export type { BorrowLimits };

export function toUserOutput(row: AccountRow, limits: BorrowLimits): UserOutput {
  return {
    id: row.AccountKey,
    studentId: row.UserID,
    firstName: row.UserFName,
    lastName: row.UserLName,
    email: row.Email,
    role: mapUserRole(row.Role.RoleName),
    facultyName: row.Faculty?.FacultyName ?? null,

    creditScore: row.UserCredit,
    creditTier: limits.creditTier,
    maxBorrowDays: limits.maxBorrowDays,
    maxExtendTimes: limits.maxExtendTimes,
  };
}
