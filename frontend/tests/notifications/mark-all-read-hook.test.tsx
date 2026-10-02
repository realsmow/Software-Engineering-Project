import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "../../src/lib/query-client";
import { useMarkAllRead } from "../../src/features/notifications/use-notifications";
import { notificationResponse } from "../fixtures/api-responses";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/trpc", () => ({
  useTRPCClient: () => ({ notification: { markAllRead: { mutate } } }),
}));
let client: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const page = () => ({
  items: [
    notificationResponse({ id: "1" }),
    notificationResponse({ id: "2", readAt: "2031-09-25T00:00:00.000Z" }),
  ],
  total: 2,
  page: 1,
  pageSize: 20,
});
beforeEach(() => {
  mutate.mockReset();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => client.clear());

describe("FR-NTF-05: mark all notifications read", () => {
  it("updates the badge and unread rows optimistically while preserving existing read times", async () => {
    const original = page();
    client.setQueryData(queryKeys.notificationList, original);
    client.setQueryData(queryKeys.notificationUnread, { unread: 1 });
    let resolve!: (value: { ok: true }) => void;
    mutate.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const { result } = renderHook(useMarkAllRead, { wrapper });
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.mutateAsync();
    });
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(client.getQueryData(queryKeys.notificationUnread)).toEqual({ unread: 0 });
    const optimistic = client.getQueryData<ReturnType<typeof page>>(
      queryKeys.notificationList
    )!;
    expect(optimistic.items[0].readAt).toEqual(expect.any(String));
    expect(optimistic.items[1].readAt).toBe(original.items[1].readAt);
    expect(original.items[0].readAt).toBeUndefined();
    await act(async () => {
      resolve({ ok: true });
      await pending;
    });
    expect(client.getQueryState(queryKeys.notificationList)?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.notificationUnread)?.isInvalidated).toBe(true);
  });

  it("restores both rows and badge if the server refuses the write", async () => {
    const original = page(),
      badge = { unread: 1 };
    client.setQueryData(queryKeys.notificationList, original);
    client.setQueryData(queryKeys.notificationUnread, badge);
    const error = new Error("UNAUTHORIZED");
    mutate.mockRejectedValue(error);
    const { result } = renderHook(useMarkAllRead, { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toBe(error);
    });
    expect(client.getQueryData(queryKeys.notificationList)).toEqual(original);
    expect(client.getQueryData(queryKeys.notificationUnread)).toEqual(badge);
    expect(client.getQueryState(queryKeys.notificationList)?.isInvalidated).toBe(true);
  });

  it("can mark all read before any notification page has been cached", async () => {
    mutate.mockResolvedValue({ ok: true });
    const { result } = renderHook(useMarkAllRead, { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(mutate).toHaveBeenCalledWith();
    expect(client.getQueryData(queryKeys.notificationUnread)).toEqual({ unread: 0 });
    expect(client.getQueryData(queryKeys.notificationList)).toBeUndefined();
  });
});
