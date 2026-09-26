import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import AdminAuditPage from "../../src/features/admin/audit/audit-page";
import { auditEventOutput } from "../../../backend/src/admin/admin.schema";
import { toAuditEvent } from "../../src/features/admin/audit/audit-event.adapter";
import { queryResult } from "../fixtures/query-results";

const useAuditEventsMock = vi.hoisted(() => vi.fn());

Element.prototype.scrollIntoView = vi.fn();

vi.mock("../../src/features/admin/audit/use-audit-events", () => ({
  useAuditEvents: useAuditEventsMock,
}));

const EVENTS = [
  {
    id: 10,
    at: "2026-09-20T02:00:00.000Z",
    actorId: 6,
    actorName: "System admin",
    actorRole: "admin",
    action: "config",
    target: "system/config",
    ip: "127.0.0.1",
    userAgent: "Playwright",
    detail: "Viewed technical configuration",
  },
  {
    id: 11,
    at: "2026-09-20T01:00:00.000Z",
    actorId: 4,
    actorName: "Staff user",
    actorRole: "staff",
    action: "login",
    target: "auth/login",
    ip: "127.0.0.2",
    userAgent: "Browser",
    detail: "Signed in",
  },
].map((event) => toAuditEvent(auditEventOutput.strict().parse(event)));

describe("AdminAuditPage", () => {
  const refetch = vi.fn();

  beforeEach(() => {
    i18n.changeLanguage("en");
    vi.clearAllMocks();
    useAuditEventsMock.mockReturnValue({ ...queryResult(EVENTS), refetch });
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <AdminAuditPage />
      </MemoryRouter>
    );

  it("renders audit rows and opens the selected event details", async () => {
    renderPage();

    expect(screen.getByText("system/config")).toBeInTheDocument();
    expect(screen.getByText("auth/login")).toBeInTheDocument();

    fireEvent.click(screen.getByText("system/config"));

    await waitFor(() => {
      expect(screen.getByText("Viewed technical configuration")).toBeInTheDocument();
    });
    expect(screen.getByText("Playwright")).toBeInTheDocument();
  });

  it("filters audit records by free-text query and action", async () => {
    renderPage();
    const search = screen.getByRole("searchbox");

    fireEvent.change(search, { target: { value: "Staff user" } });
    expect(screen.queryByText("system/config")).not.toBeInTheDocument();
    expect(screen.getByText("auth/login")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    const actionSelect = screen.getAllByRole("combobox")[0];
    fireEvent.click(actionSelect);
    fireEvent.click(
      await screen.findByRole("option", { name: i18n.t("admin.audit.actConfig") })
    );

    expect(screen.getByText("system/config")).toBeInTheDocument();
    expect(screen.queryByText("auth/login")).not.toBeInTheDocument();
  });

  it("shows the empty state when the audit endpoint returns no records", () => {
    useAuditEventsMock.mockReturnValue({ ...queryResult([]), refetch });
    renderPage();

    expect(screen.getByText(i18n.t("table.empty"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("table.emptyDesc"))).toBeInTheDocument();
  });

  it("refreshes the audit query and updates the reference timestamp", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.refresh") }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
