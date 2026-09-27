import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { borrowerHistoryOutput } from "../../../backend/src/approval/approval.schema";
import { useBorrowerHistory } from "../../src/features/supervisor/approvals/use-approvals";

const query = vi.hoisted(() =>
  vi.fn<
    (input: {
      accountKey: number;
    }) => Promise<ReturnType<typeof borrowerHistoryOutput.parse>>
  >()
);
vi.mock("../../src/lib/trpc", () => ({
  useTRPCClient: () => ({ approval: { borrowerHistory: { query } } }),
}));

const clients: QueryClient[] = [];
function wrapper({ children }: PropsWithChildren) {
  const client = clients[clients.length - 1];
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  query.mockReset();
  clients.push(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
});
afterEach(() => {
  clients.pop()?.clear();
});

describe("borrower history query isolation", () => {
  it("does not request history before a borrower is selected", () => {
    const { result } = renderHook(() => useBorrowerHistory(undefined), { wrapper });
    expect(query).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches a new borrower and reuses only that borrower's cached history", async () => {
    const empty = borrowerHistoryOutput
      .strict()
      .parse({
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
