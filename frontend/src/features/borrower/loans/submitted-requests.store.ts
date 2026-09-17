import { create } from "zustand";
import { addDays, format, parseISO } from "date-fns";
import { todayLocalDayKey } from "@/lib/datetime";
import { BUSINESS } from "@/constants";
import { type MyRequest, type MyRequestStatus, type Room } from "../mock-data";
import {
  releaseBorrowerImage,
  type PreparedBorrowerImage,
} from "../uploads/prepared-image";

/**
 * Requests submitted during this session.
 *
 * Equipment requests now live in the backend. This session-only store remains
 * for room bookings (whose API is not wired yet) and local UI-only overrides.
 */
/** Room condition photos selected by the borrower and ready for a signed upload. */
export interface RoomUseShots {
  before?: PreparedBorrowerImage;
  after?: PreparedBorrowerImage;
}

interface SubmittedRequestsState {
  requests: MyRequest[];
  /**
   * Field changes applied on top of whatever `useMyRequests` merged.
   *
   * They live apart from `requests` because half the list comes from
   * `MY_REQUESTS`, a module constant nothing can rewrite. Without this layer
   * only requests submitted in this same session could ever move - which is
   * why "cancel" used to do nothing on a seeded row.
   *
   * A whole `Partial<MyRequest>` rather than just a status: collecting an item
   * sets its status and its due date in the same breath, and one map that
   * carries both beats three maps that have to be kept in step.
   */
  overrides: Record<string, Partial<MyRequest>>;
  /** Room bookings only, keyed by reservation number. */
  roomUse: Record<string, RoomUseShots>;

  addRoomBooking: (input: { room: Room; date: string; slots: number[] }) => void;
  /** Rewrites fields of one request, whichever source it came from. */
  patch: (requestId: string, changes: Partial<MyRequest>) => void;
  /** Moves a request - check-in and check-out on the room-use page. */
  setStatus: (requestId: string, status: MyRequestStatus) => void;
  /** Pushes the due date out by one online extension. Callers gate on `extensionState`. */
  extendLoan: (row: MyRequest) => void;
  /** Asks staff or a supervisor for more time, when the borrower cannot grant it. */
  requestExtension: (row: MyRequest, decidedBy: "staff" | "supervisor") => void;
  /** Withdraws that request; the loan goes back to whatever it was before. */
  cancelExtensionRequest: (requestId: string) => void;
  /** Sends an appeal against an inspection verdict to a supervisor. */
  sendAppeal: (requestId: string) => void;
  /** Stores (or clears, with `undefined`) one of the two room photos. */
  setRoomPhoto: (
    requestId: string,
    which: keyof RoomUseShots,
    image?: PreparedBorrowerImage,
  ) => void;
  cancel: (requestId: string) => void;
  clear: () => void;
}

/**
 * Reference numbers restart at these each session because nothing persists.
 * The server issues the real ones.
 */
const ROOM_SEQ_START = 41;

function refOf(prefix: string, seq: number): string {
  return `${prefix}-2569-${String(seq).padStart(5, "0")}`;
}

export const useSubmittedRequests = create<SubmittedRequestsState>((set, get) => ({
  requests: [],
  overrides: {},
  roomUse: {},

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
          // the hold becomes a visit - so it starts waiting, not confirmed.
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

  patch: (requestId, changes) =>
    set((s) => ({
      overrides: { ...s.overrides, [requestId]: { ...s.overrides[requestId], ...changes } },
    })),

  setStatus: (requestId, status) => get().patch(requestId, { status }),

  extendLoan: (row) => {
    const days = BUSINESS.EXTENSION_DAYS;
    // Measured from the current due date, not from today: extending early
    // should add time rather than quietly reset the loan to a shorter window.
    const due = row.dueAt ?? row.endDate;
    get().patch(row.id, {
      dueAt: format(addDays(parseISO(due), days), "yyyy-MM-dd"),
      daysLeft: (row.daysLeft ?? 0) + days,
      extensionsUsed: (row.extensionsUsed ?? 0) + 1,
    });
  },

  // TODO: POST /loans/:id/extension-requests. Nothing here can approve it -
  // staff and supervisor screens are another dev's, so it simply waits.
  requestExtension: (row, decidedBy) => get().patch(row.id, { extensionPending: decidedBy }),

  cancelExtensionRequest: (requestId) => get().patch(requestId, { extensionPending: undefined }),

  // TODO: POST /appeals with { requestId, reason, photo }. Only the fact that
  // it was sent is kept here; the supervisor's verdict is theirs to record, and
  // there is no withdrawing an appeal once a supervisor is looking at it.
  sendAppeal: (requestId) => get().patch(requestId, { appealSent: true }),

  setRoomPhoto: (requestId, which, image) => {
    const previous = get().roomUse[requestId]?.[which];
    if (previous !== image) releaseBorrowerImage(previous);

    set((s) => ({
      roomUse: {
        ...s.roomUse,
        [requestId]: { ...s.roomUse[requestId], [which]: image },
      },
    }));
  },

  cancel: (requestId) => {
    releaseRoomShots(get().roomUse[requestId]);
    set((s) => {
      const roomUse = { ...s.roomUse };
      delete roomUse[requestId];
      return { roomUse };
    });
    get().setStatus(requestId, "cancelled");
  },

  clear: () => {
    for (const shots of Object.values(get().roomUse)) releaseRoomShots(shots);
    set({ requests: [], overrides: {}, roomUse: {} });
  },
}));

function releaseRoomShots(shots: RoomUseShots | undefined): void {
  releaseBorrowerImage(shots?.before);
  releaseBorrowerImage(shots?.after);
}

/** Today at the counter, not in whatever timezone the browser is set to. */
export function todayIso(): string {
  return todayLocalDayKey();
}

/** How many numbers have already been issued under a prefix this session. */
function countRequests(requests: MyRequest[], prefix: string): number {
  return requests.filter((r) => r.id.startsWith(prefix)).length;
}
