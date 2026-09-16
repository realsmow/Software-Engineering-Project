import type { Role } from "@/types/domain";
import type { AccountStatus, AdminUser } from "../mock-data";

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
    // AccountInfo has no timestamps at all - no createdAt, no last-seen. These
    // stay blank until the schema grows them rather than being faked, since a
    // made-up "last active" is worse than an obvious gap.
    lastActiveAt: "-",
    createdAt: "-",
  };
}
