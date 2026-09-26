import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCronJobs,
  useRunCronJob,
  useSystemStatus,
} from "../../src/features/admin/status/use-system-status";
import { useAuditEvents } from "../../src/features/admin/audit/use-audit-events";
import type { SystemStatus } from "../../src/features/admin/status/status.types";

const getSystemStatusMock = vi.hoisted(() => vi.fn());
const listCronJobsMock = vi.hoisted(() => vi.fn());
const listAuditMock = vi.hoisted(() => vi.fn());
const runCronJobMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/lib/trpc", () => ({
  useTRPCClient: () => ({
    admin: {
      getSystemStatus: { query: getSystemStatusMock },
      listCronJobs: { query: listCronJobsMock },
      listAudit: { query: listAuditMock },
      runCronJob: { mutate: runCronJobMock },
    },
  }),
}));

const STATUS: SystemStatus = {
  checkedAt: "2026-09-20T02:00:00.000Z",
  uptimeSeconds: 60,
  nodeVersion: "v22.14.0",
  database: { state: "degraded", latencyMs: 260 },
  counts: { accounts: 1, resources: 2, activeLoans: 3, pendingReservations: 4 },
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("admin status data hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSystemStatusMock.mockResolvedValue(STATUS);
    listCronJobsMock.mockResolvedValue([]);
    listAuditMock.mockResolvedValue({
      items: [
        {
          id: 10,
          at: "2026-09-20T02:00:00.000Z",
          actorId: 7,
          actorName: "System admin",
          actorRole: "admin",
          action: "config",
          target: "system/config",
          ip: null,
          userAgent: null,
          detail: "Viewed technical configuration",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    });
    runCronJobMock.mockResolvedValue({ ok: true });
  });

  it("calls the admin.getSystemStatus procedure and returns its live response", async () => {
    const result = renderHook(() => useSystemStatus(), { wrapper });

    await waitFor(() => expect(result.result.current.data).toEqual(STATUS));
    expect(getSystemStatusMock).toHaveBeenCalledTimes(1);
  });

  it("calls the admin.listCronJobs procedure", async () => {
    const result = renderHook(() => useCronJobs(), { wrapper });

    await waitFor(() => expect(result.result.current.data).toEqual([]));
    expect(listCronJobsMock).toHaveBeenCalledTimes(1);
  });

  it("loads and adapts audit records through admin.listAudit", async () => {
    const result = renderHook(() => useAuditEvents(), { wrapper });

    await waitFor(() =>
      expect(result.result.current.data?.[0]?.target).toBe("system/config")
    );
    expect(listAuditMock).toHaveBeenCalledWith({ page: 1, pageSize: 100 });
  });

  it("passes a selected job to admin.runCronJob and refreshes status data", async () => {
    const result = renderHook(() => useRunCronJob(), { wrapper });

    await act(async () => {
      await result.result.current.mutateAsync("markOverdue");
    });

    expect(runCronJobMock).toHaveBeenCalledWith({ job: "markOverdue" });
  });
});
