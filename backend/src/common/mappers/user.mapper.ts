import { mapUserRole, type CreditBand } from '../schemas/status.schema';
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
  FacultyKey: number | null;
  Role: { RoleName: string };
}

export function toUserOutput(row: AccountRow, band: CreditBand): UserOutput {
  return {
    // The frontend's User.id is a string; AccountKey is the DB's int PK.
    id: String(row.AccountKey),
    studentId: row.UserID,
    // The frontend shows a single `name`, so the split columns join here.
    name: `${row.UserFName} ${row.UserLName}`,
    email: row.Email,
    role: mapUserRole(row.Role.RoleName),
    /**
     * User.departmentId is a non-nullable string on the frontend, but
     * AccountInfo.FacultyKey is still nullable — no faculty has been
     * assigned to existing rows yet. Empty string keeps the contract
     * satisfied; once every account has a faculty, make the column
     * required and drop the fallback.
     */
    departmentId: row.FacultyKey === null ? '' : String(row.FacultyKey),
    creditScore: row.UserCredit,
    creditBand: band,
  };
}
