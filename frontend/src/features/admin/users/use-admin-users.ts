import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import type { Role } from "@/types/domain";
import { toAdminUser } from "./admin-user.adapter";
import type { AdminUser } from "../mock-data";

/**
 * Admin account list and the mutations that act on it.
 *
 * The page filters, counts and sorts client-side, so this fetches every
 * account rather than paging. The server caps pageSize at 100, so it walks
 * pages instead of asking for one large one.
 *
 * Every mutation invalidates the list rather than patching local state. An
 * account's status is derived server-side from IsActive and its penalty rows,
 * so guessing the new value in the client is how the two drift apart.
 */
const ADMIN_USERS_KEY = ["admin", "users"] as const;
const MAX_PAGE_SIZE = 100;
const MAX_PAGES = 50;

export function useAdminUsers() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: ADMIN_USERS_KEY,
    queryFn: async (): Promise<AdminUser[]> => {
      const first = await trpc.admin.listUsers.query({ page: 1, pageSize: MAX_PAGE_SIZE });
      const rows = [...first.items];

      const pages = Math.min(Math.ceil(first.total / MAX_PAGE_SIZE), MAX_PAGES);
      for (let page = 2; page <= pages; page++) {
        const next = await trpc.admin.listUsers.query({ page, pageSize: MAX_PAGE_SIZE });
        rows.push(...next.items);
      }

      return rows.map(toAdminUser);
    },
  });
}

/** Shared by every mutation below: refetch the list once the server has spoken. */
function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
}

/** Enable or disable sign-in. Disabling also revokes the account's sessions. */
export function useSetUserActive() {
  const trpc = useTRPCClient();
  const invalidate = useInvalidateUsers();

  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      trpc.admin.setUserActive.mutate({ id: Number(id), active }),
    onSuccess: invalidate,
  });
}

/** Borrowing ban. Distinct from disable: a banned user can still sign in. */
export function useSetUserBan() {
  const trpc = useTRPCClient();
  const invalidate = useInvalidateUsers();

  return useMutation({
    mutationFn: ({ id, banned, reason }: { id: string; banned: boolean; reason?: string }) =>
      trpc.admin.setUserBan.mutate({ id: Number(id), banned, reason }),
    onSuccess: invalidate,
  });
}

export function useChangeRole() {
  const trpc = useTRPCClient();
  const invalidate = useInvalidateUsers();

  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      trpc.admin.changeRole.mutate({ id: Number(id), role }),
    onSuccess: invalidate,
  });
}

/**
 * Resets a password and returns the generated one.
 *
 * The temporary password is shown once and never stored client-side; there is
 * no way to retrieve it again, which is why the caller surfaces it immediately.
 */
export function useResetPassword() {
  const trpc = useTRPCClient();

  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      trpc.admin.resetPassword.mutate({ id: Number(id) }),
  });
}

export function useCreateUser() {
  const trpc = useTRPCClient();
  const invalidate = useInvalidateUsers();

  return useMutation({
    mutationFn: (input: {
      email: string;
      studentId: string;
      firstName: string;
      lastName: string;
      role: Role;
    }) => trpc.admin.createUser.mutate({ ...input, initialCredit: 100 }),
    onSuccess: invalidate,
  });
}
