import { useEffect, useState } from "react";
import { useTRPCClient } from "@/lib/trpc";

/**
 * FR-AUTH-01: which sign-in providers the backend has actually wired up.
 *
 * Called once on the login page, imperatively like `signIn` in login-page.tsx
 * rather than through TanStack Query - the login page renders before any
 * session exists and should not need a QueryClientProvider just to ask this.
 *
 * Starts as `{ google: false }` and stays that way on any failure, which is
 * the safe default: Google is off unless the server actively says otherwise
 * (READY TO WIRE LATER - no real credentials exist yet).
 */
export function useAuthProviders(): { google: boolean } {
  const trpc = useTRPCClient();
  const [providers, setProviders] = useState({ google: false });

  useEffect(() => {
    let cancelled = false;
    // Wrapped in one try/catch rather than a bare `.then/.catch` chain so a
    // client that has no `providers` procedure at all (older mocks in tests,
    // a contract mismatch) is caught the same way as a rejected request -
    // either way the safe default below stands.
    (async () => {
      try {
        const result = await trpc.auth.providers.query();
        if (!cancelled) setProviders(result);
      } catch {
        // Leave the safe default - a failure here should not hide the rest
        // of the login page, it should just hide the Google button.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trpc]);

  return providers;
}
