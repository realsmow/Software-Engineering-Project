import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import SupervisorApprovalsPage from "../../src/features/supervisor/approvals/approvals-queue-page";
import { fmtDate } from "../../src/features/borrower/format";
import {
  approvalCounts,
  approvalQueueRow,
  borrowerHistoryOutput,
  decideApprovalOutput,
} from "../../../backend/src/approval/approval.schema";
import { extensionReviewRow } from "../../../backend/src/loan/loan.schema";
import { extensionResponse, requestResponse } from "../fixtures/api-responses";
import {
  errorQueryResult,
  loadingQueryResult,
  mutationResult,
  queryResult,
} from "../fixtures/query-results";

const hooks = vi.hoisted(() => ({
  useBorrowerHistory:
    vi.fn<
      typeof import("../../src/features/supervisor/approvals/use-approvals").useBorrowerHistory
    >(),
  useRetirementQueue:
    vi.fn<
      typeof import("../../src/features/supervisor/approvals/use-approvals").useRetirementQueue
    >(),
  useDecideRetirement:
    vi.fn<
      typeof import("../../src/features/supervisor/approvals/use-approvals").useDecideRetirement
    >(),
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
  inspection: null,
});

const checked = extensionReviewRow.strict().parse({
  ...extension,
  inspection: {
    condition: "MinorDamage",
    note: "Scratch on the lid",
    loggedAt: "2026-09-25T07:00:00.000Z",
    loggedBy: "Sam Staff",
  },
});

const history = borrowerHistoryOutput.strict().parse({
  totalLoans: 2,
  lateReturns: 1,
  damageIncidents: 1,
  lastDamageDate: "2026-09-23T08:00:00.000Z",
  items: [
    {
      usageKey: 9,
      itemName: "Past oscilloscope",
      serialNo: "OSC-009",
      checkoutAt: "2026-09-20T08:00:00.000Z",
      returnedAt: null,
      overdueDays: 2,
      status: "Lended",
    },
    {
      usageKey: 8,
      itemName: "Lab 3",
      serialNo: null,
      checkoutAt: "2026-09-18T08:00:00.000Z",
      returnedAt: "2026-09-18T10:00:00.000Z",
      overdueDays: 0,
      status: "Inspected",
    },
  ],
});

function openHistory() {
  fireEvent.click(screen.getByText("Ada Lovelace"));
  return within(screen.getByRole("dialog"));
}

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
          extensions: { staff: 0, supervisor: 0 },
          retirement: 0,
          overdueToDecide: 0,
          autoApprovedToday: 0,
          asOf: null,
        })
      )
    );
    hooks.useRetirementQueue.mockReturnValue(queryResult([]));
    hooks.useDecideRetirement.mockReturnValue(
      mutationResult(
        vi.fn<
          ReturnType<
            typeof import("../../src/features/supervisor/approvals/use-approvals").useDecideRetirement
          >["mutateAsync"]
        >()
      )
    );
    hooks.useApprovalQueue.mockReturnValue(queryResult([request]));
    hooks.useBorrowerHistory.mockReturnValue(queryResult(history));
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

  it("opens history only on a borrower row and closes it without deciding the request", () => {
    render(<SupervisorApprovalsPage />);
    expect(hooks.useBorrowerHistory).not.toHaveBeenCalled();
    const dialog = openHistory();
    expect(hooks.useBorrowerHistory).toHaveBeenLastCalledWith(42);
    expect(dialog.getByText("Past oscilloscope")).toBeInTheDocument();
    expect(dialog.getByText("OSC-009")).toBeInTheDocument();
    expect(dialog.getByText(fmtDate(history.lastDamageDate!))).toBeInTheDocument();
    expect(
      dialog.getByText(i18n.t("supervisor.approvals.history.lateDays", { n: 2 }))
    ).toBeInTheDocument();
    const roomRow = dialog.getByText("Lab 3").closest("tr")!;
    expect(within(roomRow).getByText("-")).toBeInTheDocument();
    for (const [label, value] of [
      ["total", "2"],
      ["late", "1"],
      ["damage", "1"],
    ]) {
      expect(
        dialog.getByText(i18n.t(`supervisor.approvals.history.${label}`)).parentElement
      ).toHaveTextContent(value);
    }
    fireEvent.click(dialog.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(decide).not.toHaveBeenCalled();
  });

  it("shows a valid empty history and no last damage date", () => {
    hooks.useBorrowerHistory.mockReturnValue(
      queryResult(
        borrowerHistoryOutput.strict().parse({
          totalLoans: 0,
          lateReturns: 0,
          damageIncidents: 0,
          lastDamageDate: null,
          items: [],
        })
      )
    );
    render(<SupervisorApprovalsPage />);
    const dialog = openHistory();
    expect(
      dialog.getByText(i18n.t("supervisor.approvals.history.none"))
    ).toBeInTheDocument();
    expect(dialog.getByText("-")).toBeInTheDocument();
  });

  it("shows loading before history arrives and a failure if the query fails", () => {
    hooks.useBorrowerHistory.mockReturnValue(loadingQueryResult());
    const view = render(<SupervisorApprovalsPage />);
    const dialog = openHistory();
    expect(dialog.getByText(i18n.t("common.loading"))).toBeInTheDocument();
    expect(dialog.queryByText("Past oscilloscope")).not.toBeInTheDocument();
    hooks.useBorrowerHistory.mockReturnValue(
      errorQueryResult(new Error("OUT_OF_MANAGEMENT_SCOPE"))
    );
    view.rerender(<SupervisorApprovalsPage />);
    expect(
      dialog.getByText(i18n.t("supervisor.approvals.history.failed"))
    ).toBeInTheDocument();
    expect(dialog.queryByText("Past oscilloscope")).not.toBeInTheDocument();
  });

  it("uses the next borrower's key and replaces the previous history on reopening", () => {
    hooks.useApprovalQueue.mockReturnValue(
      queryResult([
        request,
        approvalQueueRow.strict().parse({
          ...request,
          reservationKey: 78,
          borrower: {
            ...borrower,
            accountKey: 43,
            firstName: "Grace",
            lastName: "Hopper",
            studentId: "S67890",
          },
        }),
      ])
    );
    render(<SupervisorApprovalsPage />);
    fireEvent.click(openHistory().getByRole("button", { name: "Close" }));
    hooks.useBorrowerHistory.mockReturnValue(
      queryResult(
        borrowerHistoryOutput.strict().parse({
          totalLoans: 0,
          lateReturns: 0,
          damageIncidents: 0,
          lastDamageDate: null,
          items: [],
        })
      )
    );
    fireEvent.click(screen.getByText("Grace Hopper"));
    expect(hooks.useBorrowerHistory).toHaveBeenLastCalledWith(43);
    expect(screen.getByRole("dialog")).toHaveTextContent("Grace Hopper");
    expect(
      within(screen.getByRole("dialog")).queryByText("Past oscilloscope")
    ).not.toBeInTheDocument();
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
    expect(hooks.useBorrowerHistory).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

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
    expect(hooks.useBorrowerHistory).not.toHaveBeenCalled();
    expect(decide).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("has no condition picker and sends none for a staff-route extension (#164)", async () => {
    hooks.useExtensionQueue.mockReturnValue(
      queryResult([extensionReviewRow.strict().parse({ ...extension, route: "staff" })])
    );
    decideExtension.mockResolvedValue(extensionResponse({ status: "Approved" }));
    render(<SupervisorApprovalsPage />);
    fireEvent.click(screen.getByText(i18n.t("supervisor.approvals.viewExtensions")));
    const row = within(screen.getByText("Oscilloscope").closest("tr")!);
    expect(row.queryByRole("combobox")).toBeNull();
    fireEvent.click(
      row.getByRole("button", { name: i18n.t("supervisor.approvals.approve") })
    );
    await waitFor(() =>
      expect(decideExtension).toHaveBeenCalledWith({
        extensionKey: 12,
        decision: "approve",
      })
    );
  });

  it("blocks approval until staff have recorded the condition (#156)", () => {
    render(<SupervisorApprovalsPage />);
    fireEvent.click(screen.getByText(i18n.t("supervisor.approvals.viewExtensions")));
    const row = within(screen.getByText("Oscilloscope").closest("tr")!);
    expect(row.getByText(i18n.t("supervisor.approvals.awaitingCheck"))).toBeInTheDocument();
    expect(
      row.getByRole("button", { name: i18n.t("supervisor.approvals.approve") })
    ).toBeDisabled();
  });

  it("shows the staff-recorded condition read-only and then allows approval (#156)", async () => {
    hooks.useExtensionQueue.mockReturnValue(queryResult([checked]));
    decideExtension.mockResolvedValue(extensionResponse({ status: "Approved" }));
    render(<SupervisorApprovalsPage />);
    fireEvent.click(screen.getByText(i18n.t("supervisor.approvals.viewExtensions")));
    const row = within(screen.getByText("Oscilloscope").closest("tr")!);
    expect(row.getByText(i18n.t("staff.inspection.condMinorDamage"))).toBeInTheDocument();
    expect(row.getByText(/Sam Staff/)).toBeInTheDocument();
    expect(row.queryByRole("combobox")).toBeNull();
    fireEvent.click(
      row.getByRole("button", { name: i18n.t("supervisor.approvals.approve") })
    );
    await waitFor(() =>
      expect(decideExtension).toHaveBeenCalledWith({
        extensionKey: 12,
        decision: "approve",
      })
    );
  });
});
