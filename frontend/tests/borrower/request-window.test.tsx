import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RequestPreparationError,
  useCreateEquipmentRequest,
} from "../../src/features/borrower/request/use-create-request";
import type { ServerItemUnit } from "../../src/features/borrower/catalog/item.adapter";
import { requestResponse, unitResponse } from "../fixtures/api-responses";
import { createRequestOutput } from "../../../backend/src/loan/loan.schema";

const api = vi.hoisted(() => ({ listUnits: vi.fn(), create: vi.fn() }));

vi.mock("../../src/lib/trpc", () => ({
  useTRPCClient: () => ({
    item: { listUnits: { query: api.listUnits } },
    loan: { create: { mutate: api.create } },
  }),
}));

function unit(resourceKey: number, availableForWindow: boolean): ServerItemUnit {
  return unitResponse({
    id: resourceKey,
    resourceKey,
    assetTag: `MM-${resourceKey}`,
    imageUrl: null,
    status: "InStorage",
    allowBorrow: true,
    condition: "Normal",
    dueAt: null,
    nextAvailableAt: null,
    availableForWindow,
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const request = {
  rows: [{ itemId: "11", name: "Multimeter", tier: "T1" as const, qty: 1, serials: [] }],
  startDate: "2026-09-28",
  pickupTime: "08:00" as const,
  endDate: "2026-09-29",
  returnTime: "16:00" as const,
};

describe("requested-window unit selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.create.mockResolvedValue(
      createRequestOutput.parse({
        created: [
          requestResponse({
            reservationKey: 1,
            resource: { ...requestResponse().resource, resourceKey: 2, serialNo: "MM-2" },
          }),
        ],
        rejected: [],
      })
    );
  });

  it("queries the requested period and selects an alternative unit free then", async () => {
    api.listUnits.mockResolvedValue([unit(1, false), unit(2, true)]);
    const { result } = renderHook(() => useCreateEquipmentRequest(), { wrapper });

    const response = await result.current.mutateAsync(request);

    expect(api.listUnits).toHaveBeenCalledWith({
      id: 11,
      startTime: expect.stringMatching(/^2026-09-28T/),
      endTime: expect.stringMatching(/^2026-09-29T/),
    });
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [{ resourceKey: 2 }],
      })
    );
    expect(response.selectedUnits[0].serial).toBe("MM-2");
  });

  it("does not send a request when no unit is free for the requested period", async () => {
    api.listUnits.mockResolvedValue([unit(1, false)]);
    const { result } = renderHook(() => useCreateEquipmentRequest(), { wrapper });

    await expect(result.current.mutateAsync(request)).rejects.toMatchObject({
      name: RequestPreparationError.name,
      reason: "UNITS_CHANGED",
      itemName: "Multimeter",
    });
    expect(api.create).not.toHaveBeenCalled();
  });
});
