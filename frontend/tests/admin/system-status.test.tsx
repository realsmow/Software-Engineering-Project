import { systemStatusOutput } from "../../../backend/src/admin/admin.schema";
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
    mocks.getSystemStatus.mockResolvedValue(
      systemStatusOutput.strict().parse({
        checkedAt: "2026-09-23T10:00:00.000Z",
        uptimeSeconds: 120,
        nodeVersion: "v22.0.0",
        database: { state: "operational", latencyMs: 4 },
        counts: { accounts: 10, resources: 20, activeLoans: 3, pendingReservations: 1 },
      })
    );
  });
  it("11.7 keeps polling the admin system-status procedure", async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useSystemStatus(), { wrapper });

    await vi.waitFor(() =>
      expect(result.current.data?.database.state).toBe("operational")
    );
    expect(mocks.getSystemStatus).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(mocks.getSystemStatus).toHaveBeenCalledTimes(2);
    unmount();
    vi.useRealTimers();
  });
});

describe("admin status data hooks", () => {
  const getSystemStatusMock = mocks.getSystemStatus;

  const STATUS = systemStatusOutput.strict().parse({
    checkedAt: "2026-09-20T02:00:00.000Z",
    uptimeSeconds: 60,
    nodeVersion: "v22.14.0",
    database: { state: "degraded", latencyMs: 260 },
    counts: { accounts: 7, resources: 8, activeLoans: 3, pendingReservations: 4 },
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getSystemStatusMock.mockResolvedValue(STATUS);
  });

  it("calls the admin.getSystemStatus procedure and returns its contract-validated response", async () => {
    const result = renderHook(() => useSystemStatus(), { wrapper });

    await waitFor(() => expect(result.result.current.data).toEqual(STATUS));
    expect(getSystemStatusMock).toHaveBeenCalledTimes(1);
  });
});
