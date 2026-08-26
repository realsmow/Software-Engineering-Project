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
 * One item is one request, matching `Reservations` in the backend schema - a
 * basket of five produces five numbered requests, not one with five lines.
 *
 * NOTE: memory only - a refresh drops these, same as the draft store. The
 * backend owns them for real (POST /loan-requests → GET /loan-requests?me=1).
 */
interface SubmittedRequestsState {
  requests: MyRequest[];
  /** Issues one numbered request per unit. */
  addEquipmentRequest: (input: {
    units: RequestUnit[];
    startDate: string;
    endDate: string;
    /** T2 (or low credit) items wait for a supervisor; the rest auto-approve. */
    needsSupervisor: boolean;
  }) => void;
  addRoomBooking: (input: { room: Room; date: string }) => void;
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

  addEquipmentRequest: ({ units, startDate, endDate, needsSupervisor }) => {
    if (units.length === 0) return;
    // Each unit gets the next number in sequence - nothing ties them together.
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
          serial: unit.serial ?? "-",
          status,
          startDate,
          endDate,
        },
      ];
    });

    set((s) => ({ requests: [...created, ...s.requests] }));
  },

  addRoomBooking: ({ room, date }) => {
    const id = refOf("BKG", ROOM_SEQ_START + countRequests(get().requests, "BKG"));
    set((s) => ({
      requests: [
        {
          id,
          kind: "room",
          tier: "T3",
          name: room.name,
          serial: room.code,
          // Rooms are entitlement-checked and confirmed on the spot.
          status: "ready",
          startDate: date,
          endDate: date,
        },
        ...s.requests,
      ],
    }));
  },

  cancel: (requestId) =>
    set((s) => ({
      requests: s.requests.map((r) =>
        r.id === requestId ? { ...r, status: "cancelled" } : r,
      ),
    })),

  clear: () => set({ requests: [] }),
}));

export function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** How many numbers have already been issued under a prefix this session. */
function countRequests(requests: MyRequest[], prefix: string): number {
  return requests.filter((r) => r.id.startsWith(prefix)).length;
}
