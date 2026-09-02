import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ChevronRight,
  FileText,
  Plus,
  RefreshCw,
  Server,
  Users,
  UserCheck,
  Timer,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ChartCard } from "@/components/ui/chart-card";
import { ChartTooltip, CHART_SERIES, axisProps, gridProps } from "@/components/ui/chart-kit";
import { ROUTES } from "@/constants";
import type { Role } from "@/types/domain";
import {
  ACTIVITY_BY_ROLE,
  ADMIN_USERS,
  AUDIT_EVENTS,
  CRON_JOBS,
  SERVICES,
  roleCounts,
  type ServiceState,
} from "../mock-data";
import { fmtDateTime, fmtDayShort } from "../format";

const ROLE_ORDER: Role[] = ["borrower", "staff", "supervisor", "admin"];

const SERVICE_TONE: Record<ServiceState, BadgeTone> = {
  operational: "ok",
  degraded: "warn",
  down: "alert",
};

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const counts = roleCounts();
  const totalUsers = ADMIN_USERS.length;
  const activeUsers = ADMIN_USERS.filter((u) => u.status === "active").length;
  const opServices = SERVICES.filter((s) => s.state === "operational").length;
  const cronOk = CRON_JOBS.filter((c) => c.result === "success").length;
  const recentAudit = AUDIT_EVENTS.slice(0, 6);

  return (
    <div>
      <PageHeader
        title={t("admin.dashboard.title")}
        actions={
          <Button type="button" variant="outline">
            <RefreshCw size={15} strokeWidth={2} />
            {t("common.refresh")}
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<Users size={16} strokeWidth={2} />}
          label={t("admin.dashboard.totalUsers")}
          value={totalUsers}
        />
        <MetricCard
          icon={<UserCheck size={16} strokeWidth={2} />}
          label={t("admin.dashboard.activeUsers")}
          value={activeUsers}
          unit={`/ ${totalUsers}`}
        />
        <MetricCard
          icon={<Activity size={16} strokeWidth={2} />}
          label={t("admin.dashboard.systemHealth")}
          value={opServices}
          unit={`/ ${SERVICES.length}`}
        />
        <MetricCard
          icon={<Timer size={16} strokeWidth={2} />}
          label={t("admin.dashboard.cronRunning")}
          value={cronOk}
          unit={`/ ${CRON_JOBS.length}`}
        />
      </div>

      <div className="mb-4">
        <ChartCard title={t("admin.charts.activityByRole")} height={260}>
          <AreaChart data={ACTIVITY_BY_ROLE} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" tickFormatter={(d) => fmtDayShort(d as string)} {...axisProps} />
            <YAxis {...axisProps} width={44} allowDecimals={false} />
            <Tooltip content={<ChartTooltip labelFormatter={(l) => fmtDayShort(l as string)} />} />
            <Legend />
            {ROLE_ORDER.map((r, i) => (
              <Area
                key={r}
                type="monotone"
                dataKey={r}
                stackId="act"
                name={t(`nav.${r}`)}
                stroke={CHART_SERIES[i % CHART_SERIES.length]}
                strokeWidth={1.5}
                // Flat tint, no gradient. A vertical fade on stacked bands makes
                // each band brightest where it meets the one above, so the
                // boundaries glow. A flat tint just groups the area under its
                // line. 0.1 was too faint to tell bands apart once the series
                // became four distinct hues rather than shades of one.
                fill={CHART_SERIES[i % CHART_SERIES.length]}
                fillOpacity={0.28}
              />
            ))}
          </AreaChart>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Users by role */}
        <PanelCard
          title={t("admin.dashboard.usersByRole")}
          action={
            <ViewAll label={t("admin.dashboard.viewAll")} onClick={() => navigate(ROUTES.ADMIN_USERS)} />
          }
        >
          <div className="flex flex-col divide-y divide-border">
            {ROLE_ORDER.map((role) => {
              const pct = Math.round((counts[role] / totalUsers) * 100);
              return (
                <div className="flex items-center justify-between gap-4 py-2.5" key={role}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-foreground">{t(`nav.${role}`)}</div>
                    <div className="mt-2 h-1.5 max-w-[260px] overflow-hidden rounded-full bg-[var(--s-subtle)]">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-sm tabular-nums text-foreground">
                    {counts[role]} <span className="text-[var(--s-t4)]">· {pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </PanelCard>

        {/* Service health */}
        <PanelCard
          title={t("admin.dashboard.serviceHealth")}
          action={
            <ViewAll label={t("admin.dashboard.viewAll")} onClick={() => navigate(ROUTES.ADMIN_STATUS)} />
          }
        >
          <div className="flex flex-col divide-y divide-border">
            {SERVICES.map((s) => (
              <div className="flex items-center justify-between gap-4 py-2.5" key={s.id}>
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <span className={`hl-dot ${s.state === "operational" ? "ok" : s.state === "degraded" ? "warn" : "alert"}`} />
                  {s.name}
                </div>
                <Badge tone={SERVICE_TONE[s.state]}>{t(`admin.status.${s.state}`)}</Badge>
              </div>
            ))}
          </div>
        </PanelCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recent audit */}
        <PanelCard
          title={t("admin.dashboard.recentAudit")}
          action={
            <ViewAll label={t("admin.dashboard.viewAll")} onClick={() => navigate(ROUTES.ADMIN_AUDIT)} />
          }
        >
          <div className="flex flex-col divide-y divide-border">
            {recentAudit.map((e) => (
              <div className="flex items-center justify-between gap-4 py-2.5" key={e.id}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-foreground">{e.detail}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.actorName} · {t(`admin.audit.act${cap(e.action)}`)}
                  </div>
                </div>
                <div className="whitespace-nowrap font-mono text-xs text-muted-foreground">{fmtDateTime(e.at)}</div>
              </div>
            ))}
          </div>
        </PanelCard>

        {/* Cron today */}
        <PanelCard
          title={t("admin.dashboard.cronToday")}
          action={
            <ViewAll label={t("admin.dashboard.viewAll")} onClick={() => navigate(ROUTES.ADMIN_STATUS)} />
          }
        >
          <div className="flex flex-col divide-y divide-border">
            {CRON_JOBS.map((c) => (
              <div className="flex items-center justify-between gap-4 py-2.5" key={c.id}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-foreground">{c.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{c.schedule}</div>
                </div>
                <Badge tone={c.result === "success" ? "ok" : c.result === "failed" ? "alert" : "neutral"} dot>
                  {t(`admin.status.${c.result}`)}
                </Badge>
              </div>
            ))}
          </div>
        </PanelCard>
      </div>

      {/* Quick actions */}
      <div className="mt-4">
        <PanelCard title={t("admin.dashboard.quickActions")}>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => navigate(ROUTES.ADMIN_USERS)}>
              <Plus size={15} strokeWidth={2} />
              {t("admin.dashboard.qaCreateUser")}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(ROUTES.ADMIN_AUDIT)}>
              <FileText size={15} strokeWidth={2} />
              {t("admin.dashboard.qaViewAudit")}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(ROUTES.ADMIN_STATUS)}>
              <Activity size={15} strokeWidth={2} />
              {t("admin.dashboard.qaSystemStatus")}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(ROUTES.ADMIN_CONFIG)}>
              <Server size={15} strokeWidth={2} />
              {t("admin.dashboard.qaConfig")}
            </Button>
          </div>
        </PanelCard>
      </div>
    </div>
  );
}

function PanelCard({
  title,
  action,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ViewAll({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick}>
      {label}
      <ChevronRight size={14} strokeWidth={2} />
    </Button>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
