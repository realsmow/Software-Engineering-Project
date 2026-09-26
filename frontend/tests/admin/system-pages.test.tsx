import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import AdminConfigPage from "../../src/features/admin/config/config-page";
import AdminStatusPage from "../../src/features/admin/status/status-page";
import type { TechnicalConfig } from "../../src/features/admin/config/config.types";
import type { CronJob, SystemStatus } from "../../src/features/admin/status/status.types";
import { getErrorMessage } from "../../src/lib/error-messages";
import { workHoursSetting } from "../../../backend/src/admin/admin.schema";

const useSystemStatusMock = vi.hoisted(() => vi.fn());
const useCronJobsMock = vi.hoisted(() => vi.fn());
const useRunCronJobMock = vi.hoisted(() => vi.fn());
const useTechnicalConfigMock = vi.hoisted(() => vi.fn());
const useWorkHoursMock = vi.hoisted(() => vi.fn());
const useUpdateWorkHoursMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/features/admin/status/use-system-status", () => ({
  useSystemStatus: useSystemStatusMock,
  useCronJobs: useCronJobsMock,
  useRunCronJob: useRunCronJobMock,
}));

vi.mock("../../src/features/admin/config/use-config", () => ({
  useTechnicalConfig: useTechnicalConfigMock,
  useWorkHours: useWorkHoursMock,
  useUpdateWorkHours: useUpdateWorkHoursMock,
}));

const STATUS: SystemStatus = {
  checkedAt: "2026-09-20T02:00:00.000Z",
  uptimeSeconds: 3661,
  nodeVersion: "v22.14.0",
  database: { state: "operational", latencyMs: 12 },
  counts: { accounts: 42, resources: 17, activeLoans: 6, pendingReservations: 3 },
};

const JOBS: CronJob[] = [
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
    id: "openT3InspectionRounds",
    name: "Open T3 inspection rounds",
    schedule: "*/5 * * * *",
    implemented: false,
    lastRunAt: null,
    lastResult: null,
    durationMs: null,
  },
];

const CONFIG: TechnicalConfig = {
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
};

describe("IT admin status and technical configuration pages", () => {
  const mutateAsync = vi.fn();
  const saveHours = vi.fn();

  beforeEach(() => {
    i18n.changeLanguage("en");
    vi.clearAllMocks();
    useWorkHoursMock.mockReturnValue({ data: undefined });
    useUpdateWorkHoursMock.mockReturnValue({
      mutate: saveHours,
      isPending: false,
      isError: false,
    });
    useSystemStatusMock.mockReturnValue({
      data: STATUS,
      isLoading: false,
      isError: false,
    });
    useCronJobsMock.mockReturnValue({ data: JOBS, isLoading: false, isError: false });
    useRunCronJobMock.mockReturnValue({ mutateAsync, isPending: false });
    useTechnicalConfigMock.mockReturnValue({
      data: CONFIG,
      isLoading: false,
      isError: false,
    });
  });

  it("edits working hours and submits the schema-valid range", () => {
    useWorkHoursMock.mockReturnValue({
      data: workHoursSetting.parse({ start: 8, end: 17 }),
    });
    render(<AdminConfigPage />);
    const save = screen.getByRole("button", { name: i18n.t("common.save") });
    expect(save).toBeDisabled();
    fireEvent.change(
      screen.getByRole("spinbutton", { name: i18n.t("admin.config.work_end") }),
      {
        target: { value: "18" },
      }
    );
    fireEvent.click(save);
    expect(saveHours).toHaveBeenCalledWith(
      workHoursSetting.parse({ start: 8, end: 18 }),
      {
        onSuccess: expect.any(Function),
      }
    );
  });

  it.each(["8", "7", "24"])("prevents saving an invalid closing hour %s", (end) => {
    useWorkHoursMock.mockReturnValue({
      data: workHoursSetting.parse({ start: 8, end: 17 }),
    });
    render(<AdminConfigPage />);
    fireEvent.change(
      screen.getByRole("spinbutton", { name: i18n.t("admin.config.work_end") }),
      {
        target: { value: end },
      }
    );
    expect(screen.getByRole("button", { name: i18n.t("common.save") })).toBeDisabled();
    expect(saveHours).not.toHaveBeenCalled();
  });

  it("renders live status metrics, cron state, and a successful job result", () => {
    render(
      <MemoryRouter>
        <AdminStatusPage />
      </MemoryRouter>
    );

    expect(screen.getByText("Operational")).toBeInTheDocument();
    expect(screen.getByText("v22.14.0")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Open T3 inspection rounds")).toBeInTheDocument();
    expect(screen.getByText("Not implemented")).toBeInTheDocument();
    expect(screen.getByText("Success")).toBeInTheDocument();
  });

  it("shows loading and unavailable status states", () => {
    useSystemStatusMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    const { unmount } = render(
      <MemoryRouter>
        <AdminStatusPage />
      </MemoryRouter>
    );
    expect(screen.getByText(i18n.t("common.loading"))).toBeInTheDocument();
    unmount();

    useSystemStatusMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
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
    const row = screen.getByText("Open T3 inspection rounds").closest("tr");
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
    mutateAsync.mockResolvedValue({ ok: true });
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
    useTechnicalConfigMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    const { unmount } = render(
      <MemoryRouter>
        <AdminConfigPage />
      </MemoryRouter>
    );
    expect(screen.getByText(i18n.t("common.loading"))).toBeInTheDocument();
    unmount();

    useTechnicalConfigMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(
      <MemoryRouter>
        <AdminConfigPage />
      </MemoryRouter>
    );
    expect(screen.getByText(i18n.t("admin.config.unavailable"))).toBeInTheDocument();
  });
});
