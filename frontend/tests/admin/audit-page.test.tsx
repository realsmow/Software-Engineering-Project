import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import AdminAuditPage from "../../src/features/admin/audit/audit-page";
import type { AuditEvent } from "../../src/features/admin/admin-constants";
import { auditEventOutput } from "../../../backend/src/admin/admin.schema";
import { toAuditEvent } from "../../src/features/admin/audit/audit-event.adapter";

const useAuditEventsMock = vi.hoisted(() => vi.fn());

Element.prototype.scrollIntoView = vi.fn();

vi.mock("../../src/features/admin/audit/use-audit-events", () => ({
  useAuditEvents: useAuditEventsMock,
}));

const EVENTS: AuditEvent[] = [
  {
    id: "10",
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
    id: "11",
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
].map((event) =>
  toAuditEvent(auditEventOutput.strict().parse({ ...event, id: Number(event.id) }))
);

const NOW = Date.parse("2031-09-26T00:00:00.000Z");
const DAY = 86_400_000;
function eventAt(
  id: number,
  age: number,
  changes: Partial<ReturnType<typeof auditEventOutput.parse>> = {}
): AuditEvent {
  return toAuditEvent(
    auditEventOutput.strict().parse({
      id,
      at: new Date(NOW - age).toISOString(),
      actorId: 6,
      actorName: "System admin",
      actorRole: "admin",
      action: "config",
      target: `system/event-${id}`,
      ip: null,
      userAgent: null,
      detail: "Changed settings",
      ...changes,
    })
  );
}

describe("AdminAuditPage", () => {
  const refetch = vi.fn();

  beforeEach(() => {
    i18n.changeLanguage("en");
    vi.clearAllMocks();
    useAuditEventsMock.mockReturnValue({ data: EVENTS, refetch });
  });
  afterEach(() => vi.restoreAllMocks());

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
    useAuditEventsMock.mockReturnValue({ data: [], refetch });
    renderPage();

    expect(screen.getByText(i18n.t("table.empty"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("table.emptyDesc"))).toBeInTheDocument();
  });

  it("refreshes the audit query and updates the reference timestamp", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.refresh") }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { key: "range24h", age: DAY },
    { key: "range7d", age: 7 * DAY },
  ])(
    "includes the exact $key cutoff and excludes a record one millisecond earlier",
    async ({ key, age }) => {
      vi.spyOn(Date, "now").mockReturnValue(NOW);
      useAuditEventsMock.mockReturnValue({
        data: [eventAt(20, age), eventAt(21, age + 1), eventAt(22, 0)],
        refetch,
      });
      renderPage();
      fireEvent.click(
        screen.getByRole("combobox", { name: i18n.t("admin.audit.timeRange") })
      );
      fireEvent.click(
        await screen.findByRole("option", { name: i18n.t(`admin.audit.${key}`) })
      );
      expect(screen.getByText("system/event-20")).toBeInTheDocument();
      expect(screen.getByText("system/event-22")).toBeInTheDocument();
      expect(screen.queryByText("system/event-21")).not.toBeInTheDocument();
    }
  );

  it("recalculates the relative cutoff when the user refreshes after time has passed", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(NOW);
    useAuditEventsMock.mockReturnValue({ data: [eventAt(20, DAY)], refetch });
    renderPage();
    fireEvent.click(
      screen.getByRole("combobox", { name: i18n.t("admin.audit.timeRange") })
    );
    fireEvent.click(
      await screen.findByRole("option", { name: i18n.t("admin.audit.range24h") })
    );
    expect(screen.getByText("system/event-20")).toBeInTheDocument();
    clock.mockReturnValue(NOW + 1);
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.refresh") }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("system/event-20")).not.toBeInTheDocument();
  });

  it("exports only rows matching actor, action and time filters with UTF-8 and CSV escaping", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const actor = 'ผู้ดูแล, "A"';
    const detail = 'Changed "limits",\nwith a second line';
    useAuditEventsMock.mockReturnValue({
      data: [
        eventAt(30, 0, { actorName: actor, detail }),
        eventAt(31, 0, { actorName: actor, action: "login" }),
        eventAt(32, DAY + 1, { actorName: actor }),
        eventAt(33, 0, { actorName: "Other user" }),
      ],
      refetch,
    });
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:audit");
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    let filename = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      filename = this.download;
    });
    renderPage();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ผู้ดูแล" } });
    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(
      await screen.findByRole("option", { name: i18n.t("admin.audit.actConfig") })
    );
    fireEvent.click(
      screen.getByRole("combobox", { name: i18n.t("admin.audit.timeRange") })
    );
    fireEvent.click(
      await screen.findByRole("option", { name: i18n.t("admin.audit.range24h") })
    );
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.export") }));
    expect(create).toHaveBeenCalledTimes(1);
    const blob = create.mock.calls[0][0] as Blob;
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(new TextDecoder().decode(bytes)).toBe(
      'id,at,actor,role,action,target,ip,detail\n"30","2031-09-26T00:00:00.000Z","ผู้ดูแล, ""A""","admin","config","system/event-30","-","Changed ""limits"",\nwith a second line"'
    );
    expect(filename).toBe("audit-log.csv");
    expect(revoke).toHaveBeenCalledWith("blob:audit");
  });
});
