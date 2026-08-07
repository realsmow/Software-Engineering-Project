import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter } from "react-router-dom";
import { queryClient } from "@/lib/query-client";
import { useAuthStore } from "@/features/auth/auth.store";
import { AppRouter } from "./router";

/**
 * Root component
 * ประกอบ global providers ทั้งหมด:
 * - QueryClient (TanStack Query)
 * - BrowserRouter (React Router)
 * - DevTools (dev เท่านั้น)
 *
 * NOTE: No API is wired yet (brief note #5). Instead of fetching /auth/me we
 * hydrate the persisted mock user from localStorage on mount. Swap for the
 * real session bootstrap when the backend lands.
 */
export function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const { i18n } = useTranslation();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Keep <html lang> in sync with the active locale (accessibility).
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
