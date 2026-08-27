import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter } from "react-router-dom";
import { queryClient } from "@/lib/query-client";
import { useMe } from "@/features/auth/use-me";
import { AppRouter } from "./router";

/**
 * Root component
 * ประกอบ global providers ทั้งหมด:
 * - QueryClient (TanStack Query)
 * - BrowserRouter (React Router)
 * - DevTools (dev เท่านั้น)
 */
export function App() {
  const { i18n } = useTranslation();

  // Keep <html lang> in sync with the active locale (accessibility).
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionBootstrap />
        <AppRouter />
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}

/**
 * Asks the backend who the session cookie belongs to and pushes the answer
 * into the auth store.
 *
 * Renders nothing — it exists so the query runs inside QueryClientProvider,
 * once, above the router. ProtectedRoute waits on the store's `isLoading`
 * flag, which this call resolves either way (signed in, or a 401 meaning
 * signed out).
 */
function SessionBootstrap() {
  useMe();
  return null;
}
