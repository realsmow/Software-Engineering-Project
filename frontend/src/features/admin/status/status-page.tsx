import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Database, Gauge, RefreshCw, TriangleAlert } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ChartCard } from "@/components/ui/chart-card";
import { Segmented } from "@/components/ui/segmented";
import { ChartTooltip, CHART_COLOR, axisProps, gridProps } from "@/components/ui/chart-kit";
import {
  CRON_HISTORY,
  CRON_JOBS,
  HEALTH_TIMELINE,
  SERVICES,
  type CronJob,
  type CronResult,
  type ServiceHealth,
  type ServiceState,
} from "../mock-data";
import { fmtDateTime, fmtDayShort, fmtHour } from "../format";

const SERVICE_TONE: Record<ServiceState, BadgeTone> = {
  operational: "ok",
  degraded: "warn",
  down: "alert",
};
const CRON_TONE: Record<CronResult, BadgeTone> = {
  success: "ok",
  failed: "alert",
  pending: "neutral",
};

type HealthMetric = "latency" | "error";

export default function AdminStatusPage() {
  const { t } = useTranslation();
  const [healthMetric, setHealthMetric] = useState<HealthMetric>("latency");

  const serviceColumns: Column<ServiceHealth>[] = [
    {
      key: "service",
      header: t("admin.status.colService"),
      render: (s) => (
        <span className="u-cell">
          <span className={`hl-dot ${s.state === "operational" ? "ok" : s.state === "degraded" ? "warn" : "alert"}`} />
          <span className="t-strong">{s.name}</span>
        </span>
      ),
    },
    {
      key: "state",
      header: t("admin.status.colState"),
      render: (s) => <Badge tone={SERVICE_TONE[s.state]}>{t(`admin.status.${s.state}`)}</Badge>,
    },
    {
      key: "latency",
      header: t("admin.status.colLatency"),
      align: "right",
      render: (s) => <span className="mono">{s.latencyMs} ms</span>,
    },
    {
      key: "checked",
      header: t("admin.status.colChecked"),
      align: "right",
      render: (s) => <span className="mono t-muted">{fmtDateTime(s.checkedAt)}</span>,
    },
  ];

  const cronColumns: Column<CronJob>[] = [
    {
      key: "job",
      header: t("admin.status.colJob"),
      render: (c) => <span className="t-strong">{c.name}</span>,
    },
    {
      key: "schedule",
      header: t("admin.status.colSchedule"),
      render: (c) => <span className="mono t-muted">{c.schedule}</span>,
    },
    {
      key: "lastRun",
      header: t("admin.status.colLastRun"),
      render: (c) => <span className="mono t-muted">{fmtDateTime(c.lastRunAt)}</span>,
    },
    {
      key: "result",
      header: t("admin.status.colResult"),
      render: (c) => (
        <Badge tone={CRON_TONE[c.result]} dot>
          {t(`admin.status.${c.result}`)}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: () => (
        <Button type="button" variant="outline" size="sm">
          {t("admin.status.runNow")}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("admin.status.title")}
        actions={
          <Button type="button" variant="outline">
            <RefreshCw size={15} strokeWidth={2} />
            {t("common.refresh")}
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<Gauge size={16} strokeWidth={2} />}
          label={t("admin.status.uptime")}
          value="99.97"
          unit="%"
          delta={t("admin.status.last30d")}
          trend="flat"
        />
        <MetricCard
          icon={<Activity size={16} strokeWidth={2} />}
          label={t("admin.status.apiLatency")}
          value="42"
          unit="ms"
          delta="p95 · 118 ms"
          trend="flat"
        />
        <MetricCard
          icon={<Database size={16} strokeWidth={2} />}
          label={t("admin.status.dbConnections")}
          value="24"
          unit="/ 100"
        />
        <MetricCard
          icon={<TriangleAlert size={16} strokeWidth={2} />}
          label={t("admin.status.errorRate")}
          value="0.12"
          unit="%"
          delta={t("admin.status.last24h")}
          trend="flat"
        />
      </div>

      <div className="mb-4">
        <ChartCard
          title={t("admin.charts.systemHealth")}
          height={260}
          actions={
            <Segmented<HealthMetric>
              value={healthMetric}
              onChange={setHealthMetric}
              options={[
                { value: "latency", label: t("admin.charts.latency") },
                { value: "error", label: t("admin.charts.errorRate") },
              ]}
            />
          }
        >
          <AreaChart data={HEALTH_TIMELINE} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="healthFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={healthMetric === "latency" ? CHART_COLOR.info : CHART_COLOR.alert}
                  stopOpacity={0.28}
                />
                <stop
                  offset="100%"
                  stopColor={healthMetric === "latency" ? CHART_COLOR.info : CHART_COLOR.alert}
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="hour" tickFormatter={(h) => fmtHour(h as number)} {...axisProps} />
            <YAxis {...axisProps} width={44} />
            <Tooltip
              content={
                <ChartTooltip
                  unit={healthMetric === "latency" ? " ms" : " %"}
                  labelFormatter={(l) => fmtHour(l as number)}
                />
              }
            />
            <Area
              type="monotone"
              dataKey={healthMetric === "latency" ? "latencyMs" : "errorRate"}
              name={healthMetric === "latency" ? t("admin.charts.latency") : t("admin.charts.errorRate")}
              stroke={healthMetric === "latency" ? CHART_COLOR.info : CHART_COLOR.alert}
              strokeWidth={2}
              fill="url(#healthFill)"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ChartCard>
      </div>

      <div className="mb-4">
        <DataTable
          title={t("admin.status.services")}
          columns={serviceColumns}
          rows={SERVICES}
          rowKey={(s) => s.id}
          pageSize={20}
        />
      </div>

      <div className="mb-4">
        <DataTable
          title={t("admin.status.cronJobs")}
          headerActions={
            <Badge tone="neutral" mono>
              {CRON_JOBS.filter((c) => c.result === "success").length}/{CRON_JOBS.length}
            </Badge>
          }
          columns={cronColumns}
          rows={CRON_JOBS}
          rowKey={(c) => c.id}
          pageSize={20}
        />
      </div>

      <ChartCard title={t("admin.charts.cronRuns")} height={240}>
        <BarChart data={CRON_HISTORY} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="date" tickFormatter={(d) => fmtDayShort(d as string)} {...axisProps} />
          <YAxis {...axisProps} width={44} allowDecimals={false} />
          <Tooltip
            content={<ChartTooltip labelFormatter={(l) => fmtDayShort(l as string)} />}
            cursor={{ fill: "var(--s-inset)", opacity: 0.5 }}
          />
          <Legend />
          <Bar
            dataKey="success"
            stackId="cron"
            name={t("admin.charts.success")}
            fill={CHART_COLOR.ok}
            radius={[0, 0, 0, 0]}
            maxBarSize={34}
          />
          <Bar
            dataKey="failed"
            stackId="cron"
            name={t("admin.charts.failed")}
            fill={CHART_COLOR.alert}
            radius={[3, 3, 0, 0]}
            maxBarSize={34}
          />
        </BarChart>
      </ChartCard>
    </div>
  );
}
