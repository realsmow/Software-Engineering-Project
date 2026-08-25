import type { User } from "@/types/domain";

/**
 * The user shape the backend actually sends (`userOutput` in
 * backend/src/common/schemas/user.schema.ts).
 *
 * It does not match the frontend's `User`, and deliberately so - the server
 * speaks in database terms (AccountKey, UserFName, CreditTier) while the UI
 * speaks in display terms (a single name, a credit band). Rather than change
 * `User` - `departmentId` alone has ~59 call sites - the difference is
 * absorbed here, in one function, at the one place the boundary is crossed.
 */
export interface ServerUser {
  id: number;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: User["role"];
  facultyName: string | null;
  creditScore: number;
  creditTier: User["creditBand"];
  maxBorrowDays: number;
  maxExtendTimes: number;
}

export function toClientUser(u: ServerUser): User {
  return {
    // AccountKey is an int server-side; every UI path treats an id as a string.
    id: String(u.id),
    studentId: u.studentId,
    name: `${u.firstName} ${u.lastName}`.trim(),
    email: u.email,
    role: u.role,
    // AccountInfo has no faculty relation yet, so the server always sends
    // null here. Empty string keeps the field's type honest until it does.
    departmentId: u.facultyName ?? "",
    creditScore: u.creditScore,
    creditBand: u.creditTier,
  };
}
