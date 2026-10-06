import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@/server/api-types";
import { useAuthStore } from "@/features/auth/auth.store";

/**
 * Frontend tRPC wiring.
 *
 * - `useTRPC()` returns a typed proxy for building TanStack Query options:
 *     const trpc = useTRPC();
 *     const { data } = useQuery(trpc.item.list.queryOptions({ page: 1, pageSize: 20 }));
 *     const m = useMutation(trpc.loan.cancel.mutationOptions());
 * - `useTRPCClient()` gives the vanilla client for imperative calls.
 *
 * Transport: httpBatchLink → `/trpc` (Vite dev-proxies this to the NestJS
 * backend on :3000; override with VITE_TRPC_URL). `credentials: "include"`
 * sends the auth httpOnly cookie on every request (ว-03).
 *
 * Types come from `api-types.d.ts`, a generated snapshot of the backend's
 * tRPC router (see docs/trpc-guide.tex) - never edit that file by hand.
 */
const TRPC_URL = import.meta.env.VITE_TRPC_URL || "/trpc";

export function createUlmsTrpcClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: TRPC_URL,
        async fetch(url, options) {
          const response = await fetch(url, { ...options, credentials: "include" });
          // A 401 while signed in means the session ended on the server.
          // Dropping the local user lets the route guard send them to login
          // without a reload (#138). Signed out, a 401 is just a refusal.
          if (response.status === 401 && useAuthStore.getState().user) {
            useAuthStore.getState().setUser(null);
          }
          return response;
        },
      }),
    ],
  });
}

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();
