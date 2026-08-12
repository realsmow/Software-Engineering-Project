import { mapUserRole, type CreditTier } from '../schemas/status.schema';
import type { UserOutput } from '../schemas/user.schema';

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

/** Borrow limits resolved from CreditTier x BorrowConstraints — caller looks these up */
export interface BorrowLimits {
  creditTier: CreditTier;
  /** BorrowConstraints.MaxBorrowDate */
  maxBorrowDays: number;
  /** BorrowConstraints.MaxExtendTime */
  maxExtendTimes: number;
}

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
