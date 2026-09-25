import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  useTRPCClient: () => ({
    loan: {
      cancel: { mutate: mocks.cancel },
    },
  }),
}));

import { useCancelRequest } from "@/features/borrower/loans/use-my-requests-api";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("Borrower request cancellation — Module 6.10", () => {  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cancel.mockResolvedValue({
      reservationKey: 101,
      status: "cancelled",
      cancellable: false,
    });
  });

  it("6.10 calls loan.cancel with the reservation key and reason", async () => {
    const { result } = renderHook(() => useCancelRequest(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        reservationKey: 101,
        reason: "เปลี่ยนแผนการใช้งาน",
      });
    });

    expect(mocks.cancel).toHaveBeenCalledTimes(1);    expect(mocks.cancel).toHaveBeenCalledWith({
      reservationKey: 101,
      reason: "เปลี่ยนแผนการใช้งาน",
    });
  });

  it("6.10 exposes server cancellation failure to the borrower flow", async () => {
    mocks.cancel.mockRejectedValueOnce(new Error("RESERVATION_NOT_FOUND"));
    const { result } = renderHook(() => useCancelRequest(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ reservationKey: 999 }),
      ).rejects.toThrow("RESERVATION_NOT_FOUND");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocks.cancel).toHaveBeenCalledWith({ reservationKey: 999 });
  });
});