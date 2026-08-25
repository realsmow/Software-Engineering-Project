import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter } from "react-router-dom";
import { queryClient } from "@/lib/query-client";
import { TRPCProvider, createUlmsTrpcClient } from "@/lib/trpc";
import { useAuthStore } from "@/features/auth/auth.store";
import { toClientUser } from "@/features/auth/user.adapter";
import { AppRouter } from "./router";

/**
 * Root component
 * ประกอบ global providers ทั้งหมด:
 * - QueryClient (TanStack Query)
 * - BrowserRouter (React Router)
 * - DevTools (dev เท่านั้น)
 *
 * Session bootstrap: on mount we ask the server who we are via `auth.me`.
 * The session is an httpOnly cookie, so this is the only way to find out —
 * the client cannot read it. A 401 is the normal "not signed in" answer, not
 * an error, so it resolves to `null` rather than surfacing.
 */
export function App() {
  const setUser = useAuthStore((s) => s.setUser);
  const { i18n } = useTranslation();
  // One tRPC client per app instance (kept stable across renders).
  const [trpcClient] = useState(() => createUlmsTrpcClient());

  useEffect(() => {
    let cancelled = false;
    trpcClient.auth.me
      .query()
      .then((u) => {
        if (!cancelled) setUser(toClientUser(u));
      })
      .catch(() => {
        // 401 NOT_AUTHENTICATED lands here on every signed-out page load.
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [trpcClient, setUser]);

  // Keep <html lang> in sync with the active locale (accessibility).
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
