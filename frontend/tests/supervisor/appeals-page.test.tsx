import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import SupervisorAppealsPage from "../../src/features/supervisor/appeals/appeals-page";
import { appealOutput } from "../../../backend/src/appeal/appeal.schema";
import { usagePhotosOutput } from "../../../backend/src/image/image.schema";
import { idleQueryResult, mutationResult, queryResult } from "../fixtures/query-results";

const hooks = vi.hoisted(() => ({
  useAppeals:
    vi.fn<
      typeof import("../../src/features/supervisor/appeals/use-appeals").useAppeals
    >(),
  useDecideAppeal:
    vi.fn<
      typeof import("../../src/features/supervisor/appeals/use-appeals").useDecideAppeal
    >(),
  useUsagePhotos:
    vi.fn<
      typeof import("../../src/features/borrower/pickup/use-pickup-image-upload").useUsagePhotos
    >(),
}));

vi.mock("../../src/features/supervisor/appeals/use-appeals", () => ({
  useAppeals: hooks.useAppeals,
  useDecideAppeal: hooks.useDecideAppeal,
}));
vi.mock("../../src/features/borrower/pickup/use-pickup-image-upload", () => ({
  useUsagePhotos: hooks.useUsagePhotos,
}));

const appeal = appealOutput.strict().parse({
  appealKey: 44,
  status: "pending",
  appealReason: "The scratch was already present at pickup.",
  filedAt: "2026-09-25T09:00:00.000Z",
  resolvedAt: null,
  filedBy: {
    accountKey: 7,
    studentId: "S12345",
    firstName: "Ada",
    lastName: "Lovelace",
    creditScore: 91,
  },
  resolvedBy: null,
  penalty: {
    penaltyKey: 20,
    usageKey: 42,
    reason: "Scratch recorded at return",
    creditDeducted: 8,
    issuedAt: "2026-09-25T08:00:00.000Z",
    expiresAt: "2026-10-10T08:00:00.000Z",
    inEffect: true,
  },
  replacementPenalty: null,
  creditRestored: 0,
  inspectorKeys: [3],
  inspection: {
    grade: "B2",
    notes: "Lens crack documented at return",
    inspectorName: "Independent Inspector",
    inspectedAt: "2026-09-25T08:00:00.000Z",
  },
  revisedGrade: null,
});

describe("supervisor appeal regression", () => {
  const decide =
    vi.fn<
      ReturnType<
        typeof import("../../src/features/supervisor/appeals/use-appeals").useDecideAppeal
      >["mutateAsync"]
    >();

  beforeEach(() => {
    void i18n.changeLanguage("en");
    vi.clearAllMocks();
    hooks.useAppeals.mockReturnValue(queryResult([appeal]));
    hooks.useDecideAppeal.mockReturnValue(mutationResult(decide));
    hooks.useUsagePhotos.mockReturnValue(
      queryResult(
        usagePhotosOutput.strict().parse({
          before: [
            {
              imageKey: 1,
              imageUrl: "http://localhost:3000/media/before.jpg",
              stage: "before",
              submittedBy: 7,
              submittedAt: null,
            },
          ],
          after: [
            {
              imageKey: 2,
              imageUrl: "http://localhost:3000/media/after.jpg",
              stage: "after",
              submittedBy: 7,
              submittedAt: null,
            },
          ],
          inspection: [],
          evidence: [
            {
              imageKey: 3,
              imageUrl:
                "http://localhost:3000/media/evidence.jpg?exp=1900000000000&sig=test",
              stage: "evidence",
              submittedBy: 7,
              submittedAt: null,
            },
          ],
        })
      )
    );
  });

  it("loads a contract-validated appeal fixture and shows pickup, return and appeal evidence image URLs", () => {
    const { container } = render(<SupervisorAppealsPage />);

    expect(hooks.useAppeals).toHaveBeenCalledWith("pending");
    expect(hooks.useUsagePhotos).toHaveBeenCalledWith(42);
    expect(screen.getByText(appeal.appealReason!)).toBeInTheDocument();
    expect(screen.getByText(appeal.inspection!.notes!)).toBeInTheDocument();
    expect(screen.getByText(/Independent Inspector/)).toBeInTheDocument();
    expect(
      screen.getByText(
        i18n.t("supervisor.appeals.gradedAs", { grade: `B2 ${i18n.t("damage.B2")}` })
      )
    ).toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll("img")).map((image) =>
        image.getAttribute("src")
      )
    ).toEqual([
      "http://localhost:3000/media/before.jpg",
      "http://localhost:3000/media/after.jpg",
      "http://localhost:3000/media/evidence.jpg?exp=1900000000000&sig=test",
    ]);
  });

  it("approves a credit appeal with its note when no grade revision is selected", async () => {
    decide.mockResolvedValue(
      appealOutput.strict().parse({
        ...appeal,
        status: "approved",
        creditRestored: 8,
        resolvedBy: { ...appeal.filedBy, accountKey: 9, firstName: "Supervisor" },
        resolvedAt: "2026-09-26T09:00:00.000Z",
        penalty: { ...appeal.penalty, inEffect: false },
      })
    );
    render(<SupervisorAppealsPage />);

    fireEvent.change(
      screen.getByPlaceholderText(i18n.t("supervisor.appeals.notePlaceholder")),
      {
        target: { value: "Existing scratch confirmed" },
      }
    );
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("supervisor.appeals.approve") })
    );

    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith({
        appealKey: 44,
        decision: "approve",
        note: "Existing scratch confirmed",
      })
    );
    expect(
      screen.getByText(i18n.t("supervisor.appeals.doneApprove", { credit: 8 }))
    ).toBeInTheDocument();
  });

  it("explains missing photos for a penalty without a loan", () => {
    hooks.useAppeals.mockReturnValue(
      queryResult([
        appealOutput
          .strict()
          .parse({ ...appeal, penalty: { ...appeal.penalty, usageKey: null } }),
      ])
    );
    hooks.useUsagePhotos.mockReturnValue(idleQueryResult());
    render(<SupervisorAppealsPage />);
    expect(hooks.useUsagePhotos).toHaveBeenCalledWith(null);
    expect(screen.getByText(i18n.t("supervisor.appeals.noUsage"))).toBeInTheDocument();
  });

  it("offers only lower grades and sends a grade instead of a previously entered refund amount", async () => {
    decide.mockResolvedValue(
      appealOutput.strict().parse({
        ...appeal,
        status: "approved",
        revisedGrade: "B1",
        creditRestored: 4,
        resolvedBy: { ...appeal.filedBy, accountKey: 9 },
        resolvedAt: "2026-09-26T09:00:00.000Z",
        penalty: { ...appeal.penalty, inEffect: false },
        replacementPenalty: { ...appeal.penalty, penaltyKey: 21, creditDeducted: 4 },
      })
    );
    render(<SupervisorAppealsPage />);
    expect(screen.queryByRole("button", { name: /^B2/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^B3/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^B0/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } });
    const grade = screen.getByRole("button", { name: /^B1/ });
    fireEvent.click(grade);
    expect(grade).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("spinbutton")).toHaveValue(null);
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("supervisor.appeals.approve") })
    );
    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith({
        appealKey: 44,
        decision: "approve",
        revisedGrade: "B1",
      })
    );
    expect(
      screen.getByText(i18n.t("supervisor.appeals.doneApprove", { credit: 4 }))
    ).toBeInTheDocument();
  });

  it("clears a selected grade when entering a credit amount and submits only that amount", async () => {
    decide.mockResolvedValue(
      appealOutput.strict().parse({
        ...appeal,
        status: "approved",
        creditRestored: 5,
        resolvedBy: { ...appeal.filedBy, accountKey: 9 },
        resolvedAt: "2026-09-26T09:00:00.000Z",
        penalty: { ...appeal.penalty, inEffect: false },
        replacementPenalty: { ...appeal.penalty, penaltyKey: 21, creditDeducted: 3 },
      })
    );
    render(<SupervisorAppealsPage />);
    const grade = screen.getByRole("button", { name: /^B1/ });
    fireEvent.click(grade);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } });
    expect(grade).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("supervisor.appeals.approve") })
    );
    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith({
        appealKey: 44,
        decision: "approve",
        reducedCreditDeducted: 3,
      })
    );
  });

  it("shows the revised grade, replacement deduction and restored credit on an approved appeal", () => {
    hooks.useAppeals.mockReturnValue(
      queryResult([
        appealOutput.strict().parse({
          ...appeal,
          status: "approved",
          revisedGrade: "B1",
          creditRestored: 4,
          resolvedBy: { ...appeal.filedBy, accountKey: 9 },
          resolvedAt: "2026-09-26T09:00:00.000Z",
          penalty: { ...appeal.penalty, inEffect: false },
          replacementPenalty: { ...appeal.penalty, penaltyKey: 21, creditDeducted: 4 },
        }),
      ])
    );
    render(<SupervisorAppealsPage />);
    expect(
      screen.getByText(
        i18n.t("supervisor.appeals.revisedTo", { grade: `B1 ${i18n.t("damage.B1")}` })
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t("supervisor.appeals.replacedBy", { credit: 4 }))
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t("supervisor.appeals.creditReturned", { credit: 4 }))
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^B1/ })).not.toBeInTheDocument();
  });

  it("does not offer a grade revision when the original inspection is unavailable", () => {
    hooks.useAppeals.mockReturnValue(
      queryResult([appealOutput.strict().parse({ ...appeal, inspection: null })])
    );
    render(<SupervisorAppealsPage />);
    expect(screen.queryByRole("button", { name: /^B[0-3]/ })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toBeEnabled();
  });
});
