import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCreateRoomBooking,
  useRooms,
} from "../../src/features/borrower/rooms/use-rooms";
import {
  useFinalizePickup,
  usePickupImageUpload,
} from "../../src/features/borrower/pickup/use-pickup-image-upload";
import { useAppeals } from "../../src/features/supervisor/appeals/use-appeals";
import type { PreparedBorrowerImage } from "../../src/features/borrower/uploads/prepared-image";
import { requestResponse, roomResponse } from "../fixtures/api-responses";
import {
  DEFAULT_ROOM_HOURS,
  slotsToWindow,
} from "../../../backend/src/common/booking/room-slots";
import { createRequestOutput } from "../../../backend/src/loan/loan.schema";
import { paginatedRooms } from "../../../backend/src/item/item.schema";
import {
  requestUploadOutput,
  usagePhotosOutput,
} from "../../../backend/src/image/image.schema";

const api = vi.hoisted(() => ({
  rooms: vi.fn(),
  book: vi.fn(),
  confirm: vi.fn(),
  ticket: vi.fn(),
  attach: vi.fn(),
  upload: vi.fn(),
  appeals: vi.fn(),
}));
vi.mock("../../src/lib/trpc", () => ({
  useTRPCClient: () => ({
    item: { listRooms: { query: api.rooms } },
    loan: {
      createRoomBooking: { mutate: api.book },
      confirmMyPickup: { mutate: api.confirm },
    },
    image: {
      requestUsagePhotoUpload: { mutate: api.ticket },
      attachUsagePhotos: { mutate: api.attach },
    },
    appeal: { list: { query: api.appeals } },
  }),
}));
vi.mock("../../src/lib/api-client", () => ({ apiClient: { uploadFile: api.upload } }));

const room = roomResponse();

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("room and pickup API regressions from the PDF", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists only rooms returned by the API, including room 7603", async () => {
    api.rooms.mockResolvedValue(
      paginatedRooms.parse({ items: [room], total: 1, page: 1, pageSize: 100 })
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useRooms(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.rooms).toHaveBeenCalledWith({ page: 1, pageSize: 100 });
    expect(result.current.data).toEqual([
      {
        id: "7603",
        name: room.name,
        description: null,
        location: room.location,
        capacity: 24,
        imageUrl: null,
        bookable: true,
      },
    ]);
  });

  it("does not replace an empty room or appeal API response with sample rows", async () => {
    const empty = { items: [], total: 0, page: 1, pageSize: 100 };
    api.rooms.mockResolvedValue(empty);
    api.appeals.mockResolvedValue(empty);
    const { wrapper } = setup();
    const rooms = renderHook(() => useRooms(), { wrapper });
    const appeals = renderHook(() => useAppeals("pending"), { wrapper });
    await waitFor(() =>
      expect(rooms.result.current.isSuccess && appeals.result.current.isSuccess).toBe(
        true
      )
    );
    expect(rooms.result.current.data).toEqual([]);
    expect(appeals.result.current.data).toEqual([]);
    expect(api.appeals).toHaveBeenCalledWith({
      page: 1,
      pageSize: 100,
      status: "pending",
    });
  });

  it("sends the room booking to the backend and refreshes rooms and borrower requests", async () => {
    const input = {
      roomKey: 7603,
      date: "2026-09-26",
      slots: [14, 15],
      reason: "Project meeting",
    };

    const window = slotsToWindow(DEFAULT_ROOM_HOURS, input.date, input.slots);
    const response = createRequestOutput.parse({
      created: [
        requestResponse({
          reservationKey: 91,
          resource: {
            resourceKey: 7603,
            name: room.name,
            serialNo: null,
            kind: "room",
            tier: "T3",
            creditWeight: 1,
          },
          startTime: window.startTime.toISOString(),
          approval: { ...requestResponse().approval, route: "staff" },
          endTime: window.endTime.toISOString(),
          reason: "Project meeting",
        }),
      ],
      rejected: [],
    });
    api.book.mockResolvedValue(response);
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCreateRoomBooking(), { wrapper });
    expect(await result.current.mutateAsync(input)).toEqual(response);
    expect(api.book).toHaveBeenCalledWith(input);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["facilities"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["loan", "my-requests"] });
  });

  it("confirms pickup through the borrower endpoint rather than the staff-only endpoint", async () => {
    api.confirm.mockImplementation(({ usageKey }: { usageKey: number }) =>
      requestResponse({
        status: "inUse",
        usageKey,
        dueAt: "2026-09-29T09:00:00.000Z",
        cancellable: false,
        approval: {
          route: "auto",
          status: "Approved",
          approvedBy: null,
          autoApproved: true,
          approvedAt: "2026-09-26T00:00:00.000Z",
          resolvedAt: "2026-09-26T00:00:00.000Z",
        },
      })
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useFinalizePickup(), { wrapper });
    expect(await result.current.mutateAsync([41, 42])).toEqual({
      finalizedUsageKeys: [41, 42],
    });
    expect(api.confirm.mock.calls).toEqual([[{ usageKey: 41 }], [{ usageKey: 42 }]]);
  });

  it("reports a pickup refusal and does not confirm later units", async () => {
    api.confirm
      .mockResolvedValueOnce(
        requestResponse({
          status: "inUse",
          usageKey: 41,
          dueAt: "2026-09-29T09:00:00.000Z",
          cancellable: false,
          approval: {
            route: "auto",
            status: "Approved",
            approvedBy: null,
            autoApproved: true,
            approvedAt: "2026-09-26T00:00:00.000Z",
            resolvedAt: "2026-09-26T00:00:00.000Z",
          },
        })
      )
      .mockRejectedValueOnce(new Error("PICKUP_PHOTO_REQUIRED"));
    const { wrapper } = setup();
    const { result } = renderHook(() => useFinalizePickup(), { wrapper });
    await expect(result.current.mutateAsync([41, 42, 43])).rejects.toThrow(
      "PICKUP_PHOTO_REQUIRED"
    );
    expect(api.confirm.mock.calls).toEqual([[{ usageKey: 41 }], [{ usageKey: 42 }]]);
  });

  it("uploads the photo bytes with a borrower ticket and attaches the resulting URL", async () => {
    const png = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1kAAAAASUVORK5CYII="
      ),
      (character) => character.charCodeAt(0)
    );
    const file = new File([png], "before.png", { type: "image/png" });
    const image: PreparedBorrowerImage = {
      file,
      previewUrl: "blob:before",
      contentType: "image/png",
      sizeBytes: file.size,
      status: "ready",
    };
    api.ticket.mockResolvedValue(
      requestUploadOutput.parse({
        uploadUrl: "http://localhost:3000/uploads/ticket",
        imageUrl: "/media/before.png",
        previewUrl: "http://localhost:3000/media/before.png",
        expiresAt: "2026-09-26T09:10:00.000Z",
        maxBytes: 5_000_000,
      })
    );
    api.upload.mockResolvedValue(undefined);
    api.attach.mockResolvedValue(
      usagePhotosOutput.parse({
        before: [
          {
            imageKey: 8,
            imageUrl: "/media/before.png",
            stage: "before",
            submittedBy: 7,
            submittedAt: "2026-09-26T09:00:00.000Z",
          },
        ],
        after: [],
        inspection: [],
        evidence: [],
      })
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => usePickupImageUpload(), { wrapper });
    const uploaded = await result.current.mutateAsync({ usageKey: 41, image });
    expect(api.ticket).toHaveBeenCalledWith({
      usageKey: 41,
      contentType: "image/png",
      sizeBytes: file.size,
    });
    expect(api.upload).toHaveBeenCalledWith("http://localhost:3000/uploads/ticket", file);
    expect(api.attach).toHaveBeenCalledWith({
      usageKey: 41,
      stage: "before",
      imageUrls: ["/media/before.png"],
    });
    expect(uploaded.image).toMatchObject({
      status: "uploaded",
      imageUrl: "/media/before.png",
    });
  });
});
