import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import StaffInventoryPage from "../../src/features/staff/inventory/inventory-page";
import * as inventoryHooks from "../../src/features/staff/inventory/use-inventory";
import * as itemImageHooks from "../../src/features/staff/inventory/use-item-image";
import type { ManagedItemType } from "../../src/features/staff/inventory/inventory.types";

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

// No equipment types in this suite - only the rooms section at the bottom of
// the page is under test.
const NO_TYPES: ManagedItemType[] = [];
const GROUPS = [{ id: 8, name: "Engineering", type: "Faculty" as const }];

describe("Staff inventory: rooms section create dialog", () => {
  const createRoom = vi.fn();

  beforeEach(() => {
    i18n.changeLanguage("en");
    vi.clearAllMocks();
    vi.mocked(inventoryHooks.useManagedItems).mockReturnValue({ data: NO_TYPES, isLoading: false } as never);
    vi.mocked(inventoryHooks.useManagedRooms).mockReturnValue({ data: [], isLoading: false } as never);
    vi.mocked(itemImageHooks.useUploadImage).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.mocked(inventoryHooks.useManagementGroupOptions).mockReturnValue({ data: GROUPS, isLoading: false } as never);
    vi.mocked(inventoryHooks.useCreateRoom).mockReturnValue({ mutateAsync: createRoom, isPending: false } as never);
    vi.mocked(inventoryHooks.useUpdateRoom).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.mocked(inventoryHooks.useDeleteRoom).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.mocked(inventoryHooks.useRequestRetirement).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  });

  function openCreateRoom() {
    render(<StaffInventoryPage />);
    fireEvent.click(screen.getByRole("button", { name: "New room" }));
  }

  it("defaults hours and the lunch break to values on the 30-minute grid", () => {
    openCreateRoom();

    const opens = screen.getByText("Opens").parentElement!.querySelector("select") as HTMLSelectElement;
    const closes = screen.getByText("Closes").parentElement!.querySelector("select") as HTMLSelectElement;
    // 420 minutes = 07:00, 1080 minutes = 18:00 - both on the 30-minute grid.
    expect(opens).toHaveValue("420");
    expect(closes).toHaveValue("1080");

    // Every option on both clocks must land on a 30-minute mark.
    for (const select of [opens, closes]) {
      for (const option of Array.from(select.options)) {
        expect(Number(option.value) % 30).toBe(0);
      }
    }
  });

  it("keeps the break start/end pair together, and can turn the break off", () => {
    openCreateRoom();

    expect(screen.getByText("Break starts")).toBeInTheDocument();
    expect(screen.getByText("Break ends")).toBeInTheDocument();

    const breakStart = screen.getByText("Break starts").parentElement!.querySelector("select") as HTMLSelectElement;
    const breakEnd = screen.getByText("Break ends").parentElement!.querySelector("select") as HTMLSelectElement;
    // 720 = 12:00, 780 = 12:30 - the default lunch break.
    expect(breakStart).toHaveValue("720");
    expect(breakEnd).toHaveValue("780");

    fireEvent.click(screen.getByRole("switch", { name: "Lunch break" }));
    expect(screen.queryByText("Break starts")).not.toBeInTheDocument();
    expect(screen.queryByText("Break ends")).not.toBeInTheDocument();
  });

  it("submits the create call with the chosen department and default hours", async () => {
    createRoom.mockResolvedValue({});
    openCreateRoom();

    // The native 30-minute <select> clocks also carry an implicit "combobox"
    // role, so the department picker is found by its own placeholder text.
    fireEvent.click(screen.getByText("Select..."));
    fireEvent.click(screen.getByRole("option", { name: "Engineering" }));
    // The room-name box has no placeholder, so target it via its Field wrapper.
    fireEvent.change(screen.getByText("Room name", { exact: false }).parentElement!.querySelector("input")!, {
      target: { value: "Lab 301" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(createRoom).toHaveBeenCalledWith({
        manageGroupKey: 8,
        name: "Lab 301",
        description: undefined,
        location: undefined,
        creditWeight: 0,
        capacity: undefined,
        lendable: true,
        openMinutes: 420,
        closeMinutes: 1080,
        breakStartMinutes: 720,
        breakEndMinutes: 780,
      });
    });
  });
});
