import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import { routeTitleKey } from "../../src/constants/navigation";
import StaffHandoverPage from "../../src/features/staff/handover/handover-page";
import { loanResponse } from "../fixtures/api-responses";
import { mutationResult, queryResult } from "../fixtures/query-results";

const hooks = vi.hoisted(() => ({
  useLoanForStaff:
    vi.fn<
      typeof import("../../src/features/staff/handover/use-handover").useLoanForStaff
    >(),
  useSwapUnit:
    vi.fn<typeof import("../../src/features/staff/handover/use-handover").useSwapUnit>(),
}));

vi.mock("../../src/features/staff/handover/use-handover", () => hooks);

const loan = loanResponse();

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/staff/handover/42"]}>
      <Routes>
        <Route path="/staff/handover/:usageKey" element={<StaffHandoverPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("staff handover regression", () => {
  const swap =
    vi.fn<
      ReturnType<
        typeof import("../../src/features/staff/handover/use-handover").useSwapUnit
      >["mutateAsync"]
    >();

  beforeEach(() => {
    void i18n.changeLanguage("en");
    vi.clearAllMocks();
    hooks.useLoanForStaff.mockReturnValue(queryResult(loan));
    hooks.useSwapUnit.mockReturnValue(mutationResult(swap));
  });

  it("uses the handover breadcrumb and loads the selected loan", () => {
    expect(routeTitleKey("/staff/handover/42")).toBe("nav.handover");
    renderPage();
    expect(hooks.useLoanForStaff).toHaveBeenCalledWith(42);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText(/MM-001/)).toBeInTheDocument();
  });

  it("swaps a prepared T1 unit and reports the result", async () => {
    swap.mockResolvedValue(loanResponse({ ...loan, resourceKey: 9, serialNo: "MM-002" }));
    renderPage();

    fireEvent.change(screen.getByLabelText(i18n.t("staff.handover.newResourceKey")), {
      target: { value: "9" },
    });
    fireEvent.change(
      screen.getByLabelText(i18n.t("staff.handover.swapReasonPlaceholder")),
      {
        target: { value: "Borrower requested another unit" },
      }
    );
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("staff.handover.confirmSwap") })
    );

    await waitFor(() =>
      expect(swap).toHaveBeenCalledWith({
        usageKey: 42,
        resourceKey: 9,
        reason: "Borrower requested another unit",
      })
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      i18n.t("staff.handover.doneSwap")
    );
  });

  it("does not offer unit swapping for a prepared T2 loan", () => {
    hooks.useLoanForStaff.mockReturnValue(
      queryResult(loanResponse({ ...loan, tier: "T2" }))
    );
    renderPage();
    expect(
      screen.queryByRole("button", { name: i18n.t("staff.handover.confirmSwap") })
    ).not.toBeInTheDocument();
    expect(screen.getByText(i18n.t("staff.handover.swapNotAllowed"))).toBeInTheDocument();
  });
});
