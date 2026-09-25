import { fmtTime, toLocalDayKey } from "@/lib/datetime";
import type { Tier } from "@/types/domain";
import { TIME_SLOTS } from "../rooms/room-slots";
import type { MyRequest, MyRequestStatus } from "../request-status";

/**
 * `loan.list` rows, and the conversion to what the request pages render.
 *
 * ── What this can and cannot fill in ──────────────────────────────────────
 * `requestOutput` describes a *reservation*: what was asked for, where the
 * approval got to, and whether it can still be called off. It does not carry
 * the loan that follows one. Once a UsageLog exists, however, the response
 * includes its authoritative due time so preparation and approved extensions
 * are reflected here instead of leaving the original requested date on screen.
 */
export interface ServerRequest {
  reservationKey: number;
  status: MyRequestStatus;
  resource: {
    resourceKey: number;
    name: string | null;
    /** Asset tag for equipment, null for a room. */
    serialNo: string | null;
    kind: "equipment" | "room";
    tier: Tier | null;
    creditWeight: number;
  };
  startTime: string;
  endTime: string;
  reason: string | null;
  /** Why it ended: the approver's rejection reason or the borrower's cancel note. */
  decisionNote: string | null;
  requestedAt: string;
  /** When an approved request stops being held for the borrower. */
  expiresAt: string | null;
  approval: {
    route: "auto" | "staff" | "supervisor";
    status: "Pending" | "Approved" | "Rejected" | "Canceled";
    autoApproved: boolean;
    approvedAt: string | null;
    resolvedAt: string | null;
  };
  /** Set once staff have prepared a unit. */
  usageKey: number | null;
  /** Current UsageLog deadline; null until the request has become a loan. */
  dueAt: string | null;
  /** True while `loan.cancel` would still be accepted. */
  cancellable: boolean;
}

/** A request plus the facts the pages need that MyRequest leaves optional. */
export interface BorrowerRequest extends MyRequest {
  reservationKey: number;
  cancellable: boolean;
  /** Null until staff set a unit aside. */
  usageKey: number | null;
}

export function toBorrowerRequest(s: ServerRequest): BorrowerRequest {
  const dueDate = s.dueAt ? toLocalDayKey(s.dueAt) : undefined;
  return {
    reservationKey: s.reservationKey,
    cancellable: s.cancellable,
    usageKey: s.usageKey,

    // The reservation key is the reference number a borrower quotes at the
    // counter, so it is shown as-is rather than dressed up as "REQ-2569-…";
    // inventing a format here would print something staff cannot search for.
    id: String(s.reservationKey),
    kind: s.resource.kind,
    // Left null rather than defaulted: showing an unclassified unit as T2 put a
    // tier on screen the server never gave it.
    tier: s.resource.tier,
    name: s.resource.name ?? "",
    serial: s.resource.serialNo ?? "-",
    status: s.status,
    decisionNote: s.decisionNote,
    // The Bangkok day, not the UTC one. `slice(0, 10)` on the ISO string names
    // the UTC day, which is the day before for anything the borrower holds in
    // the first seven hours of a Bangkok morning.
    startDate: toLocalDayKey(s.startTime),
    endDate: toLocalDayKey(s.endTime),
    pickupTime: fmtTime(s.startTime),
    returnTime: fmtTime(s.dueAt ?? s.endTime),
    dueAt: dueDate,
    daysLeft: dueDate ? calendarDayDifference(dueDate, toLocalDayKey(new Date())) : undefined,
    ...(s.resource.kind === "room" ? { slots: slotsOf(s.startTime, s.endTime) } : {}),
  };
}

/**
 * A room booking's chips, recovered from its window.
 *
 * The server stores a start and an end, not the chips that were tapped, so the
 * room pages get them back by wall-clock time: a slot belongs to the booking
 * when it starts at or after the start and ends at or before the end. A booking
 * never spans lunch, so no slot inside that range is one it skipped.
 */
function slotsOf(startTime: string, endTime: string): number[] {
  const from = fmtTime(startTime);
  const to = fmtTime(endTime);
  return TIME_SLOTS.flatMap((slot, i) => (slot.start >= from && slot.end <= to ? [i] : []));
}

/** Difference between YYYY-MM-DD values without depending on the browser timezone. */
function calendarDayDifference(later: string, earlier: string): number {
  return Math.round(
    (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000,
  );
}
