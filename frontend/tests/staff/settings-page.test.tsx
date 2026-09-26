import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREDIT_BANDS, TIER_CONFIG } from "../../src/constants";
import i18n from "../../src/i18n";
import LendingSettingsPage from "../../src/features/staff/settings/settings-page";
import type { LendingSettings } from "../../src/features/staff/settings/settings.types";
import { lendingSettingsOutput } from "../../../backend/src/admin/admin.schema";
import {
  loadingQueryResult,
  queryResult,
  mutationResult,
} from "../fixtures/query-results";

const useLendingSettingsMock = vi.hoisted(() => vi.fn());
const useUpdateLendingSettingsMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/features/staff/settings/use-lending-settings", () => ({
  useLendingSettings: useLendingSettingsMock,
  useUpdateLendingSettings: useUpdateLendingSettingsMock,
}));

const SOURCE_BANDS = CREDIT_BANDS.slice(0, 2);
const SOURCE_RULE = (Object.keys(TIER_CONFIG) as Array<keyof typeof TIER_CONFIG>)[0];

const SETTINGS: LendingSettings = lendingSettingsOutput.strict().parse({
  creditTiers: SOURCE_BANDS.map((band, index) => ({
    id: index + 1,
    name: band.band,
    min: band.min,
    max: band.max,
  })),
  borrowRules: [
    {
      id: 11,
      name: SOURCE_RULE,
      constraints: SOURCE_BANDS.map((band, index) => ({
        creditTierKey: index + 1,
        creditTierName: band.band,
        minimumAuthorityLevel: index,
        maxBorrowDays: band.loanDays,
        maxExtendTimes: index === 0 ? 1 : 0,
      })),
      penalties: [
        { reason: "DamagedItem", amount: 20, lengthDays: 30 },
        { reason: "LostItem", amount: 80, lengthDays: 90 },
      ],
    },
  ],
});

describe("LendingSettingsPage", () => {
  const mutateAsync = vi.fn();

  const renderPage = () =>
    render(
      <MemoryRouter>
        <LendingSettingsPage />
      </MemoryRouter>
    );

  beforeEach(() => {
    i18n.changeLanguage("en");
    vi.clearAllMocks();
    useLendingSettingsMock.mockReturnValue(queryResult(SETTINGS));
    useUpdateLendingSettingsMock.mockReturnValue(mutationResult(mutateAsync));
  });

  it("shows a loading state while lending settings are being fetched", () => {
    useLendingSettingsMock.mockReturnValue(loadingQueryResult());

    renderPage();

    expect(screen.getByText(i18n.t("common.loading"))).toBeInTheDocument();
  });

  it("shows the empty state when no borrow rules are configured", () => {
    useLendingSettingsMock.mockReturnValue(
      queryResult(
        lendingSettingsOutput.strict().parse({ creditTiers: [], borrowRules: [] })
      )
    );

    renderPage();

    expect(screen.getByText(i18n.t("staff.settings.emptyTitle"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("staff.settings.emptyDesc"))).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("staff.settings.save") })
    ).not.toBeInTheDocument();
  });

  it("renders constraint and penalty rows and keeps Save disabled until an edit", () => {
    renderPage();

    expect(screen.getByText(SOURCE_RULE)).toBeInTheDocument();
    expect(screen.getByText(i18n.t("staff.settings.penalties"))).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t("staff.settings.reasonDamagedItem"))
    ).toBeInTheDocument();
    expect(screen.getByText(i18n.t("staff.settings.reasonLostItem"))).toBeInTheDocument();

    const save = screen.getByRole("button", { name: i18n.t("staff.settings.save") });
    expect(save).toBeDisabled();

    const fields = screen.getAllByRole("spinbutton");
    fireEvent.change(fields[0], { target: { value: "0" } });
    expect(fields[0]).toHaveValue(SOURCE_BANDS[0].loanDays);
    expect(save).toBeDisabled();

    fireEvent.change(fields[0], { target: { value: "21" } });
    expect(fields[0]).toHaveValue(21);
    expect(save).toBeEnabled();
  });

  it("sends edited constraint and penalty values for the selected rule", async () => {
    mutateAsync.mockResolvedValue(
      lendingSettingsOutput.strict().parse({
        ...SETTINGS,
        borrowRules: [
          {
            ...SETTINGS.borrowRules[0],
            constraints: SETTINGS.borrowRules[0].constraints.map((constraint, index) =>
              index === 0 ? { ...constraint, maxBorrowDays: 21 } : constraint
            ),
            penalties: SETTINGS.borrowRules[0].penalties.map((penalty, index) =>
              index === 0 ? { ...penalty, amount: 25 } : penalty
            ),
          },
        ],
      })
    );
    renderPage();

    const fields = screen.getAllByRole("spinbutton");
    fireEvent.change(fields[0], { target: { value: "21" } });
    fireEvent.change(fields[4], { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("staff.settings.save") }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        borrowRuleKey: 11,
        constraints: [
          { creditTierKey: 1, maxBorrowDays: 21, maxExtendTimes: 1 },
          { creditTierKey: 2, maxBorrowDays: 7, maxExtendTimes: 0 },
        ],
        penalties: [
          { reason: "DamagedItem", amount: 25, lengthDays: 30 },
          { reason: "LostItem", amount: 80, lengthDays: 90 },
        ],
      });
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      i18n.t("staff.settings.saved", { rule: SOURCE_RULE })
    );
  });

  it("keeps the edited form visible and reports a save failure", async () => {
    mutateAsync.mockRejectedValue(new Error("Settings service unavailable"));
    renderPage();

    const fields = screen.getAllByRole("spinbutton");
    fireEvent.change(fields[0], { target: { value: "21" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("staff.settings.save") }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Settings service unavailable"
      );
    });
    expect(screen.getByText(SOURCE_RULE)).toBeInTheDocument();
    expect(fields[0]).toHaveValue(21);
  });

  it("renders a rule with no constraints without manufacturing input rows", () => {
    useLendingSettingsMock.mockReturnValue(
      queryResult(
        lendingSettingsOutput.strict().parse({
          ...SETTINGS,
          borrowRules: [{ ...SETTINGS.borrowRules[0], constraints: [], penalties: [] }],
        })
      )
    );

    renderPage();

    expect(screen.getByText(i18n.t("staff.settings.noConstraints"))).toBeInTheDocument();
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
  });
});
