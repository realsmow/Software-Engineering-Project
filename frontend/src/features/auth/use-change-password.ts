import { useMutation } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";

/**
 * Change your own password.
 *
 * The current password goes with it even though the caller is signed in: a
 * session alone must not be enough to lock the real owner out of the account.
 *
 * The server revokes every other session and issues a fresh one for this
 * browser, so there is nothing to do on success beyond telling the user how
 * many devices were signed out.
 */
export function useChangePassword() {
  const trpc = useTRPCClient();

  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      trpc.auth.changePassword.mutate(input),
  });
}
