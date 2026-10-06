import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import { Topbar } from "../../src/components/layout/topbar";
import { useAuthStore } from "../../src/features/auth/auth.store";
import { ROUTES } from "../../src/constants";

vi.mock("../../src/lib/trpc", () => {
  const never = new Proxy(
    {},
    {
      get: () =>
        new Proxy(
          {},
          {
            get: () => ({
              query: () => new Promise(() => {}),
              mutate: () => new Promise(() => {}),
            }),
          }
        ),
    }
  );
  return { useTRPCClient: () => never };
});

// #176: each page gets its own browser tab title.
describe("tab title", () => {
  it("names the current page", async () => {
    await i18n.changeLanguage("en");
    useAuthStore.setState({
      user: { id: "1", role: "admin" } as never,
      isLoading: false,
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[ROUTES.ADMIN_CONFIG]}>
          <Topbar />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(document.title).toBe(`${i18n.t("nav.techConfig")} · ULMs`);
  });
});
