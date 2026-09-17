import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUSINESS } from "../../src/constants";
import i18n from "../../src/i18n";
import { ROOMS, TIME_SLOTS } from "../../src/features/borrower/mock-data";
import RoomBookingPage from "../../src/features/borrower/rooms/room-booking-page";
import RoomListPage from "../../src/features/borrower/rooms/room-list-page";
import { useSubmittedRequests } from "../../src/features/borrower/loans/submitted-requests.store";

const useRoomsMock = vi.hoisted(() => vi.fn());
const useRoomMock = vi.hoisted(() => vi.fn());
const useMyRequestsMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/features/borrower/rooms/use-rooms", () => ({
  useRooms: useRoomsMock,
  useRoom: useRoomMock,
}));

vi.mock("../../src/features/borrower/loans/use-my-requests", () => ({
  useMyRequests: useMyRequestsMock,
}));

const T3_ROOM = ROOMS[0];
const OPEN_T3_ROOM = { ...T3_ROOM, freeSlots: T3_ROOM.totalSlots };

describe("Module 5 T3 facilities", () => {
  beforeEach(() => {
    i18n.changeLanguage("en");
    useSubmittedRequests.getState().clear();
    vi.clearAllMocks();
    useRoomsMock.mockReturnValue({ data: ROOMS, isLoading: false });
    useRoomMock.mockReturnValue({ data: OPEN_T3_ROOM, isLoading: false });
    useMyRequestsMock.mockReturnValue({ requests: [] });
  });

  it("lists a source T3 facility with its capacity and free slots", () => {
    render(
      <MemoryRouter>
        <RoomListPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByText(T3_ROOM.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText(T3_ROOM.code).length).toBeGreaterThan(0);
    expect(screen.getAllByText(String(T3_ROOM.capacity)).length).toBeGreaterThan(0);
  });

  it("renders every 30-minute T3 slot and explains the fixed-facility rules", () => {
    render(
      <MemoryRouter initialEntries={[`/rooms/${T3_ROOM.id}/book`]}>
        <Routes>
          <Route path="/rooms/:id/book" element={<RoomBookingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(i18n.t("borrower.booking.dateHelp", {
      minutes: BUSINESS.ROOM_SLOT_MINUTES,
      hours: BUSINESS.MAX_ROOM_BOOKING_HOURS,
    }))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("borrower.booking.slotBreak"))).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`${T3_ROOM.capacity} seats`)),
    ).toBeInTheDocument();

    for (const slot of TIME_SLOTS) {
      expect(screen.getByRole("button", { name: slot.start })).toBeInTheDocument();
    }
  });

  it("limits a T3 booking to the configured maximum number of slots", () => {
    render(
      <MemoryRouter initialEntries={[`/rooms/${T3_ROOM.id}/book`]}>
        <Routes>
          <Route path="/rooms/:id/book" element={<RoomBookingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    for (const slot of TIME_SLOTS.slice(0, BUSINESS.MAX_ROOM_BOOKING_SLOTS)) {
      fireEvent.click(screen.getByRole("button", { name: slot.start }));
    }

    expect(
      screen.getByRole("button", { name: TIME_SLOTS[BUSINESS.MAX_ROOM_BOOKING_SLOTS].start }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: i18n.t("borrower.booking.submit") })).toBeEnabled();
  });

  it("does not allow a booking to cross the lunch break", () => {
    render(
      <MemoryRouter initialEntries={[`/rooms/${T3_ROOM.id}/book`]}>
        <Routes>
          <Route path="/rooms/:id/book" element={<RoomBookingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "11:30" }));

    expect(screen.getByRole("button", { name: "13:00" })).toBeDisabled();
  });

  it("submits a room booking as a T3 request with the selected slots", () => {
    render(
      <MemoryRouter initialEntries={[`/rooms/${T3_ROOM.id}/book`]}>
        <Routes>
          <Route path="/rooms/:id/book" element={<RoomBookingPage />} />
          <Route path="/my/loans" element={<div>My requests</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "07:00" }));
    fireEvent.click(screen.getByRole("button", { name: i18n.t("borrower.booking.submit") }));

    expect(useSubmittedRequests.getState().requests[0]).toMatchObject({
      kind: "room",
      tier: "T3",
      name: T3_ROOM.name,
      serial: T3_ROOM.code,
      slots: [0],
    });
  });
});
