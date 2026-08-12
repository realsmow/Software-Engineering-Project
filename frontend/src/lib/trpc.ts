import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@/server/trpc-contract";

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
 * The backend has no procedures yet, so calls will fail at runtime until it
 * lands — the wiring and types are ready for that moment.
 */
const TRPC_URL = import.meta.env.VITE_TRPC_URL || "/trpc";

export function createUlmsTrpcClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: TRPC_URL,
        fetch(url, options) {
          return fetch(url, { ...options, credentials: "include" });
        },
      }),
    ],
  });
}

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();
