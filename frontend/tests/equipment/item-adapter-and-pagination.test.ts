import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type PropsWithChildren } from "react";
import { afterEach, beforeEach, vi, describe, expect, it } from "vitest";
import { itemDetail } from "../../../backend/src/item/item.schema";
import {
  useEquipmentTypes,
  useEquipmentType,
  useEquipmentUnits,
  useCatalogSearch,
} from "../../src/features/borrower/catalog/use-equipment-types";
import { fetchAllPages } from "../../src/lib/paging";
import {
  toCatalogItem,
  toCatalogItemDetail,
  toUnitRow,
} from "../../src/features/borrower/catalog/item.adapter";
import { CATALOG_ITEM_RESPONSES } from "../fixtures/catalog-items";
import { itemResponse, unitResponse } from "../fixtures/api-responses";

const api = vi.hoisted(() => ({
  list: { query: vi.fn() },
  getById: { query: vi.fn() },
  listUnits: { query: vi.fn() },
}));

vi.mock("../../src/lib/trpc", () => ({ useTRPCClient: () => ({ item: api }) }));

const sourceItem = CATALOG_ITEM_RESPONSES[1];
const serverItem = itemResponse({
  ...sourceItem,
  id: 7,
  imageUrl: "http://localhost:3000/media/item/scope.png",
  owner: { id: 8, name: "Engineering", type: "Faculty" as const },
});

describe("Module 5 catalogue adapters", () => {
  it("maps numeric API identifiers and owner metadata to the catalogue view model", () => {
    const adapted = toCatalogItem(serverItem);

    expect(adapted).toMatchObject({
      id: "7",
      name: sourceItem.name,
      categoryId: "",
      tier: "T2",
      availableUnits: sourceItem.availableUnits,
    });

    if ("owner" in adapted) {
      expect(adapted.owner).toEqual({
        id: "8",
        name: "Engineering",
        type: "Faculty",
      });
    } else {
      expect(adapted).toMatchObject({ departmentId: "Engineering" });
    }
  });

  it.each<[Partial<ReturnType<typeof unitResponse>>, string]>([
    [{ status: "InStorage", allowBorrow: true, condition: null }, "free"],
    [{ status: "Lended", allowBorrow: true, condition: null }, "out"],
    [{ status: "InStorage", allowBorrow: false, condition: "Normal" }, "fix"],
    [{ status: "InStorage", allowBorrow: true, condition: "Broken" }, "fix"],
    [{ status: "Missing", allowBorrow: true, condition: null }, "fix"],
  ])("maps server unit state %j to the borrower state %s", (input, state) => {
    expect(
      toUnitRow(
        unitResponse({
          id: 1,
          resourceKey: 501,
          assetTag: "OSC-001",
          imageUrl: null,
          dueAt: null,
          ...input,
        })
      )
    ).toMatchObject({ serial: "OSC-001", state });
  });

  it("maps all detail units, including unavailable ones, for the serial/condition table", () => {
    const detail = toCatalogItemDetail({
      ...serverItem,
      units: [
        {
          id: 1,
          resourceKey: 101,
          assetTag: "OSC-001",
          imageUrl: null,
          status: "InStorage",
          allowBorrow: true,
          condition: "Normal",
          dueAt: null,
          nextAvailableAt: null,
        },
        {
          id: 2,
          resourceKey: 102,
          assetTag: "OSC-002",
          imageUrl: null,
          status: "Lended",
          allowBorrow: true,
          condition: null,
          dueAt: "2026-09-20T00:00:00Z",
          nextAvailableAt: "2026-09-22T00:00:00Z",
        },
      ],
    });

    expect(detail.units).toEqual([
      { resourceKey: 101, serial: "OSC-001", state: "free", condition: "Normal" },
      {
        resourceKey: 102,
        serial: "OSC-002",
        state: "out",
        condition: null,
        nextAvailableAt: "2026-09-22T00:00:00Z",
      },
    ]);
  });

  it("treats an in-storage unit held by an active usage as unavailable", () => {
    expect(
      toUnitRow({
        id: 3,
        resourceKey: 103,
        assetTag: "OSC-003",
        imageUrl: null,
        status: "InStorage",
        allowBorrow: true,
        condition: "Normal",
        dueAt: "2026-09-20T00:00:00Z",
        nextAvailableAt: "2026-09-22T00:00:00Z",
      })
    ).toMatchObject({ state: "out", nextAvailableAt: "2026-09-22T00:00:00Z" });
  });

  it("uses window availability for T2 serials when the backend supplies it", () => {
    const base = {
      id: 4,
      resourceKey: 104,
      assetTag: "OSC-004",
      imageUrl: null,
      status: "Lended" as const,
      allowBorrow: true,
      condition: "Normal" as const,
      dueAt: "2026-09-22T00:00:00Z",
      nextAvailableAt: "2026-09-23T00:00:00Z",
    };

    expect(toUnitRow({ ...base, availableForWindow: true })).toMatchObject({
      state: "free",
    });
    expect(
      toUnitRow({
        ...base,
        status: "InStorage",
        dueAt: null,
        nextAvailableAt: null,
        availableForWindow: false,
      })
    ).toMatchObject({ state: "out" });
  });
});

describe("Module 5 catalogue pagination", () => {
  it("fetches the remaining pages concurrently and preserves page order", async () => {
    const calls: number[] = [];
    const result = await fetchAllPages(
      async (page) => {
        calls.push(page);
        return {
          items: page === 1 ? ["first"] : page === 2 ? ["second"] : ["third"],
          total: 3,
        };
      },
      { pageSize: 1 }
    );

    expect(result).toEqual(["first", "second", "third"]);
    expect(calls).toEqual(expect.arrayContaining([1, 2, 3]));
  });

  it("returns an empty catalogue without issuing speculative requests", async () => {
    const fetchPage = async () => ({ items: [] as string[], total: 0 });
    await expect(fetchAllPages(fetchPage)).resolves.toEqual([]);
  });

  it("honors the client-side maximum when the server reports a large result set", async () => {
    const result = await fetchAllPages(
      async (page) => ({
        items: Array.from({ length: 2 }, (_, i) => `${page}-${i}`),
        total: 10,
      }),
      { pageSize: 2, maxItems: 3 }
    );

    expect(result).toHaveLength(3);
    expect(result).toEqual(["1-0", "1-1", "2-0"]);
  });
});

// Real service/adapter assertions share this module's suite; setup is scoped.
describe("Catalog API hooks and cache by selected dates", () => {
  let client: QueryClient;

  function wrapper({ children }: PropsWithChildren) {
    return createElement(QueryClientProvider, { client }, children);
  }

  const window = {
    startTime: "2031-09-27T01:00:00.000Z",
    endTime: "2031-09-28T09:00:00.000Z",
  };

  beforeEach(() => {
    vi.resetAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => client.clear());

  describe("FR-BRW-01/02/04: selected-window catalog queries", () => {
    it("sends the same requested dates on every catalog page and retains the last page", async () => {
      api.list.query.mockImplementation(async ({ page, pageSize }) => ({
        items:
          page === 1
            ? Array.from({ length: 100 }, (_, n) => itemResponse({ id: n + 1 }))
            : [itemResponse({ id: 101, availableUnits: 0, stockStatus: "queue" })],
        total: 101,
        page,
        pageSize,
      }));
      const { result } = renderHook(() => useEquipmentTypes(window), { wrapper });
      await waitFor(() => expect(result.current.data).toHaveLength(101));
      expect(api.list.query.mock.calls).toEqual([
        [{ page: 1, pageSize: 100, ...window }],
        [{ page: 2, pageSize: 100, ...window }],
      ]);
      expect(result.current.data?.at(-1)).toMatchObject({ id: "101", availableUnits: 0 });
    });
    it("uses a new cache entry when requested dates change", async () => {
      const next = { ...window, endTime: "2031-09-29T09:00:00.000Z" };
      api.list.query.mockImplementation(async (input) => ({
        items: [
          itemResponse({ availableUnits: input.endTime === window.endTime ? 4 : 1 }),
        ],
        total: 1,
      }));
      const { result, rerender } = renderHook(({ dates }) => useEquipmentTypes(dates), {
        initialProps: { dates: window },
        wrapper,
      });
      await waitFor(() => expect(result.current.data?.[0].availableUnits).toBe(4));
      rerender({ dates: next });
      expect(result.current.data).toBeUndefined();
      await waitFor(() => expect(result.current.data?.[0].availableUnits).toBe(1));
      expect(api.list.query).toHaveBeenCalledTimes(2);
    });
    it("loads numeric item detail and its unit evidence for the selected dates", async () => {
      api.getById.query.mockResolvedValue(
        itemDetail.strict().parse({ ...itemResponse(), units: [unitResponse()] })
      );
      const { result } = renderHook(() => useEquipmentType("11", window), { wrapper });
      await waitFor(() => expect(result.current.data?.id).toBe("11"));
      expect(api.getById.query).toHaveBeenCalledWith({ id: 11, ...window });
      expect(result.current.data?.units[0]).toMatchObject({
        serial: "MM-001",
        resourceKey: 1,
      });
    });
    it.each(["bad-link", "0", "-1", "1.5"])(
      "does not send an invalid item ID %s to the API",
      async (id) => {
        const detail = renderHook(() => useEquipmentType(id), { wrapper });
        const units = renderHook(() => useEquipmentUnits(id), { wrapper });
        await waitFor(() => expect(detail.result.current.data).toBeNull());
        await waitFor(() => expect(units.result.current.data).toEqual([]));
        expect(api.getById.query).not.toHaveBeenCalled();
        expect(api.listUnits.query).not.toHaveBeenCalled();
      }
    );
    it("keeps detail and serial queries idle before an item is selected", () => {
      const detail = renderHook(() => useEquipmentType(undefined), { wrapper });
      const units = renderHook(() => useEquipmentUnits(undefined), { wrapper });
      expect(detail.result.current.fetchStatus).toBe("idle");
      expect(units.result.current.fetchStatus).toBe("idle");
      expect(api.getById.query).not.toHaveBeenCalled();
      expect(api.listUnits.query).not.toHaveBeenCalled();
    });
    it("forwards dates to the serial picker and displays a booked unit as unavailable", async () => {
      api.listUnits.query.mockResolvedValue([
        unitResponse({ availableForWindow: false }),
        unitResponse({
          id: 2,
          resourceKey: 2,
          assetTag: "MM-002",
          availableForWindow: true,
        }),
      ]);
      const { result } = renderHook(() => useEquipmentUnits("11", window), { wrapper });
      await waitFor(() => expect(result.current.data).toHaveLength(2));
      expect(api.listUnits.query).toHaveBeenCalledWith({ id: 11, ...window });
      expect(result.current.data?.map((unit) => [unit.serial, unit.state])).toEqual([
        ["MM-001", "out"],
        ["MM-002", "free"],
      ]);
    });
    it.each(["", " ", "A"])(
      "does not search for an empty or one-character term %s",
      (q) => {
        const { result } = renderHook(() => useCatalogSearch(q), { wrapper });
        expect(result.current.fetchStatus).toBe("idle");
        expect(api.list.query).not.toHaveBeenCalled();
      }
    );
    it("trims a search term and returns type IDs that matched the server's asset-tag search", async () => {
      api.list.query.mockResolvedValue({
        items: [itemResponse({ id: 11 }), itemResponse({ id: 12 })],
        total: 2,
      });
      const { result } = renderHook(() => useCatalogSearch("  MM-001  "), { wrapper });
      await waitFor(() => expect(result.current.data).toEqual(new Set(["11", "12"])));
      expect(api.list.query).toHaveBeenCalledWith({
        page: 1,
        pageSize: 100,
        q: "MM-001",
      });
    });
    it("surfaces a serial-loading failure instead of reporting every unit as free", async () => {
      const error = new Error("UNAUTHORIZED");
      api.listUnits.query.mockRejectedValue(error);
      const { result } = renderHook(() => useEquipmentUnits("11", window), { wrapper });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBe(error);
      expect(result.current.data).toBeUndefined();
    });
  });
});
