import { useQuery } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import { fetchAllPages } from "@/lib/paging";
import type { Role } from "@/types/domain";

/**
 * People in the caller's own departments.
 *
 * Backed by `admin.listUsersInScope`, not `admin.listUsers`: the latter is
 * unscoped and admin-only. Scope is membership of a ManagementGroup the caller holds
 * Authority in (SDS §7.3); an admin calling it gets everyone.
 */
export type AccountStatus = "active" | "disabled";

export interface DepartmentUser {
  id: number;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  status: AccountStatus;
  creditScore: number;
  /** First group the account holds Authority in; null for a plain borrower. */
  managementGroup: {
    id: number;
    name: string | null;
    type: string;
  } | null;
}

const DEPT_USERS_KEY = ["staff", "department-users"] as const;

export function useDepartmentUsers(q: string) {
  const trpc = useTRPCClient();
  const search = q.trim();

  return useQuery({
    queryKey: [...DEPT_USERS_KEY, search],
    queryFn: async (): Promise<DepartmentUser[]> =>
      fetchAllPages((page, pageSize) =>
        trpc.admin.listUsersInScope.query({
          page,
          pageSize,
          ...(search ? { q: search } : {}),
        }),
      ),
  });
}
