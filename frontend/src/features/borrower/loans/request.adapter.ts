import type { Tier } from "@/types/domain";
import type { MyRequest, MyRequestStatus } from "../mock-data";

/**
 * `loan.list` rows, and the conversion to what the request pages render.
 *
 * ── What this can and cannot fill in ──────────────────────────────────────
 * `requestOutput` describes a *reservation*: what was asked for, where the
 * approval got to, and whether it can still be called off. It does not carry
 * the loan that follows one. So `dueAt`, `daysLeft`, `extensionsUsed` and the
 * inspection verdict are absent here and are left undefined rather than
 * guessed - a due date invented on the client is the kind of number a borrower
 * plans around and then misses.
 *
 * Filling them needs a borrower-side view of UsageLog (staff have
 * `loan.getForStaff`; there is no borrower equivalent yet).
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
  /** True while `loan.cancel` would still be accepted. */
  cancellable: boolean;
}

/** A request plus the two facts the pages need that MyRequest has no room for. */
export interface BorrowerRequest extends MyRequest {
  reservationKey: number;
  cancellable: boolean;
  /** Null until staff set a unit aside. */
  usageKey: number | null;
}

export function toBorrowerRequest(s: ServerRequest): BorrowerRequest {
  return {
    reservationKey: s.reservationKey,
    cancellable: s.cancellable,
    usageKey: s.usageKey,

    // The reservation key is the reference number a borrower quotes at the
    // counter, so it is shown as-is rather than dressed up as "REQ-2569-…";
    // inventing a format here would print something staff cannot search for.
    id: String(s.reservationKey),
    kind: s.resource.kind,
    // A request for an unclassified item should not claim a tier it has not
    // got. T2 is the safe display default: it is the one that says "a human
    // has to look at this".
    tier: s.resource.tier ?? "T2",
    name: s.resource.name ?? "",
    serial: s.resource.serialNo ?? "-",
    status: s.status,
    startDate: s.startTime.slice(0, 10),
    endDate: s.endTime.slice(0, 10),
  };
}
