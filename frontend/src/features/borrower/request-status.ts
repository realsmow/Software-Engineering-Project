/**
 * "My requests" (borrow + booking) status model: the request shape, its
 * progress steps, and the active/history tab it falls into.
 */
import type { Tier } from "@/types/domain";

/**
 * Requests are atomic: one physical item is one request, with its own number
 * and its own approval - matching `Reservations` in the backend schema, where
 * every row carries a `ReservationKey` and an `ApproveStatus` of its own and
 * nothing groups them into a parent document.
 *
 * So submitting a basket of five items produces five independent requests that
 * move at their own speed: a T2 item can sit waiting for a supervisor while the
 * T0 item sent alongside it is already collected.
 */
export type RequestKind = "equipment" | "room";

export type MyRequestStatus =
  | "pending"
  | "approved"
  | "preparing"
  | "ready"
  | "inUse"
  /** Back at the counter, not yet graded. The server never splits this in two. */
  | "returned"
  | "done"
  | "rejected"
  | "cancelled";

/**
 * Progress steps shown under each card. Equipment runs the full handling
 * chain; a room is checked in and out with photos instead of being issued and
 * inspected, so it gets its own shorter track.
 *
 * Returning and inspecting are one step, not two: the borrower hands the item
 * back at the counter and staff photograph it and check its condition right
 * there, in the same visit. Splitting them would imply the borrower has a
 * second thing to do after returning, which they do not - so `returned`
 * (back, not yet graded) sits on that final step until grading makes it `done`.
 */
const EQUIPMENT_STEPS = [
  "stepSubmit",
  "stepApprove",
  "stepPrepare",
  "stepPickup",
  "stepUse",
  "stepReturnInspect",
] as const;

const ROOM_STEPS = [
  "stepSubmit",
  "stepConfirm",
  "stepPhotoBefore",
  "stepRoomUse",
  "stepPhotoAfter",
] as const;

export function stepsOf(kind: RequestKind): readonly string[] {
  return kind === "room" ? ROOM_STEPS : EQUIPMENT_STEPS;
}

/**
 * How far along the track each status sits - the index of the step currently
 * in play. Terminal failures stay where they stopped rather than pretending to
 * have advanced.
 *
 * Because the highlighted step is the one *being worked on*, its label has to
 * name a stage, not an outcome: "Approval", never "Approved". A past-tense
 * label lands a bold green "Approved" right beside the "Awaiting approval"
 * badge and reads as the opposite of the truth.
 */
const EQUIPMENT_STEP_AT: Record<MyRequestStatus, number> = {
  pending: 1,
  approved: 2,
  preparing: 2,
  ready: 3,
  inUse: 4,
  // Returning and inspecting are one counter visit, not two (see EQUIPMENT_STEPS).
  returned: 5,
  done: EQUIPMENT_STEPS.length,
  rejected: 1,
  cancelled: 0,
};

const ROOM_STEP_AT: Record<MyRequestStatus, number> = {
  pending: 1,
  approved: 1,
  preparing: 1,
  ready: 2,
  inUse: 3,
  returned: 4,
  done: ROOM_STEPS.length,
  rejected: 1,
  cancelled: 0,
};

export function stepAt(status: MyRequestStatus, kind: RequestKind): number {
  return kind === "room" ? ROOM_STEP_AT[status] : EQUIPMENT_STEP_AT[status];
}

export type RequestTab = "active" | "using" | "history";

export const REQUEST_TABS: RequestTab[] = ["active", "using", "history"];

export const STATUS_TAB: Record<MyRequestStatus, RequestTab> = {
  pending: "active",
  approved: "active",
  preparing: "active",
  ready: "active",
  inUse: "using",
  returned: "history",
  done: "history",
  rejected: "history",
  cancelled: "history",
};

export interface MyRequest {
  /** The reservation number, e.g. "REQ-2569-00431". One per item - see above. */
  id: string;
  /** Backend Reservations.ReservationKey; absent on session-only room bookings. */
  reservationKey?: number;
  /** Backend's authoritative answer for whether loan.cancel is still allowed. */
  cancellable?: boolean;
  /** Present after staff allocate the request; absent on local room bookings. */
  usageKey?: number | null;
  kind: RequestKind;
  /** Null when the server could not classify the unit; never guessed. */
  tier: Tier | null;
  name: string;
  /** Unit serial, or the room code for a booking. */
  serial: string;
  status: MyRequestStatus;
  /** Why a rejected or cancelled request ended, as the server recorded it. */
  decisionNote?: string | null;
  startDate: string;
  endDate: string;
  /** Requested counter times for equipment. Rooms use `slots` instead. */
  pickupTime?: string;
  returnTime?: string;
  /** Equipment on loan: when it is due back, and how far off that is. */
  dueAt?: string;
  daysLeft?: number;
  /**
   * Room bookings only: the periods reserved, as indices into `TIME_SLOTS`.
   * Equipment is borrowed by the day and has no slots, hence optional.
   *
   * The set is fixed at booking time - a room is held for the hours picked and
   * nothing more, so there is no extension to widen it later.
   */
  slots?: number[];
}

/**
 * Booking statuses that still hold the room.
 *
 * Sending the request is what reserves it - approval only decides whether the
 * hold turns into a visit. So a booking still awaiting staff counts exactly as
 * much as one already in use, and the hours are released only when it is
 * cancelled, rejected, or finished.
 */
const ACTIVE_ROOM_STATUSES: readonly MyRequestStatus[] = ["pending", "ready", "inUse"];

export function activeRoomBookings(requests: readonly MyRequest[]): MyRequest[] {
  return requests.filter((r) => r.kind === "room" && ACTIVE_ROOM_STATUSES.includes(r.status));
}
