import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROUTES } from "../../src/constants";
import i18n from "../../src/i18n";
import { ROOM_SLOTS, slotWindow } from "../../../backend/src/common/booking/room-slots";
import { todayLocalDayKey } from "../../src/lib/datetime";
import { getErrorMessage } from "../../src/lib/error-messages";
import RoomBookingPage from "../../src/features/borrower/rooms/room-booking-page";
import RoomListPage from "../../src/features/borrower/rooms/room-list-page";
import * as roomHooks from "../../src/features/borrower/rooms/use-rooms";
import * as myRequestsHooks from "../../src/features/borrower/loans/use-my-requests";
import { toRoom, type RoomDay } from "../../src/features/borrower/rooms/room.adapter";
import { toBorrowerRequest } from "../../src/features/borrower/loans/request.adapter";
import { requestResponse, roomResponse } from "../fixtures/api-responses";
import { mutationResult, queryResult } from "../fixtures/query-results";
import { roomAvailabilityOutput } from "../../../backend/src/item/item.schema";
import { createRequestOutput } from "../../../backend/src/loan/loan.schema";

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

const ROOM = toRoom(
  roomResponse({
    id: 38,
    name: "Innovation Lab",
    description: "Fabrication and prototyping space",
    location: "Building 2, Floor 3",
    capacity: 24,
    imageUrl: null,
    bookable: true,
  })
);

/** Small on purpose: proves the page reads the cap from the server, not BUSINESS.MAX_ROOM_BOOKING_SLOTS. */
const MAX_SLOTS_PER_BOOKING = 3;

function buildRoomDay(unavailable: number[] = []): RoomDay {
  const closed = new Set(unavailable);
  return roomAvailabilityOutput.strict().parse({
    roomKey: Number(ROOM.id),
    date: todayLocalDayKey(),
    slots: ROOM_SLOTS.map((s, index) => ({
      index,
      start: s.start,
      end: s.end,
      startTime: slotWindow(todayLocalDayKey(), index).startTime.toISOString(),
      endTime: slotWindow(todayLocalDayKey(), index).endTime.toISOString(),
      available: !closed.has(index),
    })),
    maxSlotsPerBooking: MAX_SLOTS_PER_BOOKING,
    slotMinutes: 30,
  });
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
  const mutateAsync =
    vi.fn<ReturnType<typeof roomHooks.useCreateRoomBooking>["mutateAsync"]>();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-09-25T23:00:00.000Z"));
    i18n.changeLanguage("en");
    vi.clearAllMocks();
    vi.mocked(roomHooks.useRooms).mockReturnValue(queryResult([ROOM]));
    vi.mocked(roomHooks.useRoom).mockReturnValue(queryResult(ROOM));
    vi.mocked(roomHooks.useRoomDay).mockReturnValue(queryResult(buildRoomDay()));
    vi.mocked(roomHooks.useFreeSlots).mockReturnValue(
      new Map([[ROOM.id, buildRoomDay().slots.filter((slot) => slot.available).length]])
    );
    vi.mocked(roomHooks.useCreateRoomBooking).mockReturnValue(
      mutationResult(mutateAsync)
    );
    vi.mocked(myRequestsHooks.useMyRequests).mockReturnValue({
      requests: [],
      draft: null,
      countByTab: { active: 0, using: 0, history: 0 },
      isLoading: false,
    });
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
        i18n.t("borrower.rooms.slots", {
          free: ROOM_SLOTS.length,
          total: ROOM_SLOTS.length,
        })
      ).length
    ).toBeGreaterThan(0);
  });

  it("names the booking blocking another room and explains how to release it (PDF pp. 9–10)", () => {
    const held = toBorrowerRequest(
      requestResponse({
        reservationKey: 91,
        requestedAt: new Date().toISOString(),
        approval: { ...requestResponse().approval, route: "staff" },
        resource: {
          resourceKey: 7603,
          kind: "room",
          tier: "T3",
          name: "Room 7603",
          serialNo: null,
          creditWeight: 1,
        },
        startTime: buildRoomDay().slots[0].startTime,
        endTime: buildRoomDay().slots[0].endTime,
      })
    );
    vi.mocked(myRequestsHooks.useMyRequests).mockReturnValue({
      requests: [held],
      draft: null,
      countByTab: { active: 1, using: 0, history: 0 },
      isLoading: false,
    });
    render(
      <MemoryRouter>
        <RoomListPage />
      </MemoryRouter>
    );
    const explanation = i18n.t("borrower.rooms.heldNote", { name: held.name });
    expect(explanation).toMatch(/Room 7603.*cancel.*finish/i);
    expect(screen.getAllByText(explanation).length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: i18n.t("borrower.rooms.heldAction") }).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/old request/i)).not.toBeInTheDocument();
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
    expect(screen.getByText(i18n.t("borrower.booking.slotBreak"))).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t("borrower.booking.seats", { count: ROOM.capacity }), {
        exact: false,
      })
    ).toBeInTheDocument();
  });

  it("marks a slot the server reports as unavailable disabled", () => {
    vi.mocked(roomHooks.useRoomDay).mockReturnValue(queryResult(buildRoomDay([5])));
    renderBookingPage();

    expect(screen.getByRole("button", { name: ROOM_SLOTS[5].start })).toBeDisabled();
  });

  it("caps picking at the server's maxSlotsPerBooking, not the frontend constant", () => {
    renderBookingPage();

    for (const slot of ROOM_SLOTS.slice(0, MAX_SLOTS_PER_BOOKING)) {
      fireEvent.click(screen.getByRole("button", { name: slot.start }));
    }

    expect(
      screen.getByRole("button", { name: ROOM_SLOTS[MAX_SLOTS_PER_BOOKING].start })
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
    mutateAsync.mockResolvedValue(
      createRequestOutput.parse({
        created: [
          requestResponse({
            reservationKey: 91,
            requestedAt: new Date().toISOString(),
            approval: { ...requestResponse().approval, route: "staff" },
            resource: {
              resourceKey: 38,
              name: ROOM.name,
              serialNo: null,
              kind: "room",
              tier: "T3",
              creditWeight: 1,
            },
            startTime: buildRoomDay().slots[0].startTime,
            endTime: buildRoomDay().slots[0].endTime,
          }),
        ],
        rejected: [],
      })
    );
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
    mutateAsync.mockResolvedValue(
      createRequestOutput.parse({
        created: [],
        rejected: [{ resourceKey: 1, code: "WINDOW_NOT_AVAILABLE", detail: null }],
      })
    );
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
});
