import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  getSystemStatus: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  useTRPCClient: () => ({
    admin: {
      getSystemStatus: { query: mocks.getSystemStatus },
    },
  }),
}));

import { useSystemStatus } from "@/features/admin/status/use-system-status";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("Admin system status — Module 11.7", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSystemStatus.mockResolvedValue({
      checkedAt: "2026-09-23T10:00:00.000Z",
      uptimeSeconds: 120,
      nodeVersion: "v22.0.0",
      database: { state: "operational", latencyMs: 4 },
      counts: { accounts: 10, resources: 20, activeLoans: 3, pendingReservations: 1 },
    });
  });
  it("11.7 calls admin.getSystemStatus through the tRPC client", async () => {
    const { result } = renderHook(() => useSystemStatus(), { wrapper });

    await waitFor(() => expect(result.current.data?.database.state).toBe("operational"));

    expect(mocks.getSystemStatus).toHaveBeenCalledTimes(1);
  });

  it("11.7 keeps polling the admin system-status procedure", async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useSystemStatus(), { wrapper });

    await vi.waitFor(() => expect(result.current.data).toBeDefined());
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(mocks.getSystemStatus).toHaveBeenCalledTimes(2);
    unmount();
    vi.useRealTimers();
  });
});
