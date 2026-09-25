import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import StaffInventoryPage from "../../src/features/staff/inventory/inventory-page";
import * as inventoryHooks from "../../src/features/staff/inventory/use-inventory";
import * as itemImageHooks from "../../src/features/staff/inventory/use-item-image";
import type { ManagedItemDetail, ManagedItemType, ManagedUnit } from "../../src/features/staff/inventory/inventory.types";
import { getErrorMessage } from "../../src/lib/error-messages";

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

vi.mock("../../src/features/staff/inventory/use-item-image", () => ({
  useUploadImage: vi.fn(),
}));

const MANAGED_ITEM: ManagedItemType = {
  id: 7,
  name: "ออสซิลโลสโคป",
  description: null,
  imageUrl: null,
  creditWeight: 5,
  tiers: ["T2"],
  totalUnits: 2,
  availableUnits: 1,
  price: null,
  suggestedTier: null,
};

const UNIT: ManagedUnit = {
  resourceKey: 501,
  indivKey: 101,
  itemKey: MANAGED_ITEM.id,
  serialNo: "OSC-001",
  imageUrl: null,
  tier: "T2",
  status: "InStorage",
  lendable: true,
  prepDays: 1,
  condition: null,
  conditionNote: null,
  conditionLoggedAt: null,
  managementGroup: { id: 8, name: "Engineering", type: "Faculty" },
  currentDueAt: null,
};

const DETAIL: ManagedItemDetail = { ...MANAGED_ITEM, units: [UNIT] };

const TIER_OPTIONS = [
  { borrowRuleKey: 1, tier: "T0" as const, name: null },
  { borrowRuleKey: 2, tier: "T1" as const, name: null },
  { borrowRuleKey: 3, tier: "T2" as const, name: null },
  { borrowRuleKey: 4, tier: "T3" as const, name: null },
];

const GROUPS = [{ id: 8, name: "Engineering", type: "Faculty" as const }];

/** Common inventory-page hook wiring every describe block below needs, since
 * the type list and its units render regardless of which dialog is under test. */
function mockBaseHooks() {
  vi.mocked(inventoryHooks.useManagedItems).mockReturnValue({ data: [MANAGED_ITEM], isLoading: false } as never);
  vi.mocked(inventoryHooks.useManagedItem).mockReturnValue({ data: DETAIL, isLoading: false } as never);
  vi.mocked(inventoryHooks.useManagedRooms).mockReturnValue({ data: [], isLoading: false } as never);
  vi.mocked(inventoryHooks.useUpdateItemType).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  vi.mocked(itemImageHooks.useUploadImage).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  vi.mocked(inventoryHooks.useSetUnitLendable).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  vi.mocked(inventoryHooks.useSetUnitCondition).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  vi.mocked(inventoryHooks.useUpdateUnit).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
}

describe("Staff inventory: new equipment type dialog", () => {
  const createType = vi.fn();

  beforeEach(() => {
    i18n.changeLanguage("en");
    vi.clearAllMocks();
    mockBaseHooks();
    vi.mocked(inventoryHooks.useCreateItemType).mockReturnValue({ mutateAsync: createType, isPending: false } as never);
  });

  it("shows the suggested tier once a price is entered, and submits it with the create call", async () => {
    createType.mockResolvedValue(DETAIL);
    render(<StaffInventoryPage />);

    fireEvent.click(screen.getByRole("button", { name: "New equipment type" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Digital oscilloscope"), {
      target: { value: "Function generator" },
    });

    expect(screen.queryByText(/Suggested tier from this price/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Optional"), { target: { value: "600" } });
    expect(screen.getByText("Suggested tier from this price: T1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(createType).toHaveBeenCalledWith({
        name: "Function generator",
        description: undefined,
        creditWeight: 0,
        price: 600,
      });
    });
  });
});

describe("Staff inventory: add units dialog", () => {
  const createUnits = vi.fn();

  beforeEach(() => {
    i18n.changeLanguage("en");
    vi.clearAllMocks();
    mockBaseHooks();
    vi.mocked(inventoryHooks.useDeleteUnit).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.mocked(inventoryHooks.useTierOptions).mockReturnValue({ data: TIER_OPTIONS, isLoading: false } as never);
    vi.mocked(inventoryHooks.useManagementGroupOptions).mockReturnValue({ data: GROUPS, isLoading: false } as never);
    vi.mocked(inventoryHooks.useCreateItemUnits).mockReturnValue({ mutateAsync: createUnits, isPending: false } as never);
  });

  function openAddUnits() {
    render(<StaffInventoryPage />);
    fireEvent.click(screen.getAllByRole("button", { name: /view units/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Add units" }));
  }

  /** [department combobox, tier combobox] in field order inside the dialog. */
  function combos() {
    return screen.getAllByRole("combobox");
  }

  it("keeps the serial field disabled until a tier is picked, then enables it", () => {
    openAddUnits();

    const serialField = screen.getByText("Serial number").parentElement!;
    expect(serialField.querySelector("input")).toBeDisabled();

    fireEvent.click(combos()[1]);
    fireEvent.click(screen.getByRole("option", { name: "T0" }));

    expect(serialField.querySelector("input")).not.toBeDisabled();
  });

  it("requires a serial only for T2, and locks quantity to 1 for T2", () => {
    openAddUnits();

    fireEvent.click(combos()[1]);
    fireEvent.click(screen.getByRole("option", { name: "T0" }));

    // T0: serial is optional, so the submit button only waits on department.
    expect(screen.getByPlaceholderText("Generated automatically - optional")).toBeInTheDocument();
    const quantityField = screen.getByText("Quantity").parentElement!;
    expect(quantityField.querySelector("input")).not.toBeDisabled();

    fireEvent.click(combos()[1]);
    fireEvent.click(screen.getByRole("option", { name: "T2" }));

    expect(screen.getByText("T2 registers one at a time - each unit carries its own serial")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Required for T2")).toBeInTheDocument();
    expect(quantityField.querySelector("input")).toBeDisabled();
    expect(quantityField.querySelector("input")).toHaveValue(1);

    // Required for T2: submit stays disabled with no serial typed.
    expect(screen.getByRole("button", { name: "Register" })).toBeDisabled();
  });

  it("submits the create call with the chosen department, tier, serial and quantity", async () => {
    createUnits.mockResolvedValue([UNIT]);
    openAddUnits();

    fireEvent.click(combos()[0]);
    fireEvent.click(screen.getByRole("option", { name: "Engineering" }));

    fireEvent.click(combos()[1]);
    fireEvent.click(screen.getByRole("option", { name: "T2" }));

    fireEvent.change(screen.getByPlaceholderText("Required for T2"), { target: { value: "OSC-099" } });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => {
      expect(createUnits).toHaveBeenCalledWith({
        itemKey: MANAGED_ITEM.id,
        manageGroupKey: 8,
        tier: "T2",
        serialNo: "OSC-099",
        prepDays: 0,
        lendable: true,
        quantity: 1,
      });
    });
  });
});

describe("Staff inventory: unit delete blocked by history", () => {
  const deleteUnit = vi.fn();

  beforeEach(() => {
    i18n.changeLanguage("en");
    vi.clearAllMocks();
    mockBaseHooks();
    vi.mocked(inventoryHooks.useDeleteUnit).mockReturnValue({ mutateAsync: deleteUnit, isPending: false } as never);
    vi.mocked(inventoryHooks.useRequestRetirement).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows the HAS_HISTORY message and a request-retirement action instead of deleting", async () => {
    deleteUnit.mockRejectedValue({ data: { code: "HAS_HISTORY" } });
    render(<StaffInventoryPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /view units/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getByText(getErrorMessage({ data: { code: "HAS_HISTORY" } }))).toBeInTheDocument();
    });

    // The failed delete surfaces an inline "Request retirement" link next to
    // its message, in addition to the row's own standing button.
    const retireLinks = screen.getAllByText("Request retirement");
    expect(retireLinks.length).toBeGreaterThan(1);
    fireEvent.click(retireLinks.at(-1)!);

    expect(screen.getByPlaceholderText("Reason for retirement")).toBeInTheDocument();
  });
});
