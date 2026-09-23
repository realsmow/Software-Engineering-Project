import { create } from "zustand";
import { addDays, format, parseISO } from "date-fns";
import { todayLocalDayKey } from "@/lib/datetime";
import { BUSINESS } from "@/constants";
import { type MyRequest } from "../mock-data";

/**
 * Requests submitted during this session.
 *
 * Every request, equipment and room, lives in the backend now. What remains is
 * the local layer the loan pages still write over server rows.
 */
interface SubmittedRequestsState {
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
  /** Rewrites fields of one request, whichever source it came from. */
  patch: (requestId: string, changes: Partial<MyRequest>) => void;
  /** Pushes the due date out by one online extension. Callers gate on `extensionState`. */
  extendLoan: (row: MyRequest) => void;
  /** Asks staff or a supervisor for more time, when the borrower cannot grant it. */
  requestExtension: (row: MyRequest, decidedBy: "staff" | "supervisor") => void;
  /** Withdraws that request; the loan goes back to whatever it was before. */
  cancelExtensionRequest: (requestId: string) => void;
  /** Sends an appeal against an inspection verdict to a supervisor. */
  sendAppeal: (requestId: string) => void;
  clear: () => void;
}

export const useSubmittedRequests = create<SubmittedRequestsState>((set, get) => ({
  overrides: {},

  patch: (requestId, changes) =>
    set((s) => ({
      overrides: { ...s.overrides, [requestId]: { ...s.overrides[requestId], ...changes } },
    })),

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

  clear: () => set({ overrides: {} }),
}));

/** Today at the counter, not in whatever timezone the browser is set to. */
export function todayIso(): string {
  return todayLocalDayKey();
}
