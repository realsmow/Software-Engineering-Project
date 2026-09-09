import { cap } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shared/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { fmtDateTime } from "@/features/borrower/format";
import { useCronJobs, useSystemStatus } from "./use-system-status";
import type { CronJob, ServiceState } from "./status.types";

const STATE_TONE: Record<ServiceState, BadgeTone> = {
  operational: "ok",
  degraded: "warn",
  down: "alert",
};

/**
 * System status.
 *
 * Shows only what the server actually measures. The previous version listed
 * seven services - S3, MongoDB, SMTP, a web client - with invented latencies
 * and one permanently "degraded", none of which anything checks:
 * `admin.getSystemStatus` probes the database and nothing else. A fabricated
 * outage on a status page is worse than a blank one, because somebody goes and
 * investigates it.
 *
 * The two charts went the same way. They drew a health timeline and a cron
 * history from arrays of made-up points; the server keeps no history to draw.
 */
export default function AdminStatusPage() {
  const { t } = useTranslation();
  const { data: status, isLoading, isError } = useSystemStatus();
  const { data: jobs } = useCronJobs();

  return (
    <div>
      <PageHeader
        title={t("nav.systemStatus")}
        subtitle={t("admin.status.subtitle")}
        actions={
          status ? (
            <span className="font-mono text-xs text-t4">
              {t("admin.status.checkedAt", { when: fmtDateTime(status.checkedAt) })}
            </span>
          ) : null
        }
      />

      {isLoading ? (
        <div className="py-16 text-center text-sm text-t3">{t("common.loading")}</div>
      ) : isError || !status ? (
        <div className="rounded-lg border border-[var(--s-warn-b)] bg-[var(--s-warn-bg)] px-4 py-3 text-[13px] text-[var(--s-warn-t)]">
          {t("admin.status.unreachable")}
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label={t("admin.status.database")}
              value={t(`admin.status.state${cap(status.database.state)}`)}
              tone={STATE_TONE[status.database.state]}
              detail={
                status.database.latencyMs === null
                  ? t("admin.status.noLatency")
                  : t("admin.status.latency", { ms: status.database.latencyMs })
              }
            />
            <Tile
              label={t("admin.status.uptime")}
              value={t(uptimeLabel(status.uptimeSeconds).key, {
                count: uptimeLabel(status.uptimeSeconds).count,
              })}
            />
            <Tile label={t("admin.status.nodeVersion")} value={status.nodeVersion} />
            <Tile
              label={t("admin.status.activeLoans")}
              value={String(status.counts.activeLoans)}
              detail={t("admin.status.pending", { count: status.counts.pendingReservations })}
            />
          </div>

          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            <Tile label={t("admin.status.accounts")} value={String(status.counts.accounts)} />
            <Tile label={t("admin.status.resources")} value={String(status.counts.resources)} />
          </div>

          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="border-b border-border px-3.5 py-2.5 text-sm font-semibold text-foreground">
              {t("admin.status.scheduledJobs")}
            </div>
            {!jobs ? (
              <div className="px-3.5 py-6 text-center text-sm text-t3">{t("common.loading")}</div>
            ) : (
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-secondary">
                    <Th>{t("admin.status.colJob")}</Th>
                    <Th>{t("admin.status.colSchedule")}</Th>
                    <Th>{t("admin.status.colLastRun")}</Th>
                    <Th>{t("common.status")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <JobRow key={job.id} job={job} />
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function JobRow({ job }: { job: CronJob }) {
  const { t } = useTranslation();
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3.5 py-2">
        <div className="text-foreground">{job.name}</div>
        <div className="mt-0.5 font-mono text-[11px] text-t4">{job.id}</div>
      </td>
      <td className="whitespace-nowrap px-3.5 py-2 font-mono text-xs text-t2">{job.schedule}</td>
      <td className="whitespace-nowrap px-3.5 py-2 font-mono text-xs text-t2">
        {job.lastRunAt ? fmtDateTime(job.lastRunAt) : "-"}
        {job.durationMs !== null ? (
          <span className="ml-1.5 text-t4">{t("admin.status.ms", { ms: job.durationMs })}</span>
        ) : null}
      </td>
      <td className="px-3.5 py-2">
        {/* "Not built yet" and "built but never fired" both show a null
            lastRunAt. Without this they read identically, and somebody goes
            looking for a scheduler fault that is really a missing feature. */}
        {!job.implemented ? (
          <Badge tone="neutral">{t("admin.status.notImplemented")}</Badge>
        ) : job.lastResult === null ? (
          <Badge tone="neutral">{t("admin.status.neverRun")}</Badge>
        ) : (
          <Badge tone={job.lastResult === "success" ? "ok" : job.lastResult === "failed" ? "alert" : "warn"}>
            {t(`admin.status.result${cap(job.lastResult)}`)}
          </Badge>
        )}
      </td>
    </tr>
  );
}

function Tile({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: BadgeTone;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="text-xs text-t3">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        {tone ? (
          <Badge tone={tone}>{value}</Badge>
        ) : (
          <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
            {value}
          </span>
        )}
      </div>
      {detail ? <div className="mt-0.5 text-[11px] text-t4">{detail}</div> : null}
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="border-b border-border px-3.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.03em] text-t3">
      {children}
    </th>
  );
}

/**
 * Uptime as the largest sensible unit; seconds are noise after a few minutes.
 *
 * Returns the key and count rather than a string so the caller does the
 * translating - passing `t` around means re-declaring its type, and a
 * hand-written signature for it does not match i18next's.
 */
function uptimeLabel(seconds: number): { key: string; count: number } {
  if (seconds < 60) return { key: "admin.status.uptimeSeconds", count: seconds };
  if (seconds < 3600) return { key: "admin.status.uptimeMinutes", count: Math.floor(seconds / 60) };
  if (seconds < 86400) return { key: "admin.status.uptimeHours", count: Math.floor(seconds / 3600) };
  return { key: "admin.status.uptimeDays", count: Math.floor(seconds / 86400) };
}
