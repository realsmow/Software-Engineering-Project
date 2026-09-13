import { describe, expect, it } from "vitest";
import { fetchAllPages } from "../../src/lib/paging";
import {
  toCatalogItem,
  toCatalogItemDetail,
  toUnitRow,
} from "../../src/features/borrower/catalog/item.adapter";

const serverItem = {
  id: 7,
  name: "Oscilloscope",
  description: "Four-channel scope",
  imageUrl: "/uploads/scope.png",
  tier: "T2" as const,
  creditWeight: 10,
  totalUnits: 3,
  availableUnits: 1,
  stockStatus: "ok" as const,
  nextAvailableAt: null,
  prepDays: 2,
  allowBorrow: true,
  owner: { id: 8, name: "Engineering", type: "Faculty" },
};

describe("Module 5 catalogue adapters", () => {
  it("maps numeric API identifiers and owner metadata to the catalogue view model", () => {
    expect(toCatalogItem(serverItem)).toMatchObject({
      id: "7",
      name: "Oscilloscope",
      departmentId: "Engineering",
      categoryId: "",
      tier: "T2",
      availableUnits: 1,
    });
  });

  it.each([
    [{ status: "InStorage", allowBorrow: true, condition: null }, "free"],
    [{ status: "Lended", allowBorrow: true, condition: null }, "out"],
    [{ status: "InStorage", allowBorrow: false, condition: "Normal" }, "fix"],
    [{ status: "InStorage", allowBorrow: true, condition: "Broken" }, "fix"],
    [{ status: "Missing", allowBorrow: true, condition: null }, "fix"],
  ])("maps server unit state %j to the borrower state %s", (input, state) => {
    expect(
      toUnitRow({
        id: 1,
        assetTag: "OSC-001",
        imageUrl: null,
        dueAt: null,
        ...input,
      } as never)
    ).toEqual({ serial: "OSC-001", state });
  });

  it("maps all detail units, including unavailable ones, for the serial/condition table", () => {
    const detail = toCatalogItemDetail({
      ...serverItem,
      units: [
        {
          id: 1,
          assetTag: "OSC-001",
          imageUrl: null,
          status: "InStorage",
          allowBorrow: true,
          condition: null,
          dueAt: null,
        },
        {
          id: 2,
          assetTag: "OSC-002",
          imageUrl: null,
          status: "Lended",
          allowBorrow: true,
          condition: null,
          dueAt: "2026-09-20T00:00:00Z",
        },
      ],
    });

    expect(detail.units).toEqual([
      { serial: "OSC-001", state: "free" },
      { serial: "OSC-002", state: "out" },
    ]);
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
