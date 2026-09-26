import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import SupervisorApprovalsPage from "../../src/features/supervisor/approvals/approvals-queue-page";
import {
  approvalCounts,
  approvalQueueRow,
  decideApprovalOutput,
} from "../../../backend/src/approval/approval.schema";
import { extensionReviewRow } from "../../../backend/src/loan/loan.schema";
import { extensionResponse, requestResponse } from "../fixtures/api-responses";
import { mutationResult, queryResult } from "../fixtures/query-results";

const hooks = vi.hoisted(() => ({
  // FR-EQP-08 tab, not under test here: always empty.
  useRetirementQueue: vi.fn(() => ({ data: { items: [], total: 0 }, isLoading: false })),
  useDecideRetirement: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useApprovalCounts:
    vi.fn<
      typeof import("../../src/features/supervisor/approvals/use-approvals").useApprovalCounts
    >(),
  useApprovalQueue:
    vi.fn<
      typeof import("../../src/features/supervisor/approvals/use-approvals").useApprovalQueue
    >(),
  useDecideApproval:
    vi.fn<
      typeof import("../../src/features/supervisor/approvals/use-approvals").useDecideApproval
    >(),
  useExtensionQueue:
    vi.fn<
      typeof import("../../src/features/supervisor/approvals/use-approvals").useExtensionQueue
    >(),
  useDecideExtension:
    vi.fn<
      typeof import("../../src/features/supervisor/approvals/use-approvals").useDecideExtension
    >(),
}));

vi.mock("../../src/features/supervisor/approvals/use-approvals", () => hooks);

const borrower = {
  accountKey: 42,
  studentId: "S12345",
  firstName: "Ada",
  lastName: "Lovelace",
  creditScore: 65,
};

const request = approvalQueueRow.strict().parse({
  reservationKey: 77,
  requestedAt: "2026-09-24T08:00:00.000Z",
  borrower,
  creditTier: "D1",
  route: "supervisor",
  resourceKey: 7,
  itemName: "Oscilloscope",
  serialNo: "OSC-001",
  kind: "equipment",
  tier: "T2",
  startTime: "2026-10-01T06:00:00.000Z",
  endTime: "2026-10-02T06:00:00.000Z",
  requestedDays: 2,
  reason: "Lab project",
  clashesWith: [],
});

const extension = extensionReviewRow.strict().parse({
  extensionKey: 12,
  usageKey: 9,
  borrower,
  creditTier: "D1",
  route: "supervisor",
  itemName: "Oscilloscope",
  serialNo: "OSC-001",
  tier: "T2",
  extendNo: 1,
  previousDueAt: "2026-10-02T06:00:00.000Z",
  requestedDueAt: "2026-10-03T06:00:00.000Z",
  requestedAt: "2026-09-24T08:00:00.000Z",
  reason: null,
  status: "Pending",
});

describe("SupervisorApprovalsPage", () => {
  const decide =
    vi.fn<
      ReturnType<
        typeof import("../../src/features/supervisor/approvals/use-approvals").useDecideApproval
      >["mutateAsync"]
    >();
  const decideExtension =
    vi.fn<
      ReturnType<
        typeof import("../../src/features/supervisor/approvals/use-approvals").useDecideExtension
      >["mutateAsync"]
    >();

  beforeEach(() => {
    vi.clearAllMocks();
    void i18n.changeLanguage("en");
    hooks.useApprovalCounts.mockReturnValue(
      queryResult(
        approvalCounts.strict().parse({
          staff: 0,
          supervisor: 1,
          retirement: 0,
          overdueToDecide: 0,
          autoApprovedToday: 0,
          asOf: null,
        })
      )
    );
    hooks.useApprovalQueue.mockReturnValue(queryResult([request]));
    hooks.useExtensionQueue.mockReturnValue(queryResult([extension]));
    hooks.useDecideApproval.mockReturnValue(mutationResult(decide));
    hooks.useDecideExtension.mockReturnValue(mutationResult(decideExtension));
  });

  it("shows the scoped queue with borrower credit and a server-side search", () => {
    render(<SupervisorApprovalsPage />);

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText(/S12345.*D1.*65/)).toBeInTheDocument();
    expect(screen.getByText("Oscilloscope")).toBeInTheDocument();
    expect(hooks.useApprovalQueue).toHaveBeenCalledWith(undefined, "");

    fireEvent.change(
      screen.getByPlaceholderText(i18n.t("supervisor.approvals.searchPlaceholder")),
      {
        target: { value: "Ada" },
      }
    );
    expect(hooks.useApprovalQueue).toHaveBeenLastCalledWith(undefined, "Ada");
  });

  it("requires a reason before rejecting and passes it to the decision mutation", async () => {
    decide.mockResolvedValue(
      decideApprovalOutput.strict().parse({
        request: requestResponse({
          reservationKey: request.reservationKey,
          status: "rejected",
          resource: {
            resourceKey: request.resourceKey,
            name: request.itemName,
            serialNo: request.serialNo,
            kind: request.kind,
            tier: request.tier,
            creditWeight: 1,
          },
          startTime: request.startTime,
          endTime: request.endTime,
          requestedAt: request.requestedAt,
          reason: request.reason,
          decisionNote: "Unavailable for the requested dates",
          cancellable: false,
          approval: {
            route: "supervisor",
            status: "Rejected",
            approvedBy: null,
            autoApproved: false,
            approvedAt: null,
            resolvedAt: "2026-09-25T08:00:00.000Z",
          },
        }),
        cancelled: [],
      })
    );
    render(<SupervisorApprovalsPage />);

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("supervisor.approvals.reject") })
    );
    const confirm = screen.getByRole("button", {
      name: i18n.t("supervisor.approvals.confirmReject"),
    });
    expect(confirm).toBeDisabled();

    fireEvent.change(
      screen.getByPlaceholderText(i18n.t("supervisor.approvals.reasonPlaceholder")),
      {
        target: { value: "Unavailable for the requested dates" },
      }
    );
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith({
        reservationKey: 77,
        decision: "reject",
        reason: "Unavailable for the requested dates",
      })
    );
  });

  it("asks before approving a request that would cancel a competing request", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    hooks.useApprovalQueue.mockReturnValue(
      queryResult([
        approvalQueueRow.strict().parse({
          ...request,
          clashesWith: [
            {
              reservationKey: 78,
              borrowerName: "Grace Hopper",
              startTime: request.startTime,
              endTime: request.endTime,
            },
          ],
        }),
      ])
    );
    render(<SupervisorApprovalsPage />);

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("supervisor.approvals.approve") })
    );
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(decide).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("submits the selected condition with a supervisor extension decision", async () => {
    decideExtension.mockResolvedValue(
      extensionResponse({
        extensionKey: extension.extensionKey,
        usageKey: extension.usageKey,
        status: "Approved",
        itemName: extension.itemName,
        serialNo: extension.serialNo,
        tier: extension.tier,
        extendNo: extension.extendNo,
        previousDueAt: extension.previousDueAt,
        requestedDueAt: extension.requestedDueAt,
        dueAt: extension.requestedDueAt,
        requestedAt: extension.requestedAt,
        resolvedAt: "2026-09-25T08:00:00.000Z",
        extensionsUsed: 1,
        extensionsAllowed: 1,
      })
    );
    render(<SupervisorApprovalsPage />);

    fireEvent.click(screen.getByText(i18n.t("supervisor.approvals.viewExtensions")));
    const row = screen.getByText("Oscilloscope").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.change(within(row!).getByRole("combobox"), {
      target: { value: "MinorDamage" },
    });
    fireEvent.click(
      within(row!).getByRole("button", { name: i18n.t("supervisor.approvals.approve") })
    );

    await waitFor(() =>
      expect(decideExtension).toHaveBeenCalledWith({
        extensionKey: 12,
        decision: "approve",
        condition: "MinorDamage",
      })
    );
  });
});
