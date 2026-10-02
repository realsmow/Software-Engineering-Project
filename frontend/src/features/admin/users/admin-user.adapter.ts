import type { Role } from "@/types/domain";
import type { AccountStatus, AdminUser } from "../admin-constants";

/**
 * The account shape the backend sends (`adminUserSummary` in
 * backend/src/admin/admin.schema.ts), converted to the `AdminUser` this page
 * was built against.
 *
 * Same boundary-adapter approach as auth and the catalogue: the server speaks
 * in database terms, the UI in display terms, and the gap is absorbed in one
 * place rather than spread across a 600-line page.
 */
export interface ServerAdminUser {
  id: number;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  status: AccountStatus;
  creditScore: number;
  /** Null for accounts made before creation times were recorded. */
  createdAt?: string | null;
  /** Newest sign-in; null if the account never signed in. */
  lastActiveAt?: string | null;
  managementGroup: { id: number; name: string | null; type: string } | null;
}

/** KU addresses sign in by email, everyone else by their assigned user ID. */
function authMethodFor(email: string): AdminUser["auth"] {
  return /@ku\.(ac\.)?th$/i.test(email.trim()) ? "ku" : "local";
}

export function toAdminUser(s: ServerAdminUser): AdminUser {
  return {
    id: String(s.id),
    name: `${s.firstName} ${s.lastName}`.trim(),
    email: s.email,
    govId: s.studentId,
    role: s.role,
    // The server reports the management group an account holds authority in,
    // which is the closest thing it has to a department. Plain borrowers have
    // none, so this is empty for most rows.
    departmentId: s.managementGroup?.name ?? "",
    // Derived, not stored: AccountInfo has no column recording how someone
    // signs in, and both methods hit the same password check anyway.
    auth: authMethodFor(s.email),
    status: s.status,
    // "-" when unknown: an old account's creation time was never recorded, and
    // an account that never signed in has no last-active time.
    lastActiveAt: s.lastActiveAt ?? "-",
    createdAt: s.createdAt ?? "-",
  };
}

/**
 * The fuller account shape (`adminUserDetail`), returned only by
 * `admin.getUserById`.
 *
 * The list endpoint deliberately does not carry these: they cost several joins
 * each, and a 500-row table does not need them. They are fetched once, when a
 * row is opened. Note `authorities` is a list, while the summary carries only
 * the first group - an account can hold authority in several departments, and
 * the table was only ever showing one of them.
 */
export interface ServerAuthorityGrant {
  manageGroupKey: number;
  groupName: string | null;
  groupType: "Club" | "Faculty";
  authorityName: string;
  authorityLevel: number | null;
}

export interface ServerActivePenalty {
  id: number;
  reason: string | null;
  /** The loan it came from; null for a ban. */
  usageKey: number | null;
  creditDeducted: number | null;
  issuedAt: string | null;
  expiresAt: string;
  appealed: boolean;
}

export interface ServerAdminUserDetail extends ServerAdminUser {
  facultyId: number | null;
  creditTier: string;
  maxBorrowDays: number;
  maxExtendTimes: number;
  authorities: ServerAuthorityGrant[];
  activePenalties: ServerActivePenalty[];
}

export interface AdminUserDetail extends AdminUser {
  /** Kept apart from the combined `name`, because the edit form writes them separately. */
  firstName: string;
  lastName: string;
  facultyId: number | null;
  creditScore: number;
  creditTier: string;
  maxBorrowDays: number;
  maxExtendTimes: number;
  authorities: ServerAuthorityGrant[];
  activePenalties: ServerActivePenalty[];
}

export function toAdminUserDetail(s: ServerAdminUserDetail): AdminUserDetail {
  return {
    ...toAdminUser(s),
    firstName: s.firstName,
    lastName: s.lastName,
    facultyId: s.facultyId,
    creditScore: s.creditScore,
    creditTier: s.creditTier,
    maxBorrowDays: s.maxBorrowDays,
    maxExtendTimes: s.maxExtendTimes,
    authorities: s.authorities,
    activePenalties: s.activePenalties,
  };
}
