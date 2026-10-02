import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appealOutput } from "../../../backend/src/appeal/appeal.schema";
import {
  useAppeals,
  useDecideAppeal,
} from "../../src/features/supervisor/appeals/use-appeals";

const api = vi.hoisted(() => ({ list: { query: vi.fn() }, decide: { mutate: vi.fn() } }));
vi.mock("../../src/lib/trpc", () => ({ useTRPCClient: () => ({ appeal: api }) }));
let client: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const record = () =>
  appealOutput
    .strict()
    .parse({
      appealKey: 5,
      status: "pending",
      appealReason: "Old scratch",
      filedAt: "2031-09-26T00:00:00.000Z",
      resolvedAt: null,
      filedBy: {
        accountKey: 10,
        studentId: "S1",
        firstName: "QA",
        lastName: "Borrower",
        creditScore: 88,
      },
      resolvedBy: null,
      penalty: {
        penaltyKey: 7,
        usageKey: 8,
        reason: "DamagedItem",
        creditDeducted: 12,
        issuedAt: "2031-09-25T00:00:00.000Z",
        expiresAt: "2031-10-25T00:00:00.000Z",
        inEffect: true,
      },
      replacementPenalty: null,
      creditRestored: 0,
      inspectorKeys: [2],
      inspection: {
        grade: "B2",
        notes: "Scratched",
        inspectorName: "QA Staff",
        inspectedAt: "2031-09-25T00:00:00.000Z",
      },
      revisedGrade: null,
    });
beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => client.clear());

describe("FR-APL-03/05/06: appeal desk queries and decisions", () => {
  it("loads the selected status and keeps inspection evidence in the result", async () => {
    api.list.query.mockResolvedValue({ items: [record()], total: 1 });
    const { result } = renderHook(() => useAppeals("pending"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([record()]));
    expect(api.list.query).toHaveBeenCalledWith({
      page: 1,
      pageSize: 100,
      status: "pending",
    });
  });
  it("forwards a revised grade and invalidates every appeal status after success", async () => {
    const approved = appealOutput.parse({
      ...record(),
      status: "approved",
      creditRestored: 12,
      revisedGrade: "B0",
      resolvedAt: "2031-09-26T01:00:00.000Z",
    });
    api.decide.mutate.mockResolvedValue(approved);
    for (const status of ["pending", "approved", "rejected"])
      client.setQueryData(["appeals", "queue", status], []);
    const { result } = renderHook(useDecideAppeal, { wrapper });
    const input = {
      appealKey: 5,
      decision: "approve" as const,
      revisedGrade: "B0" as const,
      note: "Wear predates checkout",
    };
    await act(async () => {
      expect(await result.current.mutateAsync(input)).toEqual(approved);
    });
    expect(api.decide.mutate).toHaveBeenCalledWith(input);
    for (const status of ["pending", "approved", "rejected"])
      expect(client.getQueryState(["appeals", "queue", status])?.isInvalidated).toBe(
        true
      );
  });
  it("does not move an appeal between status lists after a refused review", async () => {
    const error = new Error("CANNOT_DECIDE_OWN_INSPECTION");
    api.decide.mutate.mockRejectedValue(error);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(useDecideAppeal, { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          appealKey: 5,
          decision: "approve",
          revisedGrade: "B0",
        })
      ).rejects.toBe(error);
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
