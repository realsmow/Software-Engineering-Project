import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  remainingUnits,
  useRequestDraft,
} from "../../src/features/borrower/request/request-draft.store";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
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

// Real service/adapter assertions share this module's suite; setup is scoped.
describe("Request draft stock, serials and date retention", () => {
  const state = () => useRequestDraft.getState();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-09-26T18:00:00Z"));
    state().clear();
  });

  afterEach(() => vi.useRealTimers());

  describe("FR-BRW-03/04: request draft quantities and serial selection", () => {
    it("does not add a type with no available units", () => {
      state().addItem("type-a", 0);
      expect(state().lines).toEqual([]);
    });

    it("combines repeated additions and stops at available stock", () => {
      for (let n = 0; n < 4; n++) state().addItem("type-a", 2);
      expect(state().lines).toEqual([{ itemId: "type-a", qty: 2, serials: [] }]);
      expect(remainingUnits(state().lines, { id: "type-a", availableUnits: 2 })).toBe(0);
    });

    it("never shows negative remaining stock when availability decreases", () => {
      state().replaceLines([{ itemId: "type-a", qty: 3, serials: [] }]);
      expect(remainingUnits(state().lines, { id: "type-a", availableUnits: 1 })).toBe(0);
      expect(remainingUnits(state().lines, { id: "type-b", availableUnits: 4 })).toBe(4);
    });

    it("selects at most one serial per requested unit and lets a full selection be unchecked", () => {
      state().replaceLines([{ itemId: "type-a", qty: 2, serials: [] }]);
      for (const serial of ["A1", "A2", "A3"]) state().toggleSerial("type-a", serial);
      expect(state().lines[0].serials).toEqual(["A1", "A2"]);
      state().toggleSerial("type-a", "A1");
      state().toggleSerial("type-a", "A3");
      expect(state().lines[0].serials).toEqual(["A2", "A3"]);
      state().toggleSerial("type-a", "A3");
      expect(state().lines[0].serials).toEqual(["A2"]);
    });

    it("removes excess serial choices when quantity is reduced", () => {
      state().replaceLines([{ itemId: "type-a", qty: 3, serials: ["A1", "A2", "A3"] }]);
      state().setQty("type-a", 1, 3);
      expect(state().lines[0]).toEqual({ itemId: "type-a", qty: 1, serials: ["A1"] });
    });

    it.each([
      [0, 3, 1],
      [9, 3, 3],
    ])("bounds quantity %s by stock %s to %s", (qty, stock, expected) => {
      state().addItem("type-a", stock);
      state().setQty("type-a", qty, stock);
      expect(state().lines[0].qty).toBe(expected);
    });

    it("keeps another type's quantity and serials unchanged", () => {
      const other = { itemId: "type-b", qty: 2, serials: ["B1"] };
      state().replaceLines([{ itemId: "type-a", qty: 2, serials: [] }, other]);
      state().toggleSerial("type-a", "A1");
      state().setQty("type-a", 1, 2);
      expect(state().lines[1]).toEqual(other);
      state().removeItem("type-a");
      expect(state().lines).toEqual([other]);
    });

    it("retains only refused lines after a partial submission without changing the requested dates", () => {
      state().addItem("accepted", 2);
      state().addItem("refused", 2);
      state().setStartDate("2031-10-01");
      state().setEndDate("2031-10-03");
      state().setPickupTime("13:00");
      state().setReturnTime("08:00");
      const refused = state().lines.filter((line) => line.itemId === "refused");
      state().replaceLines(refused);
      expect(state()).toMatchObject({
        lines: refused,
        startDate: "2031-10-01",
        endDate: "2031-10-03",
        pickupTime: "13:00",
        returnTime: "08:00",
      });
    });

    it("clears selections and resets dates to the business day in Bangkok", () => {
      state().addItem("type-a", 2);
      state().setEndDate(null);
      state().setPickupTime("16:00");
      state().setReturnTime("13:00");
      state().clear();
      expect(state()).toMatchObject({
        lines: [],
        startDate: "2031-09-27",
        endDate: "2031-09-27",
        pickupTime: "08:00",
        returnTime: "16:00",
      });
    });
  });
});
