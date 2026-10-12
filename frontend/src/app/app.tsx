import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { QueryClientProvider } from "@tanstack/react-query";
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
 * The session is an httpOnly cookie, so this is the only way to find out -
 * the client cannot read it. Signed out, it answers null.
 */
export function App() {
  const setUser = useAuthStore((s) => s.setUser);
  const { i18n } = useTranslation();
  // One tRPC client per app instance (kept stable across renders).
  const [trpcClient] = useState(() => createUlmsTrpcClient());

  useEffect(() => {
    let cancelled = false;
    // Only the server saying "nobody" signs the user out. A network error or
    // a 5xx (the free host waking from sleep, a phone resuming a tab) is
    // retried, which used to log people out on every app switch.
    async function bootstrap() {
      for (let attempt = 0; ; attempt++) {
        try {
          const u = await trpcClient.auth.me.query();
          if (!cancelled) setUser(u ? toClientUser(u) : null);
          return;
        } catch (error) {
          const status = (error as { data?: { httpStatus?: number } }).data?.httpStatus;
          // ponytail: ~45 s of retries covers a cold start; after that, sign-in page.
          if (cancelled || status === 401 || attempt >= 8) {
            if (!cancelled) setUser(null);
            return;
          }
          await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 8000)));
        }
      }
    }
    void bootstrap();
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
      </TRPCProvider>
    </QueryClientProvider>
  );
}
