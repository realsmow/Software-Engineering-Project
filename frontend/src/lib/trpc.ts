import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "../../../backend/src/generated/trpc/server";
import { queryClient } from "./query-client";

/**
 * tRPC client — the typed path to the backend.
 *
 * `AppRouter` is imported straight from the backend's generated contract
 * (`npm run trpc:generate` there), so a router or Zod schema change on the
 * server surfaces here as a type error instead of a runtime surprise. The
 * import is type-only, so no backend code is bundled.
 */

/**
 * Deliberately its own variable rather than reusing VITE_API_URL: that one
 * already points at the REST base (`.../api`), while the backend mounts tRPC
 * at `/trpc` (TRPCModule basePath in app.module.ts). Appending "/trpc" to it
 * would produce "/api/trpc", which does not exist.
 *
 * Relative by default so the Vite dev proxy handles it (see vite.config.ts),
 * keeping the browser same-origin and the session cookie first-party. Point
 * it at a full origin only for a backend on another host — which also needs
 * that origin added to ALLOWED_ORIGINS in backend/src/main.ts.
 */
const TRPC_URL = import.meta.env.VITE_TRPC_URL ?? "/trpc";

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: TRPC_URL,
      // Without this the httpOnly ulms_session cookie is never sent and
      // every authenticated procedure returns UNAUTHORIZED.
      fetch: (url, options) =>
        fetch(url, { ...options, credentials: "include" }),
    }),
  ],
});

/**
 * Query/mutation option builders, e.g.
 *   useQuery(trpc.auth.me.queryOptions())
 *   useMutation(trpc.auth.loginWithKuEmail.mutationOptions())
 */
export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});

/** True when the server rejected the call because nobody is signed in. */
export function isUnauthorized(error: unknown): boolean {
  return (
    error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED"
  );
}

/**
 * Turns a tRPC failure into a message for the user.
 *
 * The backend sends stable machine codes as the error message
 * (INVALID_CREDENTIALS, EMAIL_ALREADY_REGISTERED, ...) so the Thai wording
 * lives in the i18n layer rather than in the API.
 */
export function trpcErrorCode(error: unknown): string {
  return error instanceof TRPCClientError ? error.message : "UNKNOWN_ERROR";
}
