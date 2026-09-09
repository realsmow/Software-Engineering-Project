import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/shared/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { cap } from "@/lib/utils";
import { fmtDateTime } from "@/features/borrower/format";
import { useAdminUsers } from "../users/use-admin-users";
import { useAuditEvents } from "../audit/use-audit-events";
import { useCronJobs, useSystemStatus } from "../status/use-system-status";
import type { ServiceState } from "../status/status.types";

const STATE_TONE: Record<ServiceState, BadgeTone> = {
  operational: "ok",
  degraded: "warn",
  down: "alert",
};

/**
 * The administrative console.
 *
 * ── Why this is a ledger and not a dashboard ──────────────────────────────
 * The SRS puts this reader at "ผู้ดูแลระบบ · มีความรู้ด้าน IT · รายสัปดาห์ ·
 * Desktop": technical, weekly, at a desk. Weekly is the part that decides the
 * layout. Someone who opens a screen every day wants deltas at a glance;
 * someone who opens it every Tuesday has forgotten the context and needs
 * re-orientation - exact state, exact times, and a complete record of what
 * changed while they were away.
 *
 * ── What was here before ──────────────────────────────────────────────────
 * A metric-card grid over invented numbers. It reported 24 users and 20 active
 * accounts against a database holding 4; it drew a seven-day "activity by
 * role" chart from an array of made-up points; and it listed every scheduled
 * job as "Success" when none of the eight is implemented and none has ever
 * run. Six hand-written activity rows stood in for an audit log that actually
 * holds 256 entries. An administrator would have read those figures, believed
 * the system was busy and healthy, and been wrong on every count.
 *
 * So the rule this page is built to: every figure comes from the server, and
 * anything the server cannot answer is absent rather than illustrated. Both
 * charts are gone because there is no history behind them to draw.
 *
 * Machine values are set in `--font-mono` and human prose in `--font-ui`. That
 * is how a register reads in this kind of system - numerals stack into
 * columns you can scan down - and it carries a second meaning here: if it is
 * in mono, it came from a field, not from an author.
 */
export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: status, isLoading, isError } = useSystemStatus();
  const { data: jobs } = useCronJobs();
  const { data: users } = useAdminUsers();
  const { data: audit } = useAuditEvents();

  const byRole = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of users ?? []) counts.set(u.role, (counts.get(u.role) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [users]);

  const jobsNeverRun = (jobs ?? []).filter((j) => !j.implemented).length;

  /**
   * Changes only. A sign-in is not a change, and on a log where most rows are
   * logins they crowd out the handful of entries a weekly visitor is actually
   * scanning for - a role granted, a ban lifted, a setting moved. The full
   * log, logins included, is one click away in the audit page.
   */
  const changes = useMemo(
    () => (audit ?? []).filter((e) => e.action !== "login").slice(0, 8),
    [audit],
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("nav.systemOverview")}
        subtitle={t("admin.overview.subtitle")}
        actions={
          status ? (
            <span className="font-mono text-xs text-t4">
              {t("admin.status.checkedAt", { when: fmtDateTime(status.checkedAt) })}
            </span>
          ) : null
        }
      />

      {isLoading ? (
        <p className="py-16 text-center text-sm text-t3">{t("common.loading")}</p>
      ) : isError || !status ? (
        <p className="rounded border border-[var(--s-warn-b)] bg-[var(--s-warn-bg)] px-3.5 py-3 text-[13px] text-[var(--s-warn-t)]">
          {t("admin.status.unreachable")}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Condition first: the one question a weekly visitor arrives with. */}
          <Ledger>
            <Row
              label={t("admin.status.database")}
              value={
                <Badge tone={STATE_TONE[status.database.state]}>
                  {t(`admin.status.state${cap(status.database.state)}`)}
                </Badge>
              }
              trailing={
                status.database.latencyMs === null
                  ? t("admin.status.noLatency")
                  : t("admin.status.latency", { ms: status.database.latencyMs })
              }
            />
            <Row
              label={t("admin.status.uptime")}
              value={<Mono>{formatUptime(status.uptimeSeconds)}</Mono>}
              trailing={status.nodeVersion}
            />
          </Ledger>

          <Ledger title={t("admin.overview.records")}>
            <Row label={t("admin.status.accounts")} value={<Mono>{status.counts.accounts}</Mono>} />
            <Row label={t("admin.status.resources")} value={<Mono>{status.counts.resources}</Mono>} />
            <Row
              label={t("admin.status.activeLoans")}
              value={<Mono>{status.counts.activeLoans}</Mono>}
            />
            <Row
              label={t("admin.overview.awaitingDecision")}
              value={<Mono>{status.counts.pendingReservations}</Mono>}
            />
          </Ledger>

          {/* Counted from the account list itself, not from a stored figure
              that could disagree with it. */}
          {byRole.length > 0 ? (
            <Ledger
              title={t("admin.overview.accountsByRole")}
              action={
                <LedgerLink onClick={() => navigate(ROUTES.ADMIN_USERS)}>
                  {t("admin.overview.openUsers")}
                </LedgerLink>
              }
            >
              {byRole.map(([role, count]) => (
                <Row key={role} label={t(`nav.${role}`)} value={<Mono>{count}</Mono>} />
              ))}
            </Ledger>
          ) : null}

          <Ledger
            title={t("admin.status.scheduledJobs")}
            action={
              <span className="font-mono text-xs text-t4">
                {jobs
                  ? t("admin.overview.jobsSummary", {
                      total: jobs.length,
                      pending: jobsNeverRun,
                    })
                  : ""}
              </span>
            }
          >
            {(jobs ?? []).map((job) => (
              <Row
                key={job.id}
                label={job.name}
                mono
                value={
                  !job.implemented ? (
                    <Badge tone="neutral">{t("admin.status.notImplemented")}</Badge>
                  ) : job.lastResult === null ? (
                    <Badge tone="neutral">{t("admin.status.neverRun")}</Badge>
                  ) : (
                    <Badge
                      tone={
                        job.lastResult === "success"
                          ? "ok"
                          : job.lastResult === "failed"
                            ? "alert"
                            : "warn"
                      }
                    >
                      {t(`admin.status.result${cap(job.lastResult)}`)}
                    </Badge>
                  )
                }
                trailing={job.schedule}
              />
            ))}
          </Ledger>

          {/* The change record. What a weekly visitor is really here for. */}
          <Ledger
            title={t("admin.overview.changeRecord")}
            action={
              <LedgerLink onClick={() => navigate(ROUTES.ADMIN_AUDIT)}>
                {t("admin.overview.openAudit")}
              </LedgerLink>
            }
          >
            {changes.map((e) => (
              <Row
                key={e.id}
                label={e.detail || t(`admin.audit.action${cap(e.action)}`)}
                value={<span className="text-t2">{e.actorName}</span>}
                trailing={fmtDateTime(e.at)}
              />
            ))}
            {audit && changes.length === 0 ? (
              <p className="px-3.5 py-3 text-[13px] text-t3">{t("admin.overview.noChanges")}</p>
            ) : null}
          </Ledger>
        </div>
      )}
    </div>
  );
}

/**
 * A titled block of aligned rows.
 *
 * Rows rather than cards: the figures on this page are meant to be read down a
 * column and compared, which a grid of separately-boxed numbers actively
 * prevents.
 */
function Ledger({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      {title ? (
        <div className="flex items-baseline justify-between gap-3 border-b border-border px-3.5 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

/**
 * One fact.
 *
 * `value` sits in a fixed column so numerals line up between rows, and
 * `trailing` carries the secondary machine detail (latency, a cron expression,
 * a timestamp) at the right edge where it can be ignored until wanted.
 */
function Row({
  label,
  value,
  trailing,
  mono = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  trailing?: React.ReactNode;
  /** Set when the label is itself a machine identifier, like a job id. */
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3.5 py-2.5">
      <span
        className={
          mono
            ? "min-w-0 flex-1 truncate font-mono text-[13px] text-foreground"
            : "min-w-0 flex-1 truncate text-[13px] text-foreground"
        }
      >
        {label}
      </span>
      <span className="shrink-0 text-right text-[13px]">{value}</span>
      {trailing ? (
        <span className="w-32 shrink-0 text-right font-mono text-[11px] text-t4">{trailing}</span>
      ) : null}
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[15px] font-semibold tabular-nums text-foreground">
      {children}
    </span>
  );
}

function LedgerLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      {children}
    </Button>
  );
}

/** Largest sensible unit; seconds stop being information after a few minutes. */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
