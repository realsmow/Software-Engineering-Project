import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter } from "react-router-dom";
import { queryClient } from "@/lib/query-client";
import { useAuthStore } from "@/features/auth/auth.store";
import { DevRoleSwitcher } from "@/components/shared/dev-role-switcher";
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

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRouter />
        {/* Dev-only: switch/enter any role from anywhere, including login. */}
        {import.meta.env.DEV && <DevRoleSwitcher />}
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
