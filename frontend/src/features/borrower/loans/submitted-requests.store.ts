import { create } from "zustand";
import { format } from "date-fns";
import {
  CATALOG_ITEMS,
  type MyRequest,
  type MyRequestStatus,
  type Room,
} from "../mock-data";
import type { RequestUnit } from "../request/request-draft.store";

/**
 * Requests submitted during this session.
 *
 * The my-requests page reads mock history from `MY_REQUESTS`; anything the
 * borrower sends from the request or booking pages lands here and is merged on
 * top, so pressing "ส่งคำขอ" visibly produces rows instead of vanishing.
 *
 * One item is one request, matching `Reservations` in the backend schema — a
 * basket of five produces five numbered requests, not one with five lines.
 *
 * NOTE: memory only — a refresh drops these, same as the draft store. The
 * backend owns them for real (POST /loan-requests → GET /loan-requests?me=1).
 */
/** Room condition photos taken by the borrower, as object URLs. */
export interface RoomUseShots {
  before?: string;
  after?: string;
}

interface SubmittedRequestsState {
  requests: MyRequest[];
  /**
   * Status changes applied on top of whatever `useMyRequests` merged.
   *
   * They live apart from `requests` because half the list comes from
   * `MY_REQUESTS`, a module constant nothing can rewrite. Without this layer
   * only requests submitted in this same session could ever move — which is
   * why "cancel" used to do nothing on a seeded row.
   */
  statusOverrides: Record<string, MyRequestStatus>;
  /** Room bookings only, keyed by reservation number. */
  roomUse: Record<string, RoomUseShots>;

  /** Issues one numbered request per unit. */
  addEquipmentRequest: (input: {
    units: RequestUnit[];
    startDate: string;
    endDate: string;
    /** T2 (or low credit) items wait for a supervisor; the rest auto-approve. */
    needsSupervisor: boolean;
  }) => void;
  addRoomBooking: (input: { room: Room; date: string; slots: number[] }) => void;
  /** Moves a request — check-in and check-out on the room-use page. */
  setStatus: (requestId: string, status: MyRequestStatus) => void;
  /** Stores (or clears, with `undefined`) one of the two room photos. */
  setRoomPhoto: (requestId: string, which: keyof RoomUseShots, url?: string) => void;
  cancel: (requestId: string) => void;
  clear: () => void;
}

/**
 * Reference numbers restart at these each session because nothing persists.
 * The server issues the real ones.
 */
const EQUIPMENT_SEQ_START = 501;
const ROOM_SEQ_START = 41;

function refOf(prefix: string, seq: number): string {
  return `${prefix}-2569-${String(seq).padStart(5, "0")}`;
}

export const useSubmittedRequests = create<SubmittedRequestsState>((set, get) => ({
  requests: [],
  statusOverrides: {},
  roomUse: {},

  addEquipmentRequest: ({ units, startDate, endDate, needsSupervisor }) => {
    if (units.length === 0) return;
    // Each unit gets the next number in sequence — nothing ties them together.
    let seq = EQUIPMENT_SEQ_START + countRequests(get().requests, "REQ");

    const created = units.flatMap<MyRequest>((unit) => {
      const item = CATALOG_ITEMS.find((c) => c.id === unit.itemId);
      if (!item) return [];
      // Only the items that actually need sign-off wait; the others move on.
      const status: MyRequestStatus =
        needsSupervisor && item.tier === "T2" ? "pending" : "approved";
      return [
        {
          id: refOf("REQ", seq++),
          kind: "equipment",
          tier: item.tier,
          name: item.name,
          serial: unit.serial ?? "—",
          status,
          startDate,
          endDate,
        },
      ];
    });

    set((s) => ({ requests: [...created, ...s.requests] }));
  },

  addRoomBooking: ({ room, date, slots }) => {
    const id = refOf("BKG", ROOM_SEQ_START + countRequests(get().requests, "BKG"));
    set((s) => ({
      requests: [
        {
          id,
          kind: "room",
          tier: "T3",
          name: room.name,
          serial: room.code,
          // Sending the request holds the room, but staff still decide whether
          // the hold becomes a visit — so it starts waiting, not confirmed.
          status: "pending",
          startDate: date,
          endDate: date,
          // Carried through so the room-use page can print the hours held.
          slots: [...slots].sort((a, b) => a - b),
        },
        ...s.requests,
      ],
    }));
  },

  setStatus: (requestId, status) =>
    set((s) => ({ statusOverrides: { ...s.statusOverrides, [requestId]: status } })),

  setRoomPhoto: (requestId, which, url) =>
    set((s) => ({
      roomUse: {
        ...s.roomUse,
        [requestId]: { ...s.roomUse[requestId], [which]: url },
      },
    })),

  cancel: (requestId) => get().setStatus(requestId, "cancelled"),

  clear: () => set({ requests: [], statusOverrides: {}, roomUse: {} }),
}));

export function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** How many numbers have already been issued under a prefix this session. */
function countRequests(requests: MyRequest[], prefix: string): number {
  return requests.filter((r) => r.id.startsWith(prefix)).length;
}
