import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import SupervisorApprovalsPage from "../../src/features/supervisor/approvals/approvals-queue-page";
import * as approvalHooks from "../../src/features/supervisor/approvals/use-approvals";
import type { RetirementRequest } from "../../src/features/supervisor/approvals/approval.types";

vi.mock("../../src/features/supervisor/approvals/use-approvals", () => ({
  useApprovalCounts: vi.fn(),
  useApprovalQueue: vi.fn(),
  useDecideApproval: vi.fn(),
  useExtensionQueue: vi.fn(),
  useDecideExtension: vi.fn(),
  useRetirementQueue: vi.fn(),
  useDecideRetirement: vi.fn(),
}));

const RETIREMENTS: RetirementRequest[] = [
  {
    requestKey: 301,
    resourceKey: 501,
    kind: "equipment",
    resourceName: "ออสซิลโลสโคป Keysight",
    serialNo: "OSC-014-01",
    reason: "Screen cracked beyond repair",
    status: "Pending",
    requestedBy: { accountKey: 9, userId: "u-1003", name: "สมชาย พร้อมเจริญ" },
    requestedAt: "2026-09-01T09:00:00Z",
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
  },
];

describe("Supervisor approvals: Retirements tab", () => {
  const decideRetirement = vi.fn();

  beforeEach(() => {
    i18n.changeLanguage("en");
    vi.clearAllMocks();
    vi.mocked(approvalHooks.useApprovalCounts).mockReturnValue({
      data: { staff: 0, supervisor: 0, overdueToDecide: 0, autoApprovedToday: 0, retirement: RETIREMENTS.length },
    } as never);
    vi.mocked(approvalHooks.useApprovalQueue).mockReturnValue({ data: [], isLoading: false } as never);
    vi.mocked(approvalHooks.useDecideApproval).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.mocked(approvalHooks.useExtensionQueue).mockReturnValue({ data: [], isLoading: false } as never);
    vi.mocked(approvalHooks.useDecideExtension).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.mocked(approvalHooks.useRetirementQueue).mockReturnValue({ data: RETIREMENTS, isLoading: false } as never);
    vi.mocked(approvalHooks.useDecideRetirement).mockReturnValue({
      mutateAsync: decideRetirement,
      isPending: false,
    } as never);
  });

  function openRetirementsTab() {
    render(<SupervisorApprovalsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Retirements" }));
  }

  it("renders the pending retirement row", () => {
    openRetirementsTab();

    expect(screen.getByText("ออสซิลโลสโคป Keysight")).toBeInTheDocument();
    expect(screen.getByText("OSC-014-01")).toBeInTheDocument();
    expect(screen.getByText("Screen cracked beyond repair")).toBeInTheDocument();
    expect(screen.getByText("สมชาย พร้อมเจริญ")).toBeInTheDocument();
  });

  it("approves a retirement without requiring a reason", async () => {
    decideRetirement.mockResolvedValue({ ...RETIREMENTS[0], status: "Approved" });
    openRetirementsTab();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(decideRetirement).toHaveBeenCalledWith({
        requestKey: 301,
        decision: "approve",
      });
    });
  });

  it("requires a note before a reject goes through, then sends it", async () => {
    decideRetirement.mockResolvedValue({ ...RETIREMENTS[0], status: "Rejected" });
    openRetirementsTab();

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    // Confirming with no reason typed must not call the hook at all.
    fireEvent.click(screen.getByRole("button", { name: "Confirm reject" }));
    expect(decideRetirement).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("Reason for rejection (required)"), {
      target: { value: "Still under warranty, send to vendor instead" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm reject" }));

    await waitFor(() => {
      expect(decideRetirement).toHaveBeenCalledWith({
        requestKey: 301,
        decision: "reject",
        note: "Still under warranty, send to vendor instead",
      });
    });
  });
});
