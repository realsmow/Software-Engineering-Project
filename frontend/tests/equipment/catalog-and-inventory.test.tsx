import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../src/i18n";
import CatalogPage from "../../src/features/borrower/catalog/catalog-page";
import StaffInventoryPage from "../../src/features/staff/inventory/inventory-page";
import { useRequestDraft } from "../../src/features/borrower/request/request-draft.store";
import * as catalogHooks from "../../src/features/borrower/catalog/use-equipment-types";
import * as inventoryHooks from "../../src/features/staff/inventory/use-inventory";
import type { CatalogItem } from "../../src/features/borrower/mock-data";
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
}));

const CATALOG: CatalogItem[] = [
  {
    id: "7",
    name: "Oscilloscope",
    categoryId: "",
    tier: "T2",
    code: "",
    departmentId: "ee",
    stockStatus: "ok",
    creditWeight: 10,
    prepDays: 2,
    totalUnits: 2,
    availableUnits: 1,
    allowBorrow: true,
  },
  {
    id: "8",
    name: "Signal generator",
    categoryId: "",
    tier: "T1",
    code: "",
    departmentId: "ee",
    stockStatus: "queue",
    creditWeight: 5,
    prepDays: 1,
    totalUnits: 3,
    availableUnits: 0,
    nextAvailableAt: "2026-09-20T00:00:00.000Z",
    allowBorrow: true,
  },
];

const UNIT: ManagedUnit = {
  resourceKey: 501,
  indivKey: 101,
  itemKey: 7,
  serialNo: "OSC-001",
  imageUrl: null,
  tier: "T2",
  status: "InStorage",
  lendable: true,
  prepDays: 2,
  condition: null,
  conditionNote: null,
  conditionLoggedAt: null,
  managementGroup: { manageGroupKey: 8, name: "Engineering", type: "Faculty" },
  currentDueAt: null,
};

const MANAGED_ITEMS: ManagedItemType[] = [
  {
    id: 7,
    name: "Oscilloscope",
    description: "Four-channel scope",
    imageUrl: null,
    creditWeight: 10,
    tiers: ["T2"],
    totalUnits: 2,
    availableUnits: 1,
  },
  {
    id: 8,
    name: "Signal generator",
    description: null,
    imageUrl: null,
    creditWeight: 5,
    tiers: ["T1"],
    totalUnits: 3,
    availableUnits: 0,
  },
];

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

    expect(screen.getAllByText("Oscilloscope").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Signal generator").length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByRole("searchbox")[0], {
      target: { value: "oscillo" },
    });

    expect(screen.getAllByText("Oscilloscope").length).toBeGreaterThan(0);
    expect(screen.queryByText("Signal generator")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    expect(useRequestDraft.getState().lines).toEqual([
      { itemId: "7", qty: 1, serials: [] },
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

    expect(screen.queryByText("Oscilloscope")).not.toBeInTheDocument();
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
    vi.mocked(inventoryHooks.useSetUnitLendable).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never);
  });

  it("renders type/unit/available totals and filters inventory by name", () => {
    render(<StaffInventoryPage />);

    expect(screen.getByText("Item types")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "signal" } });
    expect(screen.getByText("Signal generator")).toBeInTheDocument();
    expect(screen.queryByText("Oscilloscope")).not.toBeInTheDocument();
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
