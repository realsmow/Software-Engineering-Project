import { describe, expect, it } from "vitest";
import { extensionStateFromServer } from "../../src/features/borrower/loans/extension-rules";
import type { ServerExtensionOptions } from "../../src/features/borrower/loans/extension.adapter";
import {
  extensionOutput,
  extensionOptionsOutput,
} from "../../../backend/src/loan/loan.schema";
import { fmtDateTime } from "../../src/lib/datetime";

const MAX = "2026-10-08T09:07:06.947Z";

function options(changes: Partial<ServerExtensionOptions>): ServerExtensionOptions {
  return extensionOptionsOutput.strict().parse({
    usageKey: 7,
    canRequest: true,
    blockedBy: null,
    route: "auto",
    requiresInspection: false,
    currentDueAt: "2026-09-28T09:07:06.947Z",
    maxRequestedDueAt: MAX,
    extensionsUsed: 1,
    extensionsAllowed: 2,
    pendingExtensionKey: null,
    ...changes,
  });
}

const PENDING = extensionOutput.strict().parse({
  extensionKey: 99,
  usageKey: 7,
  status: "Pending",
  route: "staff",
  requiresInspection: true,
  autoApproved: false,
  extendNo: 2,
  previousDueAt: "2026-09-28T09:07:06.947Z",
  requestedDueAt: MAX,
  dueAt: "2026-09-28T09:07:06.947Z",
  requestedAt: "2026-09-26T10:00:00.000Z",
  resolvedAt: null,
  itemName: "Oscilloscope",
  serialNo: "EE-OSC-001",
  tier: "T1",
  extensionsUsed: 1,
  extensionsAllowed: 2,
});

describe("extensionStateFromServer", () => {
  it("takes the route, the quota left and the new due date from the server", () => {
    const state = extensionStateFromServer(options({ route: "auto" }));

    expect(state.mode).toBe("online");
    expect(state.canRequest).toBe(true);
    expect(state.newDueAt).toBe(MAX);
    expect(state.values).toEqual({ count: 1, date: fmtDateTime(MAX) });
    expect(state.confirmLabelKey).toBe("borrower.myRequests.extAskYesAuto");
  });

  it("routes to staff or a supervisor exactly as the server says, whatever the tier", () => {
    expect(
      extensionStateFromServer(options({ route: "staff", requiresInspection: true })).mode
    ).toBe("staff");
    expect(
      extensionStateFromServer(options({ route: "supervisor", requiresInspection: true }))
        .mode
    ).toBe("supervisor");
  });

  it("reports a pending request with the desk it went to, and offers no second request", () => {
    const state = extensionStateFromServer(
      options({
        canRequest: false,
        blockedBy: "EXTENSION_ALREADY_PENDING",
        route: null,
        pendingExtensionKey: 99,
      }),
      PENDING
    );

    expect(state.mode).toBe("pending");
    expect(state.isPending).toBe(true);
    expect(state.canRequest).toBe(false);
    expect(state.reasonKey).toBe("borrower.myRequests.extPendingStaff");
    expect(state.values).toEqual({ date: fmtDateTime(MAX) });
  });

  it.each([
    ["CREDIT_TOO_LOW", "borrower.myRequests.extQuotaBlocked"],
    ["EXTENSION_QUOTA_EXCEEDED", "borrower.myRequests.extBlockedQuota"],
    ["WINDOW_NOT_AVAILABLE", "borrower.myRequests.extBlockedWindow"],
    ["INVALID_EXTENSION_WINDOW", "borrower.myRequests.extBlockedOverdue"],
    ["WRONG_LOAN_STATE", "borrower.myRequests.extBlockedNotCollected"],
    ["NOT_ELIGIBLE", "borrower.myRequests.extBlockedOther"],
  ])("explains a %s refusal with %s", (code, key) => {
    const state = extensionStateFromServer(
      options({ canRequest: false, blockedBy: code, route: null })
    );

    expect(state.mode).toBe("blocked");
    expect(state.canRequest).toBe(false);
    expect(state.reasonKey).toBe(key);
  });
});
