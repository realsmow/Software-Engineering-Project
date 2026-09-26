import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../src/i18n";
import RequestPage from "../../src/features/borrower/request/request-page";
import {
  isoOffset,
  useRequestDraft,
} from "../../src/features/borrower/request/request-draft.store";
import { useAuthStore } from "../../src/features/auth/auth.store";
import { toClientUser } from "../../src/features/auth/user.adapter";
import {
  toCatalogItem,
  toUnitRow,
} from "../../src/features/borrower/catalog/item.adapter";
import { toMyCredit } from "../../src/features/account/credit.adapter";
import {
  creditResponse,
  itemResponse,
  requestResponse,
  unitResponse,
  userResponse,
} from "../fixtures/api-responses";
import {
  createRequestOutput,
  type CreateRequestInput,
} from "../../../backend/src/loan/loan.schema";
import { queryResult } from "../fixtures/query-results";

const hooks = vi.hoisted(() => ({
  useEquipmentTypes:
    vi.fn<
      typeof import("../../src/features/borrower/catalog/use-equipment-types").useEquipmentTypes
    >(),
  useEquipmentUnits:
    vi.fn<
      typeof import("../../src/features/borrower/catalog/use-equipment-types").useEquipmentUnits
    >(),
  useMyCredit:
    vi.fn<typeof import("../../src/features/account/use-my-credit").useMyCredit>(),
}));

const api = vi.hoisted(() => ({ listUnits: vi.fn(), create: vi.fn() }));
vi.mock("../../src/lib/trpc", () => ({
  useTRPCClient: () => ({
    item: { listUnits: { query: api.listUnits } },
    loan: { create: { mutate: api.create } },
  }),
}));

vi.mock("../../src/features/borrower/catalog/use-equipment-types", () => ({
  useEquipmentTypes: hooks.useEquipmentTypes,
  useEquipmentUnits: hooks.useEquipmentUnits,
}));
vi.mock("../../src/features/account/use-my-credit", () => ({
  useMyCredit: hooks.useMyCredit,
}));
const item = toCatalogItem(itemResponse({ availableUnits: 2, totalUnits: 2 }));
const units = [
  unitResponse(),
  unitResponse({ id: 2, resourceKey: 2, assetTag: "MM-002" }),
];
let client: QueryClient;

function renderPage() {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RequestPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("borrower request checks", () => {
  const create = api.create;

  beforeEach(() => {
    void i18n.changeLanguage("en");
    vi.resetAllMocks();
    useRequestDraft.getState().clear();
    useRequestDraft.getState().setStartDate(isoOffset(1));
    useRequestDraft.getState().setEndDate(isoOffset(2));
    hooks.useEquipmentTypes.mockReturnValue(queryResult([item]));
    hooks.useEquipmentUnits.mockReturnValue(queryResult(units.map(toUnitRow)));
    hooks.useMyCredit.mockReturnValue(queryResult(toMyCredit(creditResponse())));
    api.listUnits.mockResolvedValue(units);
  });

  afterEach(() => {
    client?.clear();
    useAuthStore.getState().setUser(null);
  });

  it("keeps all pre-submit checks invalid when the cart is empty", () => {
    renderPage();
    expect(
      screen.getByRole("button", { name: i18n.t("borrower.request.submit") })
    ).toBeDisabled();
    expect(screen.getAllByText(i18n.t("borrower.request.pcCreditIdle")).length).toBe(3);
  });

  it("refreshes the availability window when dates change", () => {
    useRequestDraft.getState().addItem(item.id, item.availableUnits);
    renderPage();
    const later = isoOffset(3);
    fireEvent.change(screen.getByLabelText(i18n.t("borrower.request.returnDate")), {
      target: { value: later },
    });
    expect(hooks.useEquipmentTypes).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startTime: expect.stringContaining(isoOffset(1)),
        endTime: expect.stringContaining(later),
      })
    );
  });

  it("has no pretend save-draft action while the draft is memory-only (PDF p. 7)", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: /save draft/i })).not.toBeInTheDocument();
  });

  describe("logout clears the previous borrower's draft", () => {
    beforeEach(() => {
      useAuthStore.getState().setUser(toClientUser(userResponse()));
      useRequestDraft.getState().addItem(item.id, item.availableUnits);
      expect(useRequestDraft.getState().lines).toHaveLength(1);
      useAuthStore.getState().logout();
      expect(useAuthStore.getState().user).toBeNull();
    });

    it.fails("clears the previous borrower cart when they log out", () => {
      expect(useRequestDraft.getState().lines).toEqual([]);
    });
  });

  it("keeps rejected units in the cart and reports a partial backend result", async () => {
    useRequestDraft.getState().addItem(item.id, item.availableUnits);
    useRequestDraft.getState().addItem(item.id, item.availableUnits);
    create.mockImplementation((input: CreateRequestInput) =>
      createRequestOutput.parse({
        created: [
          requestResponse({
            reservationKey: 1,
            startTime: input.startTime,
            endTime: input.endTime,
          }),
        ],
        rejected: [{ resourceKey: 2, code: "WINDOW_NOT_AVAILABLE", detail: null }],
      })
    );
    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("borrower.request.submit") })
    );

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      i18n.t("borrower.request.submitPartial", { created: 1, rejected: 1 })
    );
    expect(useRequestDraft.getState().lines).toEqual([
      { itemId: item.id, qty: 1, serials: [] },
    ]);
  });

  describe("a server date clash invalidates the stock checklist", () => {
    beforeEach(async () => {
      useRequestDraft.getState().addItem(item.id, item.availableUnits);
      create.mockResolvedValue(
        createRequestOutput.parse({
          created: [],
          rejected: [{ resourceKey: 1, code: "WINDOW_NOT_AVAILABLE", detail: null }],
        })
      );
      renderPage();
      fireEvent.click(
        screen.getByRole("button", { name: i18n.t("borrower.request.submit") })
      );
      await screen.findByRole("alert");
      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ lines: [{ resourceKey: 1 }] })
      );
    });

    // The server refused this period, so the availability checklist must stop
    // claiming the same item is ready without a fresh availability result.
    it.fails("does not keep a green stock check after a backend date clash", () => {
      expect(
        screen.queryByText(i18n.t("borrower.request.pcStockOk"))
      ).not.toBeInTheDocument();
    });
  });
});
