import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import StaffInventoryPage from "../../src/features/staff/inventory/inventory-page";
import * as inventoryHooks from "../../src/features/staff/inventory/use-inventory";
import * as itemImageHooks from "../../src/features/staff/inventory/use-item-image";
import type { ManagedItemType, ManagedRoom } from "../../src/features/staff/inventory/inventory.types";

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

describe("Staff inventory: room picture", () => {
  const createRoom = vi.fn();
  const updateRoom = vi.fn();
  const uploadImage = vi.fn();
  const STORED = "/media/room/2026/10/lab.jpg";
  const PHOTO = new File(["photo"], "lab.jpg", { type: "image/jpeg" });
  const ROOM: ManagedRoom = {
    resourceKey: 41,
    roomKey: 7,
    name: "Lab 301",
    description: null,
    location: "Building 3",
    imageUrl: null,
    creditWeight: 0,
    capacity: 30,
    tier: "T3",
    status: "InStorage",
    lendable: true,
    condition: null,
    managementGroup: { id: 8, name: "Engineering", type: "Faculty" },
    openMinutes: 420,
    closeMinutes: 1080,
    breakStartMinutes: 720,
    breakEndMinutes: 780,
  };

  function mockRooms(rooms: ManagedRoom[]) {
    vi.mocked(inventoryHooks.useManagedRooms).mockReturnValue({ data: rooms, isLoading: false } as never);
  }

  beforeEach(() => {
    i18n.changeLanguage("en");
    vi.clearAllMocks();
    // jsdom has no object URLs, and the preview needs one.
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.mocked(inventoryHooks.useManagedItems).mockReturnValue({ data: NO_TYPES, isLoading: false } as never);
    mockRooms([]);
    uploadImage.mockResolvedValue({ imageUrl: STORED });
    createRoom.mockResolvedValue({});
    updateRoom.mockResolvedValue({});
    vi.mocked(itemImageHooks.useUploadImage).mockReturnValue({ mutateAsync: uploadImage, isPending: false } as never);
    vi.mocked(inventoryHooks.useManagementGroupOptions).mockReturnValue({ data: GROUPS, isLoading: false } as never);
    vi.mocked(inventoryHooks.useCreateRoom).mockReturnValue({ mutateAsync: createRoom, isPending: false } as never);
    vi.mocked(inventoryHooks.useUpdateRoom).mockReturnValue({ mutateAsync: updateRoom, isPending: false } as never);
    vi.mocked(inventoryHooks.useDeleteRoom).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.mocked(inventoryHooks.useRequestRetirement).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  });

  afterEach(() => {
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  function fillNewRoom() {
    render(<StaffInventoryPage />);
    fireEvent.click(screen.getByRole("button", { name: "New room" }));
    fireEvent.click(screen.getByText("Select..."));
    fireEvent.click(screen.getByRole("option", { name: "Engineering" }));
    fireEvent.change(screen.getByText("Room name", { exact: false }).parentElement!.querySelector("input")!, {
      target: { value: "Lab 301" },
    });
  }

  function pick(file: File) {
    fireEvent.change(screen.getByLabelText("Choose photo"), { target: { files: [file] } });
  }

  it("uploads the picked file as a room photo and creates the room with its address", async () => {
    fillNewRoom();
    pick(PHOTO);

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(createRoom).toHaveBeenCalledWith(expect.objectContaining({ name: "Lab 301", imageUrl: STORED }));
    });
    expect(uploadImage).toHaveBeenCalledWith({ file: PHOTO, purpose: "room" });
  });

  it("uploads nothing until the form is saved, so Cancel leaves no file behind", () => {
    fillNewRoom();
    pick(PHOTO);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(uploadImage).not.toHaveBeenCalled();
    expect(createRoom).not.toHaveBeenCalled();
  });

  it("does not store the file twice when the server refuses the form and it is saved again", async () => {
    createRoom.mockRejectedValueOnce(new Error("refused"));
    fillNewRoom();
    pick(PHOTO);

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(createRoom).toHaveBeenCalledTimes(1));
    await screen.findByRole("button", { name: "Create" });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(createRoom).toHaveBeenCalledTimes(2));
    expect(createRoom.mock.calls[1][0]).toEqual(expect.objectContaining({ imageUrl: STORED }));
    expect(uploadImage).toHaveBeenCalledTimes(1);
  });

  it("refuses a file that is not a picture without asking the server for anything", () => {
    fillNewRoom();
    pick(new File(["%PDF"], "plan.pdf", { type: "application/pdf" }));

    // The reason, not "an unknown error".
    expect(screen.getByText("Only image files are allowed (JPG, PNG).")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("says a file is too large instead of reporting an unknown error", () => {
    fillNewRoom();
    pick(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "huge.jpg", { type: "image/jpeg" }));

    expect(screen.getByText("The file is too large (5 MB maximum).")).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("changes the picture of an existing room, and shows the new one before saving", async () => {
    mockRooms([{ ...ROOM, imageUrl: "http://api/media/room/old.jpg" }]);
    const { container } = render(<StaffInventoryPage />);
    expect(container.querySelector('img[src="http://api/media/room/old.jpg"]')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    pick(PHOTO);
    expect(document.querySelector('img[src="blob:preview"]')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateRoom).toHaveBeenCalledWith(expect.objectContaining({ resourceKey: 41, imageUrl: STORED }));
    });
  });

  it("leaves the current picture alone when an edit picks no file", async () => {
    mockRooms([{ ...ROOM, imageUrl: "http://api/media/room/old.jpg" }]);
    render(<StaffInventoryPage />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateRoom).toHaveBeenCalledTimes(1));
    expect(updateRoom.mock.calls[0][0].imageUrl).toBeUndefined();
    expect(uploadImage).not.toHaveBeenCalled();
  });
});
