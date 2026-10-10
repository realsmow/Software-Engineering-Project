import { act, renderHook, waitFor } from "@testing-library/react";
import {
  approvalCounts,
  approvalQueueRow,
  decideApprovalOutput,
  retirementRequestOutput,
  borrowerHistoryOutput,
} from "../../../backend/src/approval/approval.schema";
import { requestResponse } from "../fixtures/api-responses";
import {
  useApprovalCounts,
  useApprovalQueue,
  useDecideApproval,
  useExtensionQueue,
  useDecideExtension,
  useRetirementQueue,
  useDecideRetirement,
  useBorrowerHistory,
} from "../../src/features/supervisor/approvals/use-approvals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const approvalApi = vi.hoisted(() => ({
  counts: { query: vi.fn() },
  queue: { query: vi.fn() },
  decide: { mutate: vi.fn() },
  extensionQueue: { query: vi.fn() },
  decideExtension: { mutate: vi.fn() },
  retirementQueue: { query: vi.fn() },
  decideRetirement: { mutate: vi.fn() },
}));

const query = vi.hoisted(() =>
  vi.fn<
    (input: {
      accountKey: number;
    }) => Promise<ReturnType<typeof borrowerHistoryOutput.parse>>
  >()
);
vi.mock("../../src/lib/trpc", () => ({
  useTRPCClient: () => ({ approval: { ...approvalApi, borrowerHistory: { query } } }),
}));

const clients: QueryClient[] = [];
function wrapper({ children }: PropsWithChildren) {
  const client = clients[clients.length - 1];
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  vi.resetAllMocks();
  clients.push(
    new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
  );
});
afterEach(() => {
  clients.pop()?.clear();
  vi.restoreAllMocks();
});

describe("borrower history query isolation", () => {
  it("does not request history before a borrower is selected", () => {
    const { result } = renderHook(() => useBorrowerHistory(undefined), { wrapper });
    expect(query).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches a new borrower and reuses only that borrower's cached history", async () => {
    const empty = borrowerHistoryOutput.strict().parse({
      totalLoans: 0,
      lateReturns: 0,
      damageIncidents: 0,
      lastDamageDate: null,
      items: [],
    });
    const populated = borrowerHistoryOutput.strict().parse({
      ...empty,
      totalLoans: 1,
      items: [
        {
          usageKey: 1,
          itemName: "Lab 3",
          serialNo: null,
          checkoutAt: "2026-09-23T08:00:00.000Z",
          returnedAt: "2026-09-23T09:00:00.000Z",
          overdueDays: 0,
          status: "Inspected",
        },
      ],
    });
    query.mockImplementation(async ({ accountKey }) =>
      accountKey === 42 ? populated : empty
    );
    const { result, rerender } = renderHook(
      ({ accountKey }) => useBorrowerHistory(accountKey),
      { initialProps: { accountKey: 42 }, wrapper }
    );
    await waitFor(() => expect(result.current.data).toEqual(populated));
    rerender({ accountKey: 43 });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toEqual(empty));
    expect(query.mock.calls).toEqual([[{ accountKey: 42 }], [{ accountKey: 43 }]]);
    rerender({ accountKey: 42 });
    await waitFor(() => expect(result.current.data).toEqual(populated));
    expect(query).toHaveBeenCalledTimes(2);
  });
});

// Real service/adapter assertions share this module's suite; setup is scoped.
describe("Approval desk queries and mutations", () => {
  const api = approvalApi;

  let client: QueryClient;

  const retirement = () =>
    retirementRequestOutput.strict().parse({
      requestKey: 4,
      resourceKey: 7,
      kind: "equipment",
      resourceName: "Meter",
      serialNo: "M1",
      reason: "Beyond repair",
      status: "Pending",
      requestedBy: { accountKey: 2, userId: "STAFF2", name: "QA Staff" },
      requestedAt: "2031-09-26T00:00:00.000Z",
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
    });

  beforeEach(() => {
    client = clients[clients.length - 1];
  });

  describe("FR-APV-01/02/04 / FR-EQP-08: approval desk data flow", () => {
    it("preserves every count from the supervisor's scoped dashboard", async () => {
      const counts = approvalCounts.strict().parse({
        staff: 2,
        supervisor: 3,
        // #203/#204: the extension half of the two figures above — one T2
        // check still owed by the counter, one checked and awaiting a
        // signature — so the page can label its extensions section.
        extensions: { staff: 1, supervisor: 2 },
        overdueToDecide: 1,
        autoApprovedToday: 4,
        retirement: 5,
        asOf: "2031-09-26T00:00:00.000Z",
      });
      api.counts.query.mockResolvedValue(counts);
      const { result } = renderHook(useApprovalCounts, { wrapper });
      await waitFor(() => expect(result.current.data).toEqual(counts));
    });

    it("forwards route and trimmed search with the full row used for decision making", async () => {
      const row = approvalQueueRow.strict().parse({
        reservationKey: 29,
        requestedAt: "2031-09-26T00:00:00.000Z",
        borrower: {
          accountKey: 10,
          studentId: "S1",
          firstName: "QA",
          lastName: "Borrower",
          creditScore: 100,
        },
        creditTier: "D0",
        route: "supervisor",
        resourceKey: 7,
        itemName: "Meter",
        serialNo: "M1",
        kind: "equipment",
        tier: "T2",
        startTime: "2031-09-27T00:00:00.000Z",
        endTime: "2031-09-28T00:00:00.000Z",
        requestedDays: 1,
        reason: null,
        clashesWith: [],
      });
      api.queue.query.mockResolvedValue({ items: [row], total: 1 });
      const { result } = renderHook(() => useApprovalQueue("supervisor", "  S1  "), {
        wrapper,
      });
      await waitFor(() => expect(result.current.data).toEqual([row]));
      expect(api.queue.query).toHaveBeenCalledWith({
        page: 1,
        pageSize: 100,
        route: "supervisor",
        q: "S1",
      });
    });

    it("does not send blank filters and gives route changes separate cached queues", async () => {
      api.queue.query.mockResolvedValue({ items: [], total: 0 });
      const { result, rerender } = renderHook(
        ({ route }) => useApprovalQueue(route, "  "),
        { initialProps: { route: undefined as "supervisor" | undefined }, wrapper }
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(api.queue.query).toHaveBeenLastCalledWith({ page: 1, pageSize: 100 });
      rerender({ route: "supervisor" });
      await waitFor(() => expect(api.queue.query).toHaveBeenCalledTimes(2));
      expect(api.queue.query).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 100,
        route: "supervisor",
      });
    });

    it("forwards a rejection explanation and refreshes approval counts and queues after success", async () => {
      const output = decideApprovalOutput
        .strict()
        .parse({ request: requestResponse({ status: "rejected" }), cancelled: [] });
      api.decide.mutate.mockResolvedValue(output);
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const { result } = renderHook(useDecideApproval, { wrapper });
      const input = {
        reservationKey: 29,
        decision: "reject" as const,
        reason: "Reserved for the class",
      };
      await act(async () => {
        expect(await result.current.mutateAsync(input)).toEqual(output);
      });
      expect(api.decide.mutate).toHaveBeenCalledWith(input);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["approvals"] });
    });

    it("trims extension searches without sending an approval route", async () => {
      api.extensionQueue.query.mockResolvedValue({ items: [], total: 0 });
      const { result } = renderHook(() => useExtensionQueue("  S1  "), { wrapper });
      await waitFor(() => expect(result.current.data).toEqual([]));
      expect(api.extensionQueue.query).toHaveBeenCalledWith({
        page: 1,
        pageSize: 100,
        q: "S1",
      });
    });

    it("forwards the physical condition and refreshes both the desk and borrower's extension view", async () => {
      api.decideExtension.mutate.mockResolvedValue({ ok: true });
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const { result } = renderHook(useDecideExtension, { wrapper });
      const input = {
        extensionKey: 9,
        decision: "approve" as const,
        condition: "Normal" as const,
        note: "Checked at the desk",
      };
      await act(async () => {
        await result.current.mutateAsync(input);
      });
      expect(api.decideExtension.mutate).toHaveBeenCalledWith(input);
      expect(invalidate.mock.calls.map(([input]) => input?.queryKey)).toEqual([
        ["approvals"],
        ["borrower"],
      ]);
    });

    it("loads retirement requests and refreshes inventory when retirement succeeds", async () => {
      const row = retirement();
      api.retirementQueue.query.mockResolvedValue({ items: [row], total: 1 });
      api.decideRetirement.mutate.mockResolvedValue(
        retirementRequestOutput.parse({
          ...row,
          status: "Approved",
          decidedAt: "2031-09-26T01:00:00.000Z",
        })
      );
      const queue = renderHook(useRetirementQueue, { wrapper });
      await waitFor(() => expect(queue.result.current.data).toEqual([row]));
      expect(api.retirementQueue.query).toHaveBeenCalledWith({ page: 1, pageSize: 100 });
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const { result } = renderHook(useDecideRetirement, { wrapper });
      const input = {
        requestKey: 4,
        decision: "approve" as const,
        note: "Confirmed beyond repair",
      };
      await act(async () => {
        await result.current.mutateAsync(input);
      });
      expect(api.decideRetirement.mutate).toHaveBeenCalledWith(input);
      expect(invalidate.mock.calls.map(([input]) => input?.queryKey)).toEqual([
        ["approvals"],
        ["staff", "inventory"],
      ]);
    });

    it("propagates a refused decision without invalidating queries as if it succeeded", async () => {
      const error = new Error("WRONG_APPROVAL_STATE");
      api.decide.mutate.mockRejectedValue(error);
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const { result } = renderHook(useDecideApproval, { wrapper });
      await act(async () => {
        await expect(
          result.current.mutateAsync({ reservationKey: 29, decision: "approve" })
        ).rejects.toBe(error);
      });
      expect(invalidate).not.toHaveBeenCalled();
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
