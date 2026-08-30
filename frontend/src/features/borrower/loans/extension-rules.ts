import { CREDIT_BAND_POLICY } from "@/constants";
import type { CreditBand, Tier } from "@/types/domain";
import type { MyRequest } from "../mock-data";

/**
 * Who can grant an extension, and whether the borrower can do it themselves.
 *
 * Shared by the home page and "my requests" so one loan cannot offer to extend
 * on one screen and refuse on the other.
 */
export type ExtensionMode =
  /** The borrower extends it here and now. */
  | "online"
  /** Online quota spent — the item has to be brought in for inspection first. */
  | "staff"
  /** Needs a supervisor's decision. */
  | "supervisor"
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
  /** True only for `online` — every other mode is somebody else's decision. */
  canExtend: boolean;
  /** i18n key describing the remaining quota, for the line under the loan. */
  reasonKey: string;
  /** Interpolated into `reasonKey`; "∞" when the tier has no cap. */
  count: number | string;
}

/**
 * What extending this loan would take today.
 *
 * Order matters: a credit block beats everything (there is no route at all), a
 * low band still needing sign-off beats the tier rule, and only then does the
 * per-tier online quota decide.
 */
export function extensionState(row: MyRequest, band: CreditBand): ExtensionState {
  if (row.kind === "room" || row.tier === "T3") {
    return { mode: "none", canExtend: false, reasonKey: "borrower.myRequests.extQuotaNone", count: 0 };
  }

  const policy = CREDIT_BAND_POLICY[band];
  if (policy.blocked) {
    return { mode: "blocked", canExtend: false, reasonKey: "borrower.myRequests.extQuotaBlocked", count: 0 };
  }
  if (policy.needsSupervisor || row.tier === "T2") {
    return { mode: "supervisor", canExtend: false, reasonKey: "borrower.myRequests.extQuotaSup", count: 0 };
  }

  const left = onlineLeft(row);
  if (left <= 0) {
    return { mode: "staff", canExtend: false, reasonKey: "borrower.myRequests.extQuotaNone", count: 0 };
  }
  return {
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
