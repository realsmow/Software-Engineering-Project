import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  inspectionQueueRow,
  inspectionSubjectOutput,
} from "../../../backend/src/inspection/inspection.schema";
import { inspectionResponse } from "../fixtures/api-responses";
import {
  useInspectionQueue,
  useInspectionSubject,
  useCreateInspection,
} from "../../src/features/staff/inspection/use-inspection";

const api = vi.hoisted(() => ({
  list: { query: vi.fn() },
  getById: { query: vi.fn() },
  create: { mutate: vi.fn() },
}));
vi.mock("../../src/lib/trpc", () => ({ useTRPCClient: () => ({ inspection: api }) }));
let client: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const row = (usageKey: number) =>
  inspectionQueueRow
    .strict()
    .parse({
      usageKey,
      borrowerName: "QA Tester",
      borrowerStudentId: "S1",
      itemName: "Meter",
      serialNo: "M1",
      resourceKey: 7,
      tier: "T2",
      checkoutCondition: "Normal",
      returnedAt: "2031-09-26T03:00:00.000Z",
      overdueDays: 0,
      beforeImageCount: 0,
      afterImageCount: 0,
    });
beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => client.clear());

describe("FR-RTN-03/04: inspection queries and image submission", () => {
  it("loads inspection backlog across the server's page limit", async () => {
    api.list.query.mockImplementation(async ({ page, pageSize }) => ({
      items: page === 1 ? Array.from({ length: 100 }, (_, n) => row(n + 1)) : [row(101)],
      total: 101,
      page,
      pageSize,
    }));
    const { result } = renderHook(useInspectionQueue, { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(101));
    expect(api.list.query.mock.calls).toEqual([
      [{ page: 1, pageSize: 100 }],
      [{ page: 2, pageSize: 100 }],
    ]);
  });
  it("does not fetch a subject while no return has been selected", () => {
    const { result } = renderHook(() => useInspectionSubject(null), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.getById.query).not.toHaveBeenCalled();
  });
  it("fetches the selected loan and preserves its photo and condition evidence", async () => {
    const subject = inspectionSubjectOutput
      .strict()
      .parse({
        usageKey: 42,
        resourceKey: 7,
        itemName: "Meter",
        serialNo: "M1",
        tier: "T2",
        creditWeight: 1,
        borrowerAccountKey: 10,
        borrowerName: "QA Tester",
        borrowerStudentId: "S1",
        borrowerCreditScore: 100,
        checkoutCondition: "Normal",
        checkoutConditionNote: null,
        checkoutAt: "2031-09-25T03:00:00.000Z",
        dueAt: "2031-09-26T03:00:00.000Z",
        returnedAt: "2031-09-26T03:00:00.000Z",
        overdueDays: 0,
        beforeImages: [{ imageKey: 1, url: "/media/before.jpg", submittedAt: null }],
        afterImages: [],
        unitHistory: [],
        existingInspectionKey: null,
      });
    api.getById.query.mockResolvedValue(subject);
    const { result } = renderHook(() => useInspectionSubject(42), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(subject));
    expect(api.getById.query).toHaveBeenCalledWith({ usageKey: 42 });
  });
  it("forwards imageUrls and refreshes inspection, counter and equipment availability after success", async () => {
    const input = {
      usageKey: 42,
      level: "B2" as const,
      note: "Screen cracked",
      imageUrls: ["/media/inspection-1.jpg", "/media/inspection-2.jpg"],
    };
    api.create.mutate.mockResolvedValue(
      inspectionResponse({ level: "B2", condition: "MajorDamage" })
    );
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(useCreateInspection, { wrapper });
    await act(async () => {
      await result.current.mutateAsync(input);
    });
    expect(api.create.mutate).toHaveBeenCalledWith(input);
    expect(invalidate.mock.calls.map(([input]) => input?.queryKey)).toEqual([
      ["staff", "inspection"],
      ["staff", "queue"],
      ["equipment-types"],
    ]);
  });
  it("does not refresh availability as if grading succeeded when the server refuses it", async () => {
    const error = new Error("ALREADY_INSPECTED");
    api.create.mutate.mockRejectedValue(error);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(useCreateInspection, { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ usageKey: 42, level: "B0" })
      ).rejects.toBe(error);
    });
    expect(invalidate).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
