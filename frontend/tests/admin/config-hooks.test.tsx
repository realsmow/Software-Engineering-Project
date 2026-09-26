import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useUpdateWorkHours,
  useWorkHours,
} from "../../src/features/admin/config/use-config";
import { lendingSettingsOutput } from "../../../backend/src/admin/admin.schema";

const getSettingsMock = vi.hoisted(() => vi.fn());
const updateHoursMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/lib/trpc", () => ({
  useTRPCClient: () => ({
    admin: {
      getLendingSettings: { query: getSettingsMock },
      updateWorkHours: { mutate: updateHoursMock },
    },
  }),
}));

describe("admin working hours data hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads working hours and updates the cache with the saved server response", async () => {
    const settings = lendingSettingsOutput.strict().parse({
      workHours: { start: 8, end: 17 },
      creditTiers: [],
      borrowRules: [],
    });
    const saved = lendingSettingsOutput
      .strict()
      .parse({ ...settings, workHours: { start: 9, end: 18 } });
    getSettingsMock.mockResolvedValue(settings);
    updateHoursMock.mockResolvedValue(saved);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const result = renderHook(
      () => ({ hours: useWorkHours(), save: useUpdateWorkHours() }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      }
    );
    await waitFor(() =>
      expect(result.result.current.hours.data).toEqual(settings.workHours)
    );
    await act(async () => {
      await result.result.current.save.mutateAsync(saved.workHours);
    });
    expect(getSettingsMock).toHaveBeenCalledTimes(1);
    expect(updateHoursMock).toHaveBeenCalledWith(saved.workHours);
    await waitFor(() =>
      expect(result.result.current.hours.data).toEqual(saved.workHours)
    );
    expect(client.getQueryData(["admin", "workHours"])).toEqual(saved.workHours);
    client.clear();
  });
});
