import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFinalizePickup } from "../../src/features/borrower/pickup/use-pickup-image-upload";
import { useCancelCart } from "../../src/features/borrower/loans/use-my-requests-api";
import { useDecideCart } from "../../src/features/supervisor/approvals/use-approvals";

const api = vi.hoisted(() => vi.fn<(path: string, input?: unknown) => unknown>());
vi.mock("../../src/lib/trpc", () => {
  const client = new Proxy(
    {},
    {
      get: (_, domain: string) =>
        new Proxy(
          {},
          {
            get: (_, procedure: string) => {
              // A returned Error is thrown here, so the refusal travels the
              // client's promise like a real server error does.
              const call = (input?: unknown) =>
                Promise.resolve().then(() => {
                  const out = api(`${domain}.${procedure}`, input);
                  if (out instanceof Error) throw out;
                  return out;
                });
              return { query: call, mutate: call };
            },
          }
        ),
    }
  );
  return { useTRPCClient: () => client };
});

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidate };
}

// #236 step 2 (instructor item 1, team decision D-01): a whole-cart action is
// one call - every line or none - and the page reloads whether it worked or not.
describe("whole-cart calls from the borrower and supervisor pages", () => {
  beforeEach(() => api.mockReset());

  it("confirms the pickup of several units in one call", async () => {
    api.mockImplementation(() => []);
    const { wrapper } = setup();
    const { result } = renderHook(() => useFinalizePickup(), { wrapper });
    await result.current.mutateAsync([41, 42]);
    expect(api).toHaveBeenCalledWith("loan.confirmMyPickupCart", { usageKeys: [41, 42] });
    expect(api).not.toHaveBeenCalledWith("loan.confirmMyPickup", expect.anything());
  });

  it("confirms a single unit the way it always has", async () => {
    api.mockImplementation(() => ({}));
    const { wrapper } = setup();
    const { result } = renderHook(() => useFinalizePickup(), { wrapper });
    await result.current.mutateAsync([42]);
    expect(api).toHaveBeenCalledWith("loan.confirmMyPickup", { usageKey: 42 });
  });

  it("reloads the borrower's requests when the server refuses the pickup", async () => {
    api.mockImplementation(() => new Error("No photo yet"));
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useFinalizePickup(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync([41, 42])).rejects.toThrow("No photo yet");
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["loan", "my-requests"] });
  });

  it("cancels several lines of a cart in one call and reloads even when refused", async () => {
    api.mockImplementation(() => new Error("Already collected"));
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useCancelCart(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ reservationKeys: [41, 42] })).rejects.toThrow();
    });
    expect(api).toHaveBeenCalledWith("loan.cancelCart", { reservationKeys: [41, 42] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["loan", "my-requests"] });
  });

  it("reloads the approval queue when a whole-cart decision is refused", async () => {
    api.mockImplementation(() => new Error("Unit taken"));
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useDecideCart(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ cartKey: 3, decision: "approve" })).rejects.toThrow();
    });
    expect(invalidate).toHaveBeenCalled();
  });
});
