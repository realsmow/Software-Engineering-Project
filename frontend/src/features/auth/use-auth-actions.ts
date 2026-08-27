import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { trpc, trpcClient, trpcErrorCode } from "@/lib/trpc";
import { HOME_ROUTE_BY_ROLE, ROUTES } from "@/constants";
import type { User } from "@/types/domain";
import { useAuthStore } from "./auth.store";

/**
 * Login / logout actions.
 *
 * Both sign-in methods hand back the same `User`, and the session itself
 * arrives as an httpOnly cookie the browser stores on its own — there is no
 * token for this code to hold. On success we seed the store and the `auth.me`
 * cache with the returned profile so no extra round-trip is needed.
 */

/**
 * Maps a backend error code to an i18n key the login form can render.
 *
 * The login screen is bilingual, so it goes through i18n rather than
 * lib/error-messages.ts (which returns fixed Thai strings for other
 * surfaces).
 */
export function loginErrorKey(error: unknown): string {
  switch (trpcErrorCode(error)) {
    case "INVALID_CREDENTIALS":
      return "auth.invalidCredentials";
    case "EMAIL_ALREADY_REGISTERED":
      return "auth.emailAlreadyRegistered";
    default:
      return "common.error";
  }
}

/** Shared success handling for every path that starts a session. */
function useSessionStart() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const meKey = trpc.auth.me.queryKey();

  return (user: User) => {
    setUser(user);
    // Seed the cache so the first render after redirect already has a user.
    queryClient.setQueryData(meKey, user);
    navigate(HOME_ROUTE_BY_ROLE[user.role], { replace: true });
  };
}

/** KU email sign-in — students and faculty */
export function useLoginWithKuEmail() {
  const onSuccess = useSessionStart();
  return useMutation({
    ...trpc.auth.loginWithKuEmail.mutationOptions(),
    onSuccess,
  });
}

/** Local account sign-in — department staff without a KU email */
export function useLoginWithLocalAccount() {
  const onSuccess = useSessionStart();
  return useMutation({
    ...trpc.auth.loginWithLocalAccount.mutationOptions(),
    onSuccess,
  });
}

/**
 * Logout.
 *
 * Calls the server first so the cookie is actually cleared — dropping only
 * the local state would leave a valid session cookie in the browser. Local
 * state and the query cache are cleared either way, so a failed request
 * can't strand the user in a half-signed-in UI.
 */
export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clear = useAuthStore((s) => s.clear);

  return useMutation({
    mutationFn: () => trpcClient.auth.logout.mutate(),
    onSettled: () => {
      clear();
      queryClient.clear();
      navigate(ROUTES.LOGIN, { replace: true });
    },
  });
}
