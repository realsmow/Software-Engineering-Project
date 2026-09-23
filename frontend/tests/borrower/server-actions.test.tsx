import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import { ROUTES } from "../../src/constants";
import { fmtDate, fmtDateTime, fmtDayMonth } from "../../src/lib/datetime";
import HomePage from "../../src/features/borrower/home/home-page";
import MyLoansPage from "../../src/features/borrower/loans/my-loans-page";
import AppealsPage from "../../src/features/borrower/appeals/appeals-page";
import type { ServerRequest } from "../../src/features/borrower/loans/request.adapter";
import type {
  ServerExtension,
  ServerExtensionOptions,
} from "../../src/features/borrower/loans/extension.adapter";
import type {
  AppealOutput,
  AppealablePenalty,
} from "../../src/features/supervisor/appeals/appeal.types";

/**
 * Every borrower action on these pages has to reach the server. The tRPC
 * client is replaced by one spy, `api(path, input)`, backed by a small
 * in-memory server, so each test can assert both the call that went out and
 * that the screen then shows what the server answered.
 */
const api = vi.hoisted(() => vi.fn());

vi.mock("../../src/lib/trpc", () => {
  const client = new Proxy(
    {},
    {
      get: (_, domain: string) =>
        new Proxy(
          {},
          {
            get: (_, proc: string) => {
              const call = (input?: unknown) => Promise.resolve(api(`${domain}.${proc}`, input));
              return { query: call, mutate: call };
            },
          },
        ),
    },
  );
  return { useTRPCClient: () => client };
});

const DUE = "2029-08-18T09:07:06.947Z";
const MAX = "2029-08-28T09:07:06.947Z";

function request(changes: Partial<ServerRequest>): ServerRequest {
  return {
    reservationKey: 29,
    status: "inUse",
    resource: {
      resourceKey: 26,
      name: "Oscilloscope 100MHz",
      serialNo: "EE-OSC-001",
      kind: "equipment",
      tier: "T2",
      creditWeight: 3,
    },
    startTime: "2029-08-03T09:07:06.947Z",
    endTime: DUE,
    reason: null,
    decisionNote: null,
    requestedAt: "2026-09-06T09:07:06.970Z",
    expiresAt: null,
    approval: {
      route: "supervisor",
      status: "Approved",
      autoApproved: false,
      approvedAt: "2026-09-17T12:48:34.121Z",
      resolvedAt: "2026-09-17T12:48:34.121Z",
    },
    usageKey: 7,
    dueAt: DUE,
    cancellable: false,
    ...changes,
  };
}

const PENALTY: AppealablePenalty = {
  penaltyKey: 4,
  usageKey: 6,
  reason: "LostItem: not returned within 14 days (scheduled)",
  creditDeducted: 8,
  issuedAt: "2026-09-21T17:15:00.198Z",
  expiresAt: "2026-10-07T17:15:00.198Z",
  inEffect: true,
  appealableUntil: "2026-09-28T17:15:00.198Z",
};

/** What the fake server currently holds; each test shapes it in `beforeEach` or inline. */
let db: {
  loans: ServerRequest[];
  options: ServerExtensionOptions;
  pending: ServerExtension[];
  appealable: AppealablePenalty[];
  appeals: AppealOutput[];
};

function page<T>(items: T[]) {
  return { items, total: items.length, page: 1, pageSize: 100 };
}

function serve(path: string, input: Record<string, unknown> | undefined): unknown {
  switch (path) {
    case "loan.list":
      return page(db.loans);
    case "loan.extensionOptions":
      return db.options;
    case "loan.myExtensions":
      return page(db.pending);
    case "loan.requestExtension": {
      const input_ = input as { usageKey: number; requestedDueAt: string };
      if (db.options.route === "auto") {
        // Granted in the call, as the server does: the due date moves.
        db.loans = db.loans.map((l) =>
          l.usageKey === input_.usageKey ? { ...l, dueAt: input_.requestedDueAt } : l,
        );
        db.options = { ...db.options, extensionsUsed: db.options.extensionsUsed + 1, currentDueAt: input_.requestedDueAt };
        return { extensionKey: 98, status: "Approved" };
      }
      const pending = {
        extensionKey: 99,
        usageKey: input_.usageKey,
        status: "Pending",
        route: db.options.route,
        requestedDueAt: input_.requestedDueAt,
      } as ServerExtension;
      db.pending = [pending];
      db.options = { ...db.options, canRequest: false, blockedBy: "EXTENSION_ALREADY_PENDING", route: null, pendingExtensionKey: 99 };
      return pending;
    }
    case "loan.cancelExtension":
      db.pending = [];
      db.options = { ...db.options, canRequest: true, blockedBy: null, route: "supervisor", pendingExtensionKey: null };
      return { extensionKey: 99, status: "Canceled" };
    case "appeal.appealable":
      return db.appealable;
    case "appeal.mine":
      return page(db.appeals);
    case "appeal.create": {
      const { penaltyKey, appealReason } = input as { penaltyKey: number; appealReason: string };
      const penalty = db.appealable.find((p) => p.penaltyKey === penaltyKey)!;
      const appeal = {
        appealKey: 1,
        status: "pending",
        appealReason,
        filedAt: "2026-09-23T12:00:00.000Z",
        resolvedAt: null,
        filedBy: { accountKey: 3, studentId: "test_borrower", firstName: "N", lastName: "S", creditScore: 84 },
        resolvedBy: null,
        penalty: { ...penalty },
        replacementPenalty: null,
        creditRestored: 0,
        inspectorKeys: [],
      } as AppealOutput;
      db.appealable = db.appealable.filter((p) => p.penaltyKey !== penaltyKey);
      db.appeals = [appeal];
      return appeal;
    }
    case "image.usagePhotos":
      return { before: [], after: [], inspection: [] };
    case "notification.unreadCount":
      return { unread: 0 };
    default:
      // item.list (the draft's catalogue lookup), notification.list.
      return page([]);
  }
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderAt(path: string, element: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const route = path.split("?")[0];
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  void i18n.changeLanguage("en");
  api.mockReset();
  api.mockImplementation(serve);
  db = {
    loans: [request({})],
    options: {
      usageKey: 7,
      canRequest: true,
      blockedBy: null,
      route: "supervisor",
      requiresInspection: true,
      currentDueAt: DUE,
      maxRequestedDueAt: MAX,
      extensionsUsed: 1,
      extensionsAllowed: 2,
      pendingExtensionKey: null,
    },
    pending: [],
    appealable: [PENALTY],
    appeals: [],
  };
});

describe("borrower home: extensions go to the server", () => {
  it("sends a supervisor-routed request with the server's due date, then withdraws it on the server", async () => {
    renderAt(ROUTES.HOME, <HomePage />);

    const extend = await screen.findByRole("button", { name: i18n.t("borrower.myRequests.extend") });
    await waitFor(() => expect(extend).toBeEnabled());
    fireEvent.click(extend);

    expect(
      screen.getByText(i18n.t("borrower.myRequests.extNewDue", { date: fmtDateTime(MAX) })),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("borrower.myRequests.extAskYesSup") }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "loan.requestExtension",
        expect.objectContaining({ usageKey: 7, requestedDueAt: MAX }),
      ),
    );

    // The pending state is the server's answer after the refetch, not a local flag.
    const withdraw = await screen.findByRole("button", { name: i18n.t("borrower.myRequests.cancelExt") });
    expect(
      screen.getByRole("button", { name: i18n.t("borrower.myRequests.extPending") }),
    ).toBeDisabled();

    fireEvent.click(withdraw);
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("loan.cancelExtension", { extensionKey: 99 }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: i18n.t("borrower.myRequests.cancelExt") })).toBeNull(),
    );
  });

  it("shows the due date loan.list returns after an extension granted straight away", async () => {
    db.options = { ...db.options, route: "auto", requiresInspection: false };
    renderAt(ROUTES.HOME, <HomePage />);

    expect(await screen.findByText(fmtDayMonth(DUE))).toBeInTheDocument();

    const extend = screen.getByRole("button", { name: i18n.t("borrower.myRequests.extend") });
    await waitFor(() => expect(extend).toBeEnabled());
    fireEvent.click(extend);
    fireEvent.click(screen.getByRole("button", { name: i18n.t("borrower.myRequests.extAskYesAuto") }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "loan.requestExtension",
        expect.objectContaining({ usageKey: 7, requestedDueAt: MAX }),
      ),
    );
    expect(await screen.findByText(fmtDayMonth(MAX))).toBeInTheDocument();
    expect(screen.queryByText(fmtDayMonth(DUE))).toBeNull();
  });
});

describe("my requests: statuses and penalties come from the server", () => {
  beforeEach(() => {
    db.loans = [
      request({ reservationKey: 33, status: "returned", usageKey: 6, dueAt: "2026-09-03T11:11:31.583Z" }),
      request({
        reservationKey: 37,
        status: "rejected",
        usageKey: null,
        dueAt: null,
        reason: "Senior project lab",
        decisionNote: "Scope is booked for calibration that week",
      }),
    ];
  });

  it("labels a returned loan as awaiting inspection and shows the deduction the server made", async () => {
    renderAt(ROUTES.MY_LOANS, <MyLoansPage />);
    fireEvent.click(await screen.findByRole("tab", { name: new RegExp(i18n.t("borrower.myRequests.tabHistory")) }));

    const returned = (await screen.findByText("33")).closest("article")!;
    expect(within(returned).getByText(i18n.t("borrower.myRequests.stReturned"))).toBeInTheDocument();
    expect(i18n.t("borrower.myRequests.stReturned")).toMatch(/inspection/i);

    const line = i18n.t("borrower.myRequests.penaltyLine", {
      reason: `${i18n.t("borrower.penalty.reasonLostItem")} (not returned within 14 days (scheduled))`,
      credit: 8,
      date: fmtDate(PENALTY.issuedAt),
    });
    expect(await within(returned).findByText(new RegExp(escape(line)))).toBeInTheDocument();

    fireEvent.click(within(returned).getByRole("button", { name: i18n.t("borrower.myRequests.appeal") }));
    expect(await screen.findByTestId("location")).toHaveTextContent(`${ROUTES.APPEALS}?penalty=4`);
  });

  it("shows the approver's reason on a rejected request, not a canned one", async () => {
    renderAt(ROUTES.MY_LOANS, <MyLoansPage />);
    fireEvent.click(await screen.findByRole("tab", { name: new RegExp(i18n.t("borrower.myRequests.tabHistory")) }));

    const rejected = (await screen.findByText("37")).closest("article")!;
    expect(
      within(rejected).getByText(
        i18n.t("borrower.myRequests.decisionNote", { note: "Scope is booked for calibration that week" }),
      ),
    ).toBeInTheDocument();
  });
});

describe("appeals: filed against a penalty on the server", () => {
  it("files the appeal with appeal.create and lists it from appeal.mine", async () => {
    const { container } = renderAt(`${ROUTES.APPEALS}?penalty=4`, <AppealsPage />);

    const textarea = await screen.findByPlaceholderText(i18n.t("borrower.appeals.whyPlaceholder"));
    // appeal.create carries no images, so there is no control that would drop one.
    expect(container.querySelector('input[type="file"]')).toBeNull();

    const summary = screen.getByText(i18n.t("borrower.appeals.sumCut")).parentElement!;
    expect(summary).toHaveTextContent("8");

    fireEvent.change(textarea, { target: { value: "  It was returned; staff logged it late.  " } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("borrower.appeals.send") }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("appeal.create", {
        penaltyKey: 4,
        appealReason: "It was returned; staff logged it late.",
      }),
    );
    expect(await screen.findByText(i18n.t("borrower.appeals.status_pending"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("borrower.appeals.sentNote"))).toBeInTheDocument();
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
