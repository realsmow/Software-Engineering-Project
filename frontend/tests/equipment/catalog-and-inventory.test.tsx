import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../src/i18n";
import CatalogPage from "../../src/features/borrower/catalog/catalog-page";
import StaffInventoryPage from "../../src/features/staff/inventory/inventory-page";
import { useRequestDraft } from "../../src/features/borrower/request/request-draft.store";
import * as catalogHooks from "../../src/features/borrower/catalog/use-equipment-types";
import * as inventoryHooks from "../../src/features/staff/inventory/use-inventory";
import * as itemImageHooks from "../../src/features/staff/inventory/use-item-image";
import { CATALOG_ITEMS } from "../../src/features/borrower/mock-data";
import { toCatalogItem } from "../../src/features/borrower/catalog/item.adapter";
import { itemResponse, unitResponse } from "../fixtures/api-responses";
import {
  loadingQueryResult,
  mutationResult,
  queryResult,
} from "../fixtures/query-results";
import { itemTypeDetail, itemTypeSummary } from "../../../backend/src/item/item.schema";
import type {
  ManagedItemDetail,
  ManagedItemType,
  ManagedUnit,
} from "../../src/features/staff/inventory/inventory.types";
import { getErrorMessage } from "../../src/lib/error-messages";

vi.mock("../../src/features/borrower/catalog/use-equipment-types", () => ({
  useEquipmentTypes: vi.fn(),
}));

const catalogApi = vi.hoisted(() => ({ list: vi.fn(), units: vi.fn() }));
vi.mock("../../src/lib/trpc", () => ({
  useTRPCClient: () => ({
    item: { list: { query: catalogApi.list }, listUnits: { query: catalogApi.units } },
  }),
}));

vi.mock("../../src/features/staff/inventory/use-inventory", () => ({
  useManagedItems: vi.fn(),
  useManagedItem: vi.fn(),
  useSetUnitLendable: vi.fn(),
  useUpdateItemType: vi.fn(),
}));

// The expanded type card carries a photo control. Both of its hooks reach for
// a tRPC client, which these cases do not stand up.
vi.mock("../../src/features/staff/inventory/use-item-image", () => ({
  useUploadImage: vi.fn(),
}));

const CATALOG = [
  itemResponse({
    id: 11,
    name: CATALOG_ITEMS[0].name,
    totalUnits: 14,
    availableUnits: 12,
  }),
  itemResponse({ id: 12, name: CATALOG_ITEMS[1].name, totalUnits: 5, availableUnits: 2 }),
].map(toCatalogItem);
const [AVAILABLE_ITEM, QUEUED_ITEM] = CATALOG;

const MANAGED_ITEMS: ManagedItemType[] = CATALOG_ITEMS.slice(0, 2).map((item, index) =>
  itemTypeSummary.strict().parse({
    id: 7 + index,
    name: item.name,
    description: item.description ?? null,
    imageUrl: null,
    creditWeight: item.creditWeight,
    tiers: item.tier ? [item.tier] : [],
    totalUnits: item.totalUnits,
    availableUnits: item.availableUnits,
  })
);
const MANAGED_AVAILABLE_ITEM = MANAGED_ITEMS[0];
const MANAGED_FILTER_ITEM = MANAGED_ITEMS[1];

const UNIT: ManagedUnit = {
  resourceKey: 501,
  indivKey: 101,
  itemKey: MANAGED_ITEMS[0].id,
  serialNo: "OSC-001",
  imageUrl: null,
  tier: MANAGED_ITEMS[0].tiers[0] ?? null,
  status: "InStorage",
  lendable: true,
  prepDays: CATALOG[0].prepDays,
  condition: null,
  conditionNote: null,
  conditionLoggedAt: null,
  managementGroup: { id: 8, name: "Engineering", type: "Faculty" },
  currentDueAt: null,
};

const DETAIL: ManagedItemDetail = itemTypeDetail.parse({
  ...MANAGED_ITEMS[0],
  totalUnits: 1,
  availableUnits: 1,
  units: [UNIT],
});

describe("Module 5 borrower catalogue", () => {
  beforeEach(() => {
    i18n.changeLanguage("en");
    useRequestDraft.getState().clear();
    vi.clearAllMocks();
    vi.mocked(catalogHooks.useEquipmentTypes).mockReturnValue(queryResult(CATALOG));
  });

  it("renders API-backed equipment, filters by search, and adds only the selected item", () => {
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    expect(catalogHooks.useEquipmentTypes).toHaveBeenCalledWith({
      startTime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      endTime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(screen.getAllByText(AVAILABLE_ITEM.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText(QUEUED_ITEM.name).length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByRole("searchbox")[0], {
      target: { value: AVAILABLE_ITEM.name },
    });

    expect(screen.getAllByText(AVAILABLE_ITEM.name).length).toBeGreaterThan(0);
    expect(screen.queryByText(QUEUED_ITEM.name)).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    expect(useRequestDraft.getState().lines).toEqual([
      { itemId: AVAILABLE_ITEM.id, qty: 1, serials: [] },
    ]);
  });

  it("filters API-backed equipment by name without moving focus from the search field", () => {
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    const search = screen.getAllByRole("searchbox")[0];
    search.focus();
    fireEvent.change(search, { target: { value: AVAILABLE_ITEM.name } });

    expect(search).toHaveFocus();
    expect(screen.getAllByText(AVAILABLE_ITEM.name).length).toBeGreaterThan(0);
    expect(screen.queryByText(QUEUED_ITEM.name)).not.toBeInTheDocument();
  });

  describe("popularity must be independent of inventory", () => {
    let firstRowAfterInventoryChange: HTMLElement;

    beforeEach(() => {
      const summaries = [
        itemResponse({ id: 11, name: "First item", totalUnits: 2, availableUnits: 1 }),
        itemResponse({ id: 12, name: "Second item", totalUnits: 2, availableUnits: 1 }),
      ];
      vi.mocked(catalogHooks.useEquipmentTypes).mockReturnValue(
        queryResult(summaries.map(toCatalogItem))
      );
      const page = () => (
        <MemoryRouter>
          <CatalogPage />
        </MemoryRouter>
      );
      const { rerender } = render(page());
      fireEvent.click(
        screen.getAllByRole("combobox", { name: i18n.t("borrower.catalog.sortLabel") })[0]
      );
      fireEvent.click(screen.getByRole("option", { name: "Most popular" }));
      expect(within(screen.getByRole("table")).getAllByRole("row")[1]).toHaveTextContent(
        "First item"
      );

      // Only inventory changes. No borrowing metric is invented or changed.
      summaries[1] = itemResponse({ ...summaries[1], totalUnits: 12 });
      vi.mocked(catalogHooks.useEquipmentTypes).mockReturnValue(
        queryResult(summaries.map(toCatalogItem))
      );
      rerender(page());
      firstRowAfterInventoryChange = within(screen.getByRole("table")).getAllByRole(
        "row"
      )[1];
    });

    it.fails("does not change popular ranking when only totalUnits changes", () => {
      expect(firstRowAfterInventoryChange).toHaveTextContent("First item");
    });
  });

  describe("asset-tag search through the real catalog hook and adapter", () => {
    let client: QueryClient;

    beforeEach(async () => {
      const actual = await vi.importActual<typeof catalogHooks>(
        "../../src/features/borrower/catalog/use-equipment-types"
      );
      vi.mocked(catalogHooks.useEquipmentTypes).mockImplementation(
        actual.useEquipmentTypes
      );
      catalogApi.list.mockResolvedValue({
        items: [itemResponse()],
        total: 1,
        page: 1,
        pageSize: 100,
      });
      const unit = unitResponse({ assetTag: "EE-MM-001" });
      catalogApi.units.mockResolvedValue([unit]);
      client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <CatalogPage />
          </MemoryRouter>
        </QueryClientProvider>
      );
      await screen.findAllByText("Multimeter");
      expect(catalogApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 100 })
      );
      fireEvent.change(screen.getAllByRole("searchbox")[0], {
        target: { value: unit.assetTag },
      });
    });

    afterEach(() => client?.clear());

    it.fails("finds the API item by an asset tag supplied only by listUnits", () => {
      expect(screen.queryAllByText("Multimeter").length).toBeGreaterThan(0);
    });
  });
  it("queries availability for the selected dates and lets a borrower decrease quantity", () => {
    const { container } = render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );
    const [pickup, returnDate] =
      container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    fireEvent.change(pickup, { target: { value: future } });
    fireEvent.change(returnDate, { target: { value: future } });
    expect(catalogHooks.useEquipmentTypes).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startTime: expect.stringContaining(future),
        endTime: expect.stringContaining(future),
      })
    );

    const row = screen
      .getAllByRole("row")
      .find((candidate) => within(candidate).queryByText(AVAILABLE_ITEM.name))!;
    fireEvent.click(within(row).getByRole("button", { name: "Add" }));
    fireEvent.click(within(row).getByRole("button", { name: /Selected/i }));
    expect(useRequestDraft.getState().lines[0]?.qty).toBe(2);
    fireEvent.click(
      within(row).getByRole("button", { name: i18n.t("borrower.request.decrease") })
    );
    expect(useRequestDraft.getState().lines[0]?.qty).toBe(1);
    fireEvent.click(
      within(row).getByRole("button", { name: i18n.t("borrower.request.decrease") })
    );
    expect(useRequestDraft.getState().lines).toEqual([]);
  });

  it("closes the Add button on something the borrower may not borrow, and hides it from available-only", () => {
    // The server used to list a type with no rules as available, and every
    // request for it came back NOT_ELIGIBLE.
    const closed = toCatalogItem(
      itemResponse({
        id: 13,
        name: "Closed to this borrower",
        eligible: false,
      })
    );
    vi.mocked(catalogHooks.useEquipmentTypes).mockReturnValue(
      queryResult([closed, AVAILABLE_ITEM])
    );
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    // Available-only is on by default, and "available" means available to them.
    expect(screen.queryByText(closed.name)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getAllByLabelText(i18n.t("borrower.catalog.availableOnly"))[0]
    );
    expect(screen.getAllByText(closed.name).length).toBeGreaterThan(0);

    const blocked = screen.getAllByRole("button", {
      name: i18n.t("borrower.catalog.notEligible"),
    });
    expect(blocked.length).toBeGreaterThan(0);
    blocked.forEach((button) => expect(button).toBeDisabled());
    fireEvent.click(blocked[0]);
    expect(useRequestDraft.getState().lines).toEqual([]);
  });

  it("shows an empty state when an API result is loaded but no item matches", () => {
    vi.mocked(catalogHooks.useEquipmentTypes).mockReturnValue(queryResult([]));
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    expect(
      screen.getAllByText("No equipment matches these filters").length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Try removing a filter or searching for something else").length
    ).toBeGreaterThan(0);
  });

  it("does not render stale rows while the catalogue query is loading", () => {
    vi.mocked(catalogHooks.useEquipmentTypes).mockReturnValue(loadingQueryResult());
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    expect(screen.queryByText(AVAILABLE_ITEM.name)).not.toBeInTheDocument();
  });
});

describe("Module 5 staff inventory", () => {
  const mutateAsync =
    vi.fn<ReturnType<typeof inventoryHooks.useSetUnitLendable>["mutateAsync"]>();

  beforeEach(() => {
    i18n.changeLanguage("en");
    vi.clearAllMocks();
    vi.mocked(inventoryHooks.useManagedItems).mockReturnValue(queryResult(MANAGED_ITEMS));
    vi.mocked(inventoryHooks.useManagedItem).mockReturnValue(queryResult(DETAIL));
    vi.mocked(inventoryHooks.useUpdateItemType).mockReturnValue(
      mutationResult(
        vi.fn<ReturnType<typeof inventoryHooks.useUpdateItemType>["mutateAsync"]>()
      )
    );
    vi.mocked(itemImageHooks.useUploadImage).mockReturnValue(
      mutationResult(
        vi.fn<ReturnType<typeof itemImageHooks.useUploadImage>["mutateAsync"]>()
      )
    );
    vi.mocked(inventoryHooks.useSetUnitLendable).mockReturnValue(
      mutationResult(mutateAsync)
    );
  });

  it("renders type/unit/available totals and filters inventory by name", () => {
    render(<StaffInventoryPage />);

    expect(screen.getByText("Item types")).toBeInTheDocument();
    expect(screen.getByText(String(MANAGED_ITEMS.length))).toBeInTheDocument();
    expect(
      screen.getByText(
        String(MANAGED_ITEMS.reduce((total, item) => total + item.totalUnits, 0))
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        String(MANAGED_ITEMS.reduce((total, item) => total + item.availableUnits, 0))
      )
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: MANAGED_FILTER_ITEM.name ?? "" },
    });
    expect(screen.getByText(MANAGED_FILTER_ITEM.name ?? "")).toBeInTheDocument();
    expect(screen.queryByText(MANAGED_AVAILABLE_ITEM.name ?? "")).not.toBeInTheDocument();
  });

  it("loads unit detail on expand and sends a withdrawal reason", async () => {
    mutateAsync.mockResolvedValue(UNIT);
    render(<StaffInventoryPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /view units/i })[0]);
    expect(screen.getByText("OSC-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    fireEvent.change(screen.getByPlaceholderText("Reason (optional)"), {
      target: { value: "Awaiting calibration" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        resourceKey: 501,
        lendable: false,
        reason: "Awaiting calibration",
      });
    });
  });

  it("keeps the maintenance control usable and shows the typed failure message", async () => {
    mutateAsync.mockRejectedValue({ data: { code: "RESOURCE_IN_USE" } });
    render(<StaffInventoryPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /view units/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(
        screen.getByText(getErrorMessage({ data: { code: "RESOURCE_IN_USE" } }))
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });
});
