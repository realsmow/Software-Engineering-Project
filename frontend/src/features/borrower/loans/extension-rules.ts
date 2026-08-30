import { CREDIT_BAND_POLICY } from "@/constants";
import type { CreditBand, Tier } from "@/types/domain";
import type { MyRequest } from "../mock-data";

/**
 * Who grants an extension on this loan.
 *
 * Shared by the home page and "my requests" so one loan cannot offer to extend
 * on one screen and refuse on the other.
 */
export type ExtensionMode =
  /** The borrower extends it here and now. */
  | "online"
  /** Online quota spent — staff inspect the item before granting more time. */
  | "staff"
  /** A supervisor decides. */
  | "supervisor"
  /** Already asked; waiting on whoever has to decide. */
  | "pending"
  /** Credit too low to extend at all; a fresh request is the only route. */
  | "blocked"
  /** Nothing to extend — rooms are held by the hour, not by the day. */
  | "none";

/**
 * Online extensions allowed per tier before staff must inspect the item.
 *
 * T0 is unlimited; T1 gets one, then alternates with an inspection; T2 always
 * goes through a supervisor; T3 is a fixed facility booked in hour slots, so
 * there is no loan period to stretch.
 */
const ONLINE_LIMIT: Record<Tier, number> = {
  T0: Infinity,
  T1: 1,
  T2: 0,
  T3: 0,
};

export interface ExtensionState {
  mode: ExtensionMode;
  /** The borrower can grant it themselves, right now. */
  canExtend: boolean;
  /** The borrower can ask someone else to grant it. */
  canRequest: boolean;
  /** True while a request is outstanding — it can be withdrawn, not repeated. */
  isPending: boolean;
  /** i18n key for the button label. */
  labelKey: string;
  /** i18n key for the line explaining quota, or who is deciding. */
  reasonKey: string;
  /**
   * What the borrower is agreeing to, shown between pressing "extend" and the
   * request actually going out. Asking for an inspection slot means promising
   * to carry the item in, so it should not happen on one stray click.
   */
  askNoteKey: string;
  /** i18n key for the confirm button — it names the commitment, not "OK". */
  confirmLabelKey: string;
  /** Interpolated into `reasonKey`; "∞" when the tier has no cap. */
  count: number | string;
}

const IDLE = {
  canExtend: false,
  canRequest: false,
  isPending: false,
  labelKey: "borrower.myRequests.extend",
  askNoteKey: "",
  confirmLabelKey: "",
  count: 0 as number | string,
};

/**
 * What extending this loan would take today.
 *
 * Every route except an outright credit block ends in a button the borrower
 * can press: either the extension happens on the spot, or a request goes to
 * whoever has to decide. Showing "you cannot" where the real answer is "ask
 * someone" would leave them with no way to try.
 *
 * Order matters: a credit block beats everything (there is no route at all), an
 * outstanding request beats the rules that produced it, a low band still
 * needing sign-off beats the tier rule, and only then does the online quota
 * decide.
 */
export function extensionState(row: MyRequest, band: CreditBand): ExtensionState {
  if (row.kind === "room" || row.tier === "T3") {
    return { ...IDLE, mode: "none", reasonKey: "borrower.myRequests.extQuotaNone" };
  }

  const policy = CREDIT_BAND_POLICY[band];
  if (policy.blocked) {
    return { ...IDLE, mode: "blocked", reasonKey: "borrower.myRequests.extQuotaBlocked" };
  }

  if (row.extensionPending) {
    return {
      ...IDLE,
      mode: "pending",
      isPending: true,
      labelKey: "borrower.myRequests.extPending",
      reasonKey: "borrower.myRequests.extPending",
    };
  }

  if (policy.needsSupervisor || row.tier === "T2") {
    return {
      ...IDLE,
      mode: "supervisor",
      canRequest: true,
      reasonKey: "borrower.myRequests.extQuotaSup",
      askNoteKey: "borrower.myRequests.extAskSup",
      confirmLabelKey: "borrower.myRequests.extAskYesSup",
    };
  }

  const left = onlineLeft(row);
  if (left <= 0) {
    return {
      ...IDLE,
      mode: "staff",
      canRequest: true,
      reasonKey: "borrower.myRequests.extQuotaNone",
      askNoteKey: "borrower.myRequests.extAskStaff",
      confirmLabelKey: "borrower.myRequests.extAskYesStaff",
    };
  }

  return {
    ...IDLE,
    mode: "online",
    canExtend: true,
    reasonKey: "borrower.myRequests.extQuota",
    count: left === Infinity ? "∞" : left,
  };
}

/** Online extensions still available on this loan, ignoring credit and tier gates. */
export function onlineLeft(row: MyRequest): number {
  const used = row.extensionsUsed ?? 0;
  return Math.max(0, ONLINE_LIMIT[row.tier] - used);
}
