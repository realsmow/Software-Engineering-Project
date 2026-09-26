import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import EquipmentDetailPage from "../../src/features/borrower/catalog/equipment-detail-page";
import { useRequestDraft } from "../../src/features/borrower/request/request-draft.store";
import { toCatalogItemDetail } from "../../src/features/borrower/catalog/item.adapter";
import { toMyCredit } from "../../src/features/account/credit.adapter";
import { creditResponse, itemResponse, unitResponse } from "../fixtures/api-responses";
import { itemDetail } from "../../../backend/src/item/item.schema";
import { queryResult } from "../fixtures/query-results";
import { fmtDateTime } from "../../src/features/borrower/format";

const hooks = vi.hoisted(() => ({
  detail:
    vi.fn<
      typeof import("../../src/features/borrower/catalog/use-equipment-types").useEquipmentType
    >(),
  credit: vi.fn<typeof import("../../src/features/account/use-my-credit").useMyCredit>(),
}));
vi.mock("../../src/features/borrower/catalog/use-equipment-types", () => ({
  useEquipmentType: hooks.detail,
}));
vi.mock("../../src/features/account/use-my-credit", () => ({
  useMyCredit: hooks.credit,
}));

const item = toCatalogItemDetail(
  itemDetail.strict().parse({
    ...itemResponse({ creditWeight: 3, availableUnits: 2, totalUnits: 3, prepDays: 2 }),
    units: [
      unitResponse({ assetTag: "MM-1" }),
      unitResponse({
        id: 2,
        resourceKey: 2,
        assetTag: "MM-2",
        status: "Lended",
        dueAt: "2026-09-28T09:00:00Z",
        nextAvailableAt: "2026-09-30T09:00:00Z",
      }),
      unitResponse({ id: 3, resourceKey: 3, assetTag: "MM-3" }),
    ],
  })
);
function renderDetail() {
  render(
    <MemoryRouter initialEntries={["/catalog/11"]}>
      <Routes>
        <Route path="/catalog/:id" element={<EquipmentDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("equipment detail PDF regressions", () => {
  beforeEach(() => {
    void i18n.changeLanguage("en");
    vi.clearAllMocks();
    useRequestDraft.getState().clear();
    hooks.detail.mockReturnValue(queryResult(item));
    hooks.credit.mockReturnValue(
      queryResult(
        toMyCredit(
          creditResponse({ tier: "D1", score: 65, maxBorrowDays: 7, maxExtendTimes: 1 })
        )
      )
    );
  });

  it("labels credit weight explicitly and uses the borrower limit rather than a fixed 14-day strip (PDF p. 5)", () => {
    renderDetail();
    expect(screen.getByText("Credit weight of the equipment")).toBeInTheDocument();
    expect(
      screen.getAllByText(i18n.t("borrower.detail.days", { count: 7 })).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/calibration/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(i18n.t("borrower.detail.days", { count: 14 }))
    ).not.toBeInTheDocument();
  });

  it("decreases the selected quantity to zero without going to the cart (PDF p. 5)", () => {
    useRequestDraft.getState().addItem(item.id, 2);
    useRequestDraft.getState().addItem(item.id, 2);
    renderDetail();
    fireEvent.click(
      screen.getAllByRole("button", { name: i18n.t("borrower.request.decrease") })[0]
    );
    expect(useRequestDraft.getState().lines[0].qty).toBe(1);
    fireEvent.click(
      screen.getAllByRole("button", { name: i18n.t("borrower.request.decrease") })[0]
    );
    expect(useRequestDraft.getState().lines).toEqual([]);
  });

  it("uses the shared requested window and displays the server next-available date (PDF pp. 5, 13)", () => {
    useRequestDraft.getState().setStartDate("2026-09-28");
    useRequestDraft.getState().setEndDate("2026-09-29");
    renderDetail();
    expect(hooks.detail).toHaveBeenCalledWith(
      "11",
      expect.objectContaining({
        startTime: expect.stringContaining("2026-09-28"),
        endTime: expect.stringContaining("2026-09-29"),
      })
    );
    const row = screen.getByText("MM-2").closest("tr")!;
    expect(
      within(row).getByText(fmtDateTime(item.units[1].nextAvailableAt))
    ).toBeInTheDocument();
  });
});
