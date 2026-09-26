import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import AdminConfigPage from "../../src/features/admin/config/config-page";
import AdminStatusPage from "../../src/features/admin/status/status-page";
import {
  technicalConfigOutput,
  systemStatusOutput,
  cronJobOutput,
} from "../../../backend/src/admin/admin.schema";
import { okOutput } from "../../../backend/src/common/schemas/ok.schema";
import {
  queryResult,
  loadingQueryResult,
  errorQueryResult,
  mutationResult,
} from "../fixtures/query-results";

import { getErrorMessage } from "../../src/lib/error-messages";

const useSystemStatusMock = vi.hoisted(() => vi.fn());
const useCronJobsMock = vi.hoisted(() => vi.fn());
const useRunCronJobMock = vi.hoisted(() => vi.fn());
const useTechnicalConfigMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/features/admin/status/use-system-status", () => ({
  useSystemStatus: useSystemStatusMock,
  useCronJobs: useCronJobsMock,
  useRunCronJob: useRunCronJobMock,
}));

vi.mock("../../src/features/admin/config/use-config", () => ({
  useTechnicalConfig: useTechnicalConfigMock,
}));

const STATUS = systemStatusOutput.strict().parse({
  checkedAt: "2026-09-20T02:00:00.000Z",
  uptimeSeconds: 3661,
  nodeVersion: "v22.14.0",
  database: { state: "operational", latencyMs: 12 },
  counts: { accounts: 42, resources: 17, activeLoans: 6, pendingReservations: 3 },
});

const JOBS = [
  {
    id: "markOverdue",
    name: "Mark overdue",
    schedule: "01:00",
    implemented: true,
    lastRunAt: "2026-09-20T01:00:00.000Z",
    lastResult: "success",
    durationMs: 41,
  },
  {
    id: "markLost",
    name: "Mark lost",
    schedule: "*/5 * * * *",
    implemented: false,
    lastRunAt: null,
    lastResult: null,
    durationMs: null,
  },
].map((job) => cronJobOutput.strict().parse(job));

const CONFIG = technicalConfigOutput.strict().parse({
  auth: {
    googleOauthEnabled: false,
    localFallbackEnabled: true,
    allowedEmailDomains: ["ku.th"],
    sessionTimeoutMinutes: 480,
  },
  storage: {
    provider: "local-disk",
    bucket: "./media",
    maxUploadMb: 5,
    presignedUploads: false,
  },
  email: { smtpHost: "", fromAddress: "noreply@ku.th", dueReminderEnabled: false },
  polling: {
    availabilitySeconds: 30,
    facilitySlotsSeconds: 30,
    requestStatusSeconds: 30,
    notificationsSeconds: 30,
    staffQueueSeconds: 30,
    supervisorQueueSeconds: 30,
  },
  security: {
    cookieSecure: true,
    cookieSameSite: "lax",
    allowedOrigins: ["http://localhost:5173"],
    nodeEnv: "production",
  },
});

describe("IT admin status and technical configuration pages", () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    i18n.changeLanguage("en");
    vi.clearAllMocks();
    useSystemStatusMock.mockReturnValue(queryResult(STATUS));
    useCronJobsMock.mockReturnValue(queryResult(JOBS));
    useRunCronJobMock.mockReturnValue(mutationResult(mutateAsync));
    useTechnicalConfigMock.mockReturnValue(queryResult(CONFIG));
  });

  it("renders API status metrics, cron state, and a successful job result", () => {
    render(
      <MemoryRouter>
        <AdminStatusPage />
      </MemoryRouter>
    );

    expect(screen.getByText("Operational")).toBeInTheDocument();
    expect(screen.getByText("v22.14.0")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Mark lost")).toBeInTheDocument();
    expect(screen.getByText("Not implemented")).toBeInTheDocument();
    expect(screen.getByText("Success")).toBeInTheDocument();
  });

  it("shows loading and unavailable status states", () => {
    useSystemStatusMock.mockReturnValue(loadingQueryResult());
    const { unmount } = render(
      <MemoryRouter>
        <AdminStatusPage />
      </MemoryRouter>
    );
    expect(screen.getByText(i18n.t("common.loading"))).toBeInTheDocument();
    unmount();

    useSystemStatusMock.mockReturnValue(
      errorQueryResult(new Error("Service unavailable"))
    );
    render(
      <MemoryRouter>
        <AdminStatusPage />
      </MemoryRouter>
    );
    expect(screen.getByText(i18n.t("admin.status.unreachable"))).toBeInTheDocument();
  });

  it("reports a typed cron failure without exposing a raw stack trace", async () => {
    mutateAsync.mockRejectedValue({ data: { code: "NOT_IMPLEMENTED" } });
    render(
      <MemoryRouter>
        <AdminStatusPage />
      </MemoryRouter>
    );
    const row = screen.getByText("Mark lost").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Run now" }));

    await waitFor(() => {
      expect(
        within(row as HTMLElement).getByText(
          getErrorMessage({ data: { code: "NOT_IMPLEMENTED" } })
        )
      ).toBeInTheDocument();
    });
    expect(within(row as HTMLElement).queryByText(/Error:/)).not.toBeInTheDocument();
  });

  it("runs a cron job through the mutation hook", async () => {
    mutateAsync.mockResolvedValue(okOutput.parse({ ok: true }));
    render(
      <MemoryRouter>
        <AdminStatusPage />
      </MemoryRouter>
    );
    const row = screen.getByText("Mark overdue").closest("tr");
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Run now" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith("markOverdue"));
  });

  it("renders technical configuration as read-only deployment information", () => {
    render(
      <MemoryRouter>
        <AdminConfigPage />
      </MemoryRouter>
    );

    expect(screen.getByText(i18n.t("admin.config.readOnlyNotice"))).toBeInTheDocument();
    expect(screen.getByText("production")).toBeInTheDocument();
    expect(screen.getByText("local-disk")).toBeInTheDocument();
    expect(screen.getByText("noreply@ku.th")).toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("shows configuration loading and unavailable states", () => {
    useTechnicalConfigMock.mockReturnValue(loadingQueryResult());
    const { unmount } = render(
      <MemoryRouter>
        <AdminConfigPage />
      </MemoryRouter>
    );
    expect(screen.getByText(i18n.t("common.loading"))).toBeInTheDocument();
    unmount();

    useTechnicalConfigMock.mockReturnValue(
      errorQueryResult(new Error("Service unavailable"))
    );
    render(
      <MemoryRouter>
        <AdminConfigPage />
      </MemoryRouter>
    );
    expect(screen.getByText(i18n.t("admin.config.unavailable"))).toBeInTheDocument();
  });
});
