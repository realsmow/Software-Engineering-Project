import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCronJobs,
  useRunCronJob,
} from "../../src/features/admin/status/use-system-status";
import { okOutput } from "../../../backend/src/common/schemas/ok.schema";

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
    const result = renderHook(() => useRunCronJob(), { wrapper });

    await act(async () => {
      await result.result.current.mutateAsync("markOverdue");
    });

    expect(runCronJobMock).toHaveBeenCalledWith({ job: "markOverdue" });
  });
});
