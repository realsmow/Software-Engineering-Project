import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../src/i18n";
import CatalogPage from "../../src/features/borrower/catalog/catalog-page";
import StaffInventoryPage from "../../src/features/staff/inventory/inventory-page";
import { useRequestDraft } from "../../src/features/borrower/request/request-draft.store";
import * as catalogHooks from "../../src/features/borrower/catalog/use-equipment-types";
import * as inventoryHooks from "../../src/features/staff/inventory/use-inventory";
import * as itemImageHooks from "../../src/features/staff/inventory/use-item-image";
import { CATALOG_ITEMS } from "../../src/features/borrower/mock-data";
import type {
  ManagedItemDetail,
  ManagedItemType,
  ManagedUnit,
} from "../../src/features/staff/inventory/inventory.types";
import { getErrorMessage } from "../../src/lib/error-messages";

vi.mock("../../src/features/borrower/catalog/use-equipment-types", () => ({
  useEquipmentTypes: vi.fn(),
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

const CATALOG = CATALOG_ITEMS.slice(0, 2);
const [AVAILABLE_ITEM, QUEUED_ITEM] = CATALOG;

const MANAGED_ITEMS: ManagedItemType[] = CATALOG_ITEMS.slice(0, 2).map((item, index) => ({
  id: 7 + index,
  name: item.name,
  description: item.description ?? null,
  imageUrl: null,
  creditWeight: item.creditWeight,
  tiers: item.tier ? [item.tier] : [],
  totalUnits: item.totalUnits,
  availableUnits: item.availableUnits,
}));
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

const DETAIL: ManagedItemDetail = { ...MANAGED_ITEMS[0], units: [UNIT] };

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
    vi.mocked(inventoryHooks.useUpdateItemType).mockReturnValue({
      mutateAsync: vi.fn(), isPending: false,
    } as never);
    vi.mocked(itemImageHooks.useUploadImage).mockReturnValue({
      mutateAsync: vi.fn(), isPending: false,
    } as never);
    vi.mocked(inventoryHooks.useSetUnitLendable).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never);
  });

  it("renders type/unit/available totals and filters inventory by name", () => {
    render(<StaffInventoryPage />);

    expect(screen.getByText("Item types")).toBeInTheDocument();
    expect(screen.getByText(String(MANAGED_ITEMS.length))).toBeInTheDocument();
    expect(screen.getByText(String(MANAGED_ITEMS.reduce((total, item) => total + item.totalUnits, 0)))).toBeInTheDocument();
    expect(screen.getByText(String(MANAGED_ITEMS.reduce((total, item) => total + item.availableUnits, 0)))).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: MANAGED_FILTER_ITEM.name ?? "" } });
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
