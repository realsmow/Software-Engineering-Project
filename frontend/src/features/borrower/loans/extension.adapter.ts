import type { Tier } from "@/types/domain";

/**
 * The extension shapes the server sends (`extensionOptionsOutput` and
 * `extensionOutput` in backend/src/loan/loan.schema.ts).
 *
 * `extensionOptions` is a dry run of `requestExtension`: the same checks with
 * no writes. That matters here because the frontend used to decide the route
 * itself, in `extension-rules.ts`, from a copy of the tier quotas and credit
 * bands. Two implementations of SRS 5.4 and 5.7 is one too many, so the server
 * now answers and this file only translates.
 */
export type ExtensionRoute = "auto" | "staff" | "supervisor";
/** `approveStatus` in backend/src/common/schemas/status.schema.ts. */
export type ApproveStatus = "Pending" | "Approved" | "Rejected" | "Canceled";

export interface ServerExtensionOptions {
  usageKey: number;
  canRequest: boolean;
  /** The BusinessError code `requestExtension` would throw. Null when it would work. */
  blockedBy: string | null;
  route: ExtensionRoute | null;
  requiresInspection: boolean;
  currentDueAt: string;
  /** Furthest date the borrower's band would accept. */
  maxRequestedDueAt: string;
  extensionsUsed: number;
  extensionsAllowed: number;
  /** An extension already waiting on somebody, if there is one. */
  pendingExtensionKey: number | null;
}

export interface ServerExtension {
  extensionKey: number;
  usageKey: number;
  status: ApproveStatus;
  route: ExtensionRoute;
  requiresInspection: boolean;
  autoApproved: boolean;
  extendNo: number | null;
  previousDueAt: string;
  requestedDueAt: string;
  /** The loan's due date now; already moved when the request was auto-granted. */
  dueAt: string;
  requestedAt: string;
  resolvedAt: string | null;
  itemName: string | null;
  serialNo: string | null;
  tier: Tier | null;
  extensionsUsed: number;
  extensionsAllowed: number;
}
