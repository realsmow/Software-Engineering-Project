import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ROUTES } from "../../src/constants";
import i18n from "../../src/i18n";
import { TIME_SLOTS } from "../../src/features/borrower/rooms/room-slots";
import { todayLocalDayKey } from "../../src/lib/datetime";
import { getErrorMessage } from "../../src/lib/error-messages";
import RoomBookingPage from "../../src/features/borrower/rooms/room-booking-page";
import RoomListPage from "../../src/features/borrower/rooms/room-list-page";
import * as roomHooks from "../../src/features/borrower/rooms/use-rooms";
import * as myRequestsHooks from "../../src/features/borrower/loans/use-my-requests";
import type { Room, RoomDay } from "../../src/features/borrower/rooms/room.adapter";
import { requestResponse } from "../fixtures/api-responses";
import { toBorrowerRequest } from "../../src/features/borrower/loans/request.adapter";
import { useTRPCClient } from "../../src/lib/trpc";
import { roomAvailabilityOutput } from "../../../backend/src/item/item.schema";

vi.mock("../../src/lib/trpc", () => ({ useTRPCClient: vi.fn() }));

vi.mock("../../src/features/borrower/rooms/use-rooms", () => ({
  useRooms: vi.fn(),
  useRoom: vi.fn(),
  useRoomDay: vi.fn(),
  useFreeSlots: vi.fn(),
  useCreateRoomBooking: vi.fn(),
}));

vi.mock("../../src/features/borrower/loans/use-my-requests", () => ({
  useMyRequests: vi.fn(),
}));

const ROOM: Room = {
  id: "38",
  name: "Innovation Lab",
  description: "Fabrication and prototyping space",
  location: "Building 2, Floor 3",
  capacity: 24,
  imageUrl: null,
  bookable: true,
};

/** Small on purpose: proves the page reads the cap from the server, not BUSINESS.MAX_ROOM_BOOKING_SLOTS. */
const MAX_SLOTS_PER_BOOKING = 3;

function buildRoomDay(unavailable: number[] = []): RoomDay {
  const closed = new Set(unavailable);
  return {
    roomKey: Number(ROOM.id),
    date: todayLocalDayKey(),
    slots: TIME_SLOTS.map((s, index) => ({
      index,
      start: s.start,
      end: s.end,
      startTime: s.start,
      endTime: s.end,
      available: !closed.has(index),
    })),
    eligible: true,
    maxSlotsPerBooking: MAX_SLOTS_PER_BOOKING,
    slotMinutes: 30,
  };
}

function renderBookingPage() {
  render(
    <MemoryRouter initialEntries={[ROUTES.ROOM_BOOKING.replace(":id", ROOM.id)]}>
      <Routes>
        <Route path={ROUTES.ROOM_BOOKING} element={<RoomBookingPage />} />
        <Route path={ROUTES.MY_LOANS} element={<div>My requests</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Module 5 T3 facilities", () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    i18n.changeLanguage("en");
    vi.clearAllMocks();
    vi.mocked(roomHooks.useRooms).mockReturnValue({
      data: [ROOM],
      isLoading: false,
    } as never);
    vi.mocked(roomHooks.useRoom).mockReturnValue({
      data: ROOM,
      isLoading: false,
    } as never);
    vi.mocked(roomHooks.useRoomDay).mockReturnValue({
      data: buildRoomDay(),
      isLoading: false,
    } as never);
    vi.mocked(roomHooks.useFreeSlots).mockReturnValue(new Map([[ROOM.id, 14]]));
    vi.mocked(roomHooks.useCreateRoomBooking).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never);
    vi.mocked(myRequestsHooks.useMyRequests).mockReturnValue({ requests: [] } as never);
  });

  afterEach(() => vi.useRealTimers());

  it("lists a room with its location, capacity, and free-slot count", () => {
    render(
      <MemoryRouter>
        <RoomListPage />
      </MemoryRouter>
    );

    expect(screen.getAllByText(ROOM.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText(ROOM.location as string).length).toBeGreaterThan(0);
    expect(screen.getAllByText(String(ROOM.capacity)).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        i18n.t("borrower.rooms.slots", { free: 14, total: TIME_SLOTS.length })
      ).length
    ).toBeGreaterThan(0);
  });

  it("renders every slot the server returned and explains the booking rules", () => {
    renderBookingPage();

    for (const slot of buildRoomDay().slots) {
      expect(screen.getByRole("button", { name: slot.start })).toBeInTheDocument();
    }
    expect(
      screen.getByText(
        // Hours follow the server's cap (3 slots of 30 minutes in this
        // fixture), not the frontend constant, so the copy cannot drift from
        // the limit the page enforces.
        i18n.t("borrower.booking.dateHelp", {
          minutes: 30,
          hours: (3 * 30) / 60,
        })
      )
    ).toBeInTheDocument();
    // The break is read from the gap in the slots, not a fixed sentence (#172).
    expect(
      screen.getByText(
        i18n.t("borrower.booking.slotBreak", { from: "12:00", to: "13:00" })
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t("borrower.booking.seats", { count: ROOM.capacity }), {
        exact: false,
      })
    ).toBeInTheDocument();
  });

  it("marks a slot the server reports as unavailable disabled", () => {
    vi.mocked(roomHooks.useRoomDay).mockReturnValue({
      data: buildRoomDay([5]),
      isLoading: false,
    } as never);
    renderBookingPage();

    expect(screen.getByRole("button", { name: TIME_SLOTS[5].start })).toBeDisabled();
  });

  it("says the room is not open to a borrower no rule names (#163)", () => {
    vi.mocked(roomHooks.useRoomDay).mockReturnValue({
      data: { ...buildRoomDay(TIME_SLOTS.map((_, i) => i)), eligible: false },
      isLoading: false,
    } as never);
    renderBookingPage();

    expect(screen.getByText(i18n.t("borrower.booking.notEligible"))).toBeInTheDocument();
  });

  it("caps picking at the server's maxSlotsPerBooking, not the frontend constant", () => {
    renderBookingPage();

    for (const slot of TIME_SLOTS.slice(0, MAX_SLOTS_PER_BOOKING)) {
      fireEvent.click(screen.getByRole("button", { name: slot.start }));
    }

    expect(
      screen.getByRole("button", { name: TIME_SLOTS[MAX_SLOTS_PER_BOOKING].start })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: i18n.t("borrower.booking.submit") })
    ).toBeEnabled();
  });

  it("does not allow a booking to cross the lunch break", () => {
    renderBookingPage();

    fireEvent.click(screen.getByRole("button", { name: "11:30" }));

    expect(screen.getByRole("button", { name: "13:00" })).toBeDisabled();
  });

  it("submits a booking with the room key, today's date, and the picked slot indices", async () => {
    mutateAsync.mockResolvedValue({ created: [{ id: "req-1" }], rejected: [] });
    renderBookingPage();

    fireEvent.click(screen.getByRole("button", { name: "07:00" }));
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("borrower.booking.submit") })
    );

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        roomKey: Number(ROOM.id),
        date: todayLocalDayKey(),
        slots: [0],
        reason: undefined,
      });
    });
    await waitFor(() => {
      expect(screen.getByText("My requests")).toBeInTheDocument();
    });
  });

  it("shows an error and stays on the page when the server rejects the slot as a clash", async () => {
    mutateAsync.mockResolvedValue({
      created: [],
      rejected: [{ resourceKey: 1, code: "WINDOW_NOT_AVAILABLE", detail: null }],
    });
    renderBookingPage();

    fireEvent.click(screen.getByRole("button", { name: "07:00" }));
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("borrower.booking.submit") })
    );

    await waitFor(() => {
      expect(
        screen.getByText(getErrorMessage("WINDOW_NOT_AVAILABLE"))
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("My requests")).not.toBeInTheDocument();
  });

  // Use schema-validated API records and the production adapter. These UI
  // tests do not pretend the backend quota can be bypassed (SQL controls cover it).
  function heldRoom(
    status: ReturnType<typeof requestResponse>["status"],
    endTime: string
  ) {
    return toBorrowerRequest(
      requestResponse({
        status,
        resource: {
          resourceKey: 99,
          name: "Existing room booking",
          serialNo: null,
          kind: "room",
          tier: "T3",
          creditWeight: 0,
        },
        startTime: "2031-09-26T02:00:00.000Z",
        endTime,
        usageKey: status === "ready" || status === "inUse" ? 42 : null,
        dueAt: status === "ready" || status === "inUse" ? endTime : null,
        approval: {
          route: "auto",
          status: status === "pending" ? "Pending" : "Approved",
          approvedBy: null,
          autoApproved: status !== "pending",
          approvedAt: status === "pending" ? null : "2031-09-26T00:00:00.000Z",
          resolvedAt: null,
        },
      })
    );
  }
  function selectFreeSlot() {
    renderBookingPage();
    const slot = screen.getByRole("button", { name: TIME_SLOTS[0].start });
    expect(slot).toBeEnabled();
    fireEvent.click(slot);
    return screen.getByRole("button", { name: i18n.t("borrower.booking.submit") });
  }
  for (const status of ["approved", "preparing"] as const) {
    describe(`existing ${status} booking`, () => {
      let submit: HTMLElement;
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2031-09-26T00:00:00.000Z"));
        vi.mocked(myRequestsHooks.useMyRequests).mockReturnValue({
          requests: [heldRoom(status, "2031-09-26T03:00:00.000Z")],
        } as never);
        submit = selectFreeSlot();
      });
      it.fails(
        "blocks a second room request while the existing booking is active",
        () => {
          expect(submit).toBeDisabled();
        }
      );
    });
  }
  for (const status of ["pending", "ready", "inUse"] as const) {
    it(`existing ${status} booking blocks a second request`, () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2031-09-26T00:00:00.000Z"));
      vi.mocked(myRequestsHooks.useMyRequests).mockReturnValue({
        requests: [heldRoom(status, "2031-09-26T03:00:00.000Z")],
      } as never);
      expect(selectFreeSlot()).toBeDisabled();
    });
  }
  for (const status of ["ready", "inUse"] as const) {
    for (const [boundary, now] of [
      ["at end", "2031-09-26T03:00:00.000Z"],
      ["after end", "2031-09-26T03:00:00.001Z"],
    ] as const) {
      describe(`expired ${status} booking ${boundary}`, () => {
        let submit: HTMLElement;
        beforeEach(() => {
          vi.useFakeTimers({ toFake: ["Date"] });
          vi.setSystemTime(new Date(now));
          vi.mocked(myRequestsHooks.useMyRequests).mockReturnValue({
            requests: [heldRoom(status, "2031-09-26T03:00:00.000Z")],
          } as never);
          // A different room with a future slot; not a stale same-room slot.
          vi.mocked(roomHooks.useRoomDay).mockReturnValue({
            data: {
              ...buildRoomDay(),
              slots: [
                {
                  index: 0,
                  start: "11:00",
                  end: "11:30",
                  startTime: "2031-09-26T04:00:00.000Z",
                  endTime: "2031-09-26T04:30:00.000Z",
                  available: true,
                },
              ],
            },
            isLoading: false,
          } as never);
          renderBookingPage();
          expect(screen.getByRole("button", { name: "11:00" })).toBeEnabled();
          fireEvent.click(screen.getByRole("button", { name: "11:00" }));
          submit = screen.getByRole("button", {
            name: i18n.t("borrower.booking.submit"),
          });
        });
        it.fails("allows selecting a new booking after the previous window ends", () => {
          expect(submit).toBeEnabled();
        });
      });
    }
    it(`control: ${status} immediately before end still holds quota`, () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2031-09-26T02:59:59.999Z"));
      vi.mocked(myRequestsHooks.useMyRequests).mockReturnValue({
        requests: [heldRoom(status, "2031-09-26T03:00:00.000Z")],
      } as never);
      expect(selectFreeSlot()).toBeDisabled();
    });
  }

  describe("custom room hours in the list", () => {
    let queryClient: QueryClient;
    beforeEach(async () => {
      // Exercise the real availability-to-free-count hook, not an invented
      // total field in its mock. The API returns four actual half-hour slots.
      const actual = await vi.importActual<typeof roomHooks>(
        "../../src/features/borrower/rooms/use-rooms"
      );
      vi.mocked(roomHooks.useFreeSlots).mockImplementation(actual.useFreeSlots);
      const date = todayLocalDayKey();
      const day = roomAvailabilityOutput.strict().parse({
        ...buildRoomDay(),
        slots: buildRoomDay()
          .slots.slice(0, 4)
          .map((slot) => ({
            ...slot,
            startTime: new Date(`${date}T${slot.start}:00+07:00`).toISOString(),
            endTime: new Date(`${date}T${slot.end}:00+07:00`).toISOString(),
          })),
      });
      const availability = vi.fn().mockResolvedValue(day);
      vi.mocked(useTRPCClient).mockReturnValue({
        item: { roomAvailability: { query: availability } },
      } as never);
      queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <RoomListPage />
          </MemoryRouter>
        </QueryClientProvider>
      );
      await waitFor(() =>
        expect(availability).toHaveBeenCalledWith({
          roomKey: Number(ROOM.id),
          date: todayLocalDayKey(),
        })
      );
      // Wait for the loaded free count, regardless of the product's denominator.
      await waitFor(() =>
        expect(screen.getAllByText(/4\s*\/\s*\d+\s+slots/).length).toBeGreaterThan(0)
      );
    });
    afterEach(() => queryClient?.clear());
    it.fails("uses the actual four-slot total rather than the default twenty", () => {
      expect(
        screen.getAllByText(i18n.t("borrower.rooms.slots", { free: 4, total: 4 })).length
      ).toBeGreaterThan(0);
    });
  });
});
