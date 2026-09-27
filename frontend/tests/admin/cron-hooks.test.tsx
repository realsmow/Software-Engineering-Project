import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCronJobs,
  useRunCronJob,
} from "../../src/features/admin/status/use-system-status";
import { okOutput } from "../../../backend/src/common/schemas/ok.schema";
import { systemStatusOutput } from "../../../backend/src/admin/admin.schema";

const listCronJobsMock = vi.hoisted(() => vi.fn());

const runCronJobMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/lib/trpc", () => ({
  useTRPCClient: () => ({
    admin: {
      listCronJobs: { query: listCronJobsMock },
      runCronJob: { mutate: runCronJobMock },
    },
  }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("admin cron job hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listCronJobsMock.mockResolvedValue([]);
    runCronJobMock.mockResolvedValue(okOutput.parse({ ok: true }));
  });

  it("calls the admin.listCronJobs procedure", async () => {
    const result = renderHook(() => useCronJobs(), { wrapper });

    await waitFor(() => expect(result.result.current.data).toEqual([]));
    expect(listCronJobsMock).toHaveBeenCalledTimes(1);
  });

  it("passes a selected job to admin.runCronJob and refreshes status data", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(["admin", "cron-jobs"], []);
    client.setQueryData(
      ["admin", "system-status"],
      systemStatusOutput.strict().parse({
        checkedAt: "2026-09-20T02:00:00.000Z",
        uptimeSeconds: 60,
        nodeVersion: "v22.14.0",
        database: { state: "operational", latencyMs: 4 },
        counts: { accounts: 1, resources: 2, activeLoans: 3, pendingReservations: 4 },
      })
    );
    const result = renderHook(() => useRunCronJob(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await act(async () => {
      await result.result.current.mutateAsync("markOverdue");
    });

    expect(runCronJobMock).toHaveBeenCalledWith({ job: "markOverdue" });
    expect(client.getQueryState(["admin", "cron-jobs"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["admin", "system-status"])?.isInvalidated).toBe(true);
    result.unmount();
    client.clear();
  });
});
