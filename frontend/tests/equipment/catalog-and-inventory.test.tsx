import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../src/i18n";
import CatalogPage from "../../src/features/borrower/catalog/catalog-page";
import StaffInventoryPage from "../../src/features/staff/inventory/inventory-page";
import { useRequestDraft } from "../../src/features/borrower/request/request-draft.store";
import * as catalogHooks from "../../src/features/borrower/catalog/use-equipment-types";
import * as inventoryHooks from "../../src/features/staff/inventory/use-inventory";
import * as itemImageHooks from "../../src/features/staff/inventory/use-item-image";
import { CATALOG_ITEMS, MANAGED_ITEM_RESPONSES } from "../fixtures/catalog-items";
import { itemTypeDetail, itemUnitOutput } from "../../../backend/src/item/item.schema";
import type {
  ManagedItemDetail,
  ManagedItemType,
  ManagedUnit,
} from "../../src/features/staff/inventory/inventory.types";
import { getErrorMessage } from "../../src/lib/error-messages";
import { itemResponse } from "../fixtures/api-responses";
import { queryResult } from "../fixtures/query-results";
import { toCatalogItem } from "../../src/features/borrower/catalog/item.adapter";

vi.mock("../../src/features/borrower/catalog/use-equipment-types", () => ({
  useEquipmentTypes: vi.fn(),
}));

vi.mock("../../src/features/staff/inventory/use-inventory", () => ({
  useManagedItems: vi.fn(),
  useManagedItem: vi.fn(),
  useManagedRooms: vi.fn(),
  useSetUnitLendable: vi.fn(),
  useSetUnitCondition: vi.fn(),
  useUpdateItemType: vi.fn(),
  useDeleteItemType: vi.fn(),
  useCreateItemType: vi.fn(),
  useCreateItemUnits: vi.fn(),
  useUpdateUnit: vi.fn(),
  useDeleteUnit: vi.fn(),
  useRequestRetirement: vi.fn(),
  useCreateRoom: vi.fn(),
  useUpdateRoom: vi.fn(),
  useDeleteRoom: vi.fn(),
  useTierOptions: vi.fn(),
  useManagementGroupOptions: vi.fn(),
}));

// The expanded type card carries a photo control. Both of its hooks reach for
// a tRPC client, which these cases do not stand up.
vi.mock("../../src/features/staff/inventory/use-item-image", () => ({
  useUploadImage: vi.fn(),
}));

const CATALOG = CATALOG_ITEMS.slice(0, 2);
const [AVAILABLE_ITEM, FILTER_ITEM] = CATALOG;

const MANAGED_ITEMS: ManagedItemType[] = MANAGED_ITEM_RESPONSES.slice(0, 2);
const MANAGED_AVAILABLE_ITEM = MANAGED_ITEMS[0];
const MANAGED_FILTER_ITEM = MANAGED_ITEMS[1];

const UNIT: ManagedUnit = itemUnitOutput.strict().parse({
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
});

const DETAIL: ManagedItemDetail = itemTypeDetail
  .strict()
  .parse({ ...MANAGED_ITEMS[0], units: [UNIT] });

describe("Module 5 borrower catalogue", () => {
  beforeEach(() => {
    i18n.changeLanguage("en");
    useRequestDraft.getState().clear();
    vi.clearAllMocks();
    vi.mocked(catalogHooks.useEquipmentTypes).mockReturnValue({
      data: CATALOG,
      isLoading: false,
    } as never);
  });

  it.fails("does not change popularity order when only inventory totals change", () => {
    // item.list has no borrowingCount field. Exercise an invariant with real
    // API-shaped items instead of inventing a popularity field on the fixture.
    const items = (alphaUnits: number, betaUnits: number) => [
      toCatalogItem(itemResponse({ id: 801, name: "Alpha", totalUnits: alphaUnits, availableUnits: 1 })),
      toCatalogItem(itemResponse({ id: 802, name: "Beta", totalUnits: betaUnits, availableUnits: 1 })),
    ];
    vi.mocked(catalogHooks.useEquipmentTypes).mockReturnValue(queryResult(items(12, 1)));
    const view = render(<MemoryRouter><CatalogPage /></MemoryRouter>);
    fireEvent.click(screen.getAllByRole("combobox", { name: i18n.t("borrower.catalog.sortLabel") })[0]);
    fireEvent.click(screen.getByRole("option", { name: "Most popular" }));
    const order = () => within(screen.getByRole("table")).getAllByRole("row").slice(1)
      .map((row) => ["Alpha", "Beta"].find((name) => within(row).queryByText(name)));
    const before = order();
    vi.mocked(catalogHooks.useEquipmentTypes).mockReturnValue(queryResult(items(1, 12)));
    view.rerender(<MemoryRouter><CatalogPage /></MemoryRouter>);
    expect(order()).toEqual(before);
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
    expect(screen.getAllByText(FILTER_ITEM.name).length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByRole("searchbox")[0], {
      target: { value: AVAILABLE_ITEM.name },
    });

    expect(screen.getAllByText(AVAILABLE_ITEM.name).length).toBeGreaterThan(0);
    expect(screen.queryByText(FILTER_ITEM.name)).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    expect(useRequestDraft.getState().lines).toEqual([
      { itemId: AVAILABLE_ITEM.id, qty: 1, serials: [] },
    ]);
  });

  it("closes the Add button on something the borrower may not borrow, and hides it from available-only", () => {
    // The server used to list a type with no rules as available, and every
    // request for it came back NOT_ELIGIBLE.
    const closed = {
      ...AVAILABLE_ITEM,
      id: "closed-1",
      name: "Closed to this borrower",
      eligible: false,
    };
    vi.mocked(catalogHooks.useEquipmentTypes).mockReturnValue({
      data: [closed, AVAILABLE_ITEM],
      isLoading: false,
    } as never);
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
    vi.mocked(catalogHooks.useEquipmentTypes).mockReturnValue({
      data: [],
      isLoading: false,
    } as never);
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
    vi.mocked(catalogHooks.useEquipmentTypes).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as never);
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );

    expect(screen.queryByText(AVAILABLE_ITEM.name)).not.toBeInTheDocument();
  });
});

describe("Module 5 staff inventory", () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    i18n.changeLanguage("en");
    vi.clearAllMocks();
    vi.mocked(inventoryHooks.useManagedItems).mockReturnValue({
      data: MANAGED_ITEMS,
      isLoading: false,
    } as never);
    vi.mocked(inventoryHooks.useManagedItem).mockReturnValue({
      data: DETAIL,
      isLoading: false,
    } as never);
    // The rooms section sits below the type list and always queries, even
    // when this suite never opens it.
    vi.mocked(inventoryHooks.useManagedRooms).mockReturnValue({
      data: [],
      isLoading: false,
    } as never);
    vi.mocked(inventoryHooks.useUpdateItemType).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(itemImageHooks.useUploadImage).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(inventoryHooks.useSetUnitLendable).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never);
    // Delete sits in the unit row's default action bar, so it renders
    // whenever a type card is opened - even in cases that never click it.
    vi.mocked(inventoryHooks.useDeleteUnit).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);
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

    // Two search boxes on this page now (types, then rooms below) - the first is types.
    fireEvent.change(screen.getAllByRole("searchbox")[0], {
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
