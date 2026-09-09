import { useMutation } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import { useAuthStore } from "./auth.store";

/**
 * Signs the account out of every device.
 *
 * `auth.logout` revokes the session in this browser. This revokes every
 * session the account holds, which is what you want after leaving yourself
 * signed in on a shared lab machine or suspecting the password is known.
 *
 * The server clears this browser's cookie too, so the local store has to be
 * cleared with it or the app would keep rendering a signed-in shell against a
 * session that no longer exists.
 */
export function useLogoutAll() {
  const trpc = useTRPCClient();
  const logout = useAuthStore((s) => s.logout);

  return useMutation({
    mutationFn: () => trpc.auth.logoutAll.mutate(),
    onSuccess: () => logout(),
  });
}
