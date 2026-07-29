import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter } from "react-router-dom";
import { queryClient } from "@/lib/query-client";
import { AppRouter } from "./router";

/**
 * Root component
 * ประกอบ global providers ทั้งหมด:
 * - QueryClient (TanStack Query)
 * - BrowserRouter (React Router)
 * - DevTools (dev เท่านั้น)
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
