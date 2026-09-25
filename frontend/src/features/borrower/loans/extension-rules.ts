import { fmtDateTime } from "@/lib/datetime";
import type { ServerExtension, ServerExtensionOptions } from "./extension.adapter";

/**
 * What the extend control on a loan shows, translated from the server's answer.
 *
 * Shared by the home page and "my requests" so one loan cannot offer to extend
 * on one screen and refuse on the other. Nothing here decides a rule: the
 * route, the quota and the furthest due date all come from
 * `loan.extensionOptions`, which runs the same checks `loan.requestExtension`
 * will run.
 */
export type ExtensionMode =
  /** Granted the moment it is asked for. */
  | "online"
  /** Staff check the item at the counter before granting it. */
  | "staff"
  /** A supervisor decides. */
  | "supervisor"
  /** Already asked; waiting on whoever has to decide. */
  | "pending"
  /** The server would refuse it; `reasonKey` says why. */
  | "blocked"
  /** The server has not answered yet. */
  | "loading"
  /** Nothing to extend: not on loan, or a room booked by the hour. */
  | "none";

export interface ExtensionState {
  mode: ExtensionMode;
  /** Pressing the button would send a request the server says it accepts. */
  canRequest: boolean;
  /** True while a request is outstanding - it can be withdrawn, not repeated. */
  isPending: boolean;
  /** i18n key for the button label. */
  labelKey: string;
  /** i18n key for the line explaining quota, route, or who is deciding. */
  reasonKey: string;
  /** Interpolation values for `reasonKey` and `askNoteKey`. */
  values: Record<string, string | number>;
  /**
   * What the borrower is agreeing to, shown between pressing "extend" and the
   * request actually going out. It names the new due date and who decides, so
   * neither is a surprise after the fact.
   */
  askNoteKey: string;
  /** i18n key for the confirm button - it names the commitment, not "OK". */
  confirmLabelKey: string;
  /** The due date the request would ask for, as the server reported it. */
  newDueAt: string | null;
}

const IDLE: ExtensionState = {
  mode: "none",
  canRequest: false,
  isPending: false,
  labelKey: "borrower.myRequests.extend",
  reasonKey: "",
  values: {},
  askNoteKey: "",
  confirmLabelKey: "",
  newDueAt: null,
};

export const NO_EXTENSION: ExtensionState = IDLE;

export const EXTENSION_LOADING: ExtensionState = {
  ...IDLE,
  mode: "loading",
  reasonKey: "common.loading",
};

/**
 * `blockedBy` is the BusinessError code the write path would have thrown.
 * They are genuinely different refusals: telling an overdue borrower their
 * credit band is the problem sends them to fix the wrong thing.
 */
const BLOCKED_REASON: Record<string, string> = {
  CREDIT_TOO_LOW: "borrower.myRequests.extQuotaBlocked",
  EXTENSION_QUOTA_EXCEEDED: "borrower.myRequests.extBlockedQuota",
  WINDOW_NOT_AVAILABLE: "borrower.myRequests.extBlockedWindow",
  INVALID_EXTENSION_WINDOW: "borrower.myRequests.extBlockedOverdue",
  // Seen on a loan that has been set aside but not yet picked up.
  WRONG_LOAN_STATE: "borrower.myRequests.extBlockedNotCollected",
  ROOM_NOT_EXTENDABLE: "borrower.myRequests.extBlockedRoom",
};

const PENDING_REASON: Record<ServerExtension["route"], string> = {
  // An auto request is granted inside the call, so it is never left pending.
  auto: "borrower.myRequests.extPending",
  staff: "borrower.myRequests.extPendingStaff",
  supervisor: "borrower.myRequests.extPendingSup",
};

/**
 * The state for one loan.
 *
 * `pending` is the open request from `loan.myExtensions`, when there is one.
 * The options only carry its key; the row says which desk it went to and what
 * date was asked for, which is what the borrower needs to know next (carry the
 * item in, or wait).
 */
export function extensionStateFromServer(
  o: ServerExtensionOptions,
  pending: ServerExtension | null = null,
): ExtensionState {
  if (o.pendingExtensionKey !== null) {
    return {
      ...IDLE,
      mode: "pending",
      isPending: true,
      labelKey: "borrower.myRequests.extPending",
      reasonKey: pending ? PENDING_REASON[pending.route] : "borrower.myRequests.extPending",
      values: pending ? { date: fmtDateTime(pending.requestedDueAt) } : {},
    };
  }

  if (!o.canRequest) {
    return {
      ...IDLE,
      mode: "blocked",
      reasonKey: (o.blockedBy && BLOCKED_REASON[o.blockedBy]) ?? "borrower.myRequests.extBlockedOther",
    };
  }

  const left = Math.max(0, o.extensionsAllowed - o.extensionsUsed);
  const asking = {
    ...IDLE,
    canRequest: true,
    values: { count: left, date: fmtDateTime(o.maxRequestedDueAt) },
    newDueAt: o.maxRequestedDueAt,
  };

  if (o.route === "supervisor") {
    return {
      ...asking,
      mode: "supervisor",
      reasonKey: "borrower.myRequests.extQuotaSup",
      askNoteKey: "borrower.myRequests.extAskSup",
      confirmLabelKey: "borrower.myRequests.extAskYesSup",
    };
  }

  if (o.route === "staff") {
    return {
      ...asking,
      mode: "staff",
      reasonKey: "borrower.myRequests.extQuotaNone",
      askNoteKey: "borrower.myRequests.extAskStaff",
      confirmLabelKey: "borrower.myRequests.extAskYesStaff",
    };
  }

  // route === "auto": granted the moment it is asked for.
  return {
    ...asking,
    mode: "online",
    reasonKey: "borrower.myRequests.extAuto",
    askNoteKey: "borrower.myRequests.extAskAuto",
    confirmLabelKey: "borrower.myRequests.extAskYesAuto",
  };
}
