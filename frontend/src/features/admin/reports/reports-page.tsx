import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Boxes, Download, Percent, RefreshCw, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChartTooltip, CHART_COLOR, axisProps, gridProps } from "@/components/ui/chart-kit";
import {
  DEPT_REPORTS,
  LOANS_TREND,
  TOP_EQUIPMENT,
  deptName,
  type DeptReport,
  type TopEquipment,
} from "../mock-data";

type Period = "month" | "semester" | "year";

const TIER_TONE: Record<TopEquipment["tier"], BadgeTone> = {
  T0: "neutral",
  T1: "info",
  T2: "warn",
  T3: "hot",
};

export default function AdminReportsPage() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>("semester");

  const deptChartData = useMemo(
    () => DEPT_REPORTS.map((d) => ({ ...d, name: deptName(d.departmentId) })),
    [],
  );

  const totalLoans = DEPT_REPORTS.reduce((sum, d) => sum + d.loans, 0);
  const totalOverdue = DEPT_REPORTS.reduce((sum, d) => sum + d.overdue, 0);
  const overdueRate = ((totalOverdue / totalLoans) * 100).toFixed(1);
  const avgUtil = Math.round(
    DEPT_REPORTS.reduce((sum, d) => sum + d.utilization, 0) / DEPT_REPORTS.length,
  );
  const activeLoans = 148;

  const deptColumns: Column<DeptReport>[] = [
    {
      key: "dept",
      header: t("admin.reports.colDept"),
      render: (d) => <span className="t-strong">{deptName(d.departmentId)}</span>,
    },
    {
      key: "loans",
      header: t("admin.reports.colLoans"),
      align: "right",
      render: (d) => <span className="mono">{d.loans}</span>,
    },
    {
      key: "overdue",
      header: t("admin.reports.colOverdue"),
      align: "right",
      render: (d) => (
        <span className="mono" style={{ color: d.overdue > 15 ? "var(--s-alert-t)" : undefined }}>
          {d.overdue}
        </span>
      ),
    },
    {
      key: "util",
      header: t("admin.reports.colUtil"),
      align: "right",
      render: (d) => (
        <span className="flex items-center justify-end gap-2">
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--s-subtle)]">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${d.utilization}%`,
                background: d.utilization < 50 ? "var(--s-warn-t)" : "var(--accent)",
              }}
            />
          </span>
          <span className="min-w-[34px] text-right font-mono text-muted-foreground">
            {d.utilization}%
          </span>
        </span>
      ),
    },
  ];

  const equipColumns: Column<TopEquipment>[] = [
    {
      key: "name",
      header: t("admin.reports.colEquipment"),
      render: (e) => <span className="t-strong">{e.name}</span>,
    },
    {
      key: "tier",
      header: t("admin.reports.colTier"),
      render: (e) => <Badge tone={TIER_TONE[e.tier]} mono>{e.tier}</Badge>,
    },
    {
      key: "count",
      header: t("admin.reports.colCount"),
      align: "right",
      render: (e) => <span className="mono">{e.count}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("admin.reports.title")}
        actions={
          <>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">{t("admin.reports.thisMonth")}</SelectItem>
                <SelectItem value="semester">{t("admin.reports.thisSemester")}</SelectItem>
                <SelectItem value="year">{t("admin.reports.thisYear")}</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline">
              <Download size={15} strokeWidth={2} />
              {t("common.export")}
            </Button>
            <Button type="button" variant="outline">
              <RefreshCw size={15} strokeWidth={2} />
              {t("common.refresh")}
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<TrendingUp size={16} strokeWidth={2} />}
          label={t("admin.reports.totalLoans")}
          value={totalLoans.toLocaleString()}
        />
        <MetricCard
          icon={<Boxes size={16} strokeWidth={2} />}
          label={t("admin.reports.activeLoans")}
          value={activeLoans}
        />
        <MetricCard
          icon={<Percent size={16} strokeWidth={2} />}
          label={t("admin.reports.overdueRate")}
          value={overdueRate}
          unit="%"
        />
        <MetricCard
          icon={<Percent size={16} strokeWidth={2} />}
          label={t("admin.reports.utilization")}
          value={avgUtil}
          unit="%"
        />
      </div>

      <div className="mb-4">
        <ChartCard title={t("admin.charts.loansByDept")} height={260}>
          <BarChart data={deptChartData} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...axisProps} tick={{ fill: "var(--s-t3)", fontSize: 10 }} interval={0} />
            <YAxis {...axisProps} width={44} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--s-inset)", opacity: 0.5 }} />
            <Legend />
            <Bar dataKey="loans" name={t("admin.charts.loans")} fill={CHART_COLOR.accent} maxBarSize={40} radius={[3, 3, 0, 0]} />
            <Bar dataKey="overdue" name={t("admin.charts.overdue")} fill={CHART_COLOR.alert} maxBarSize={40} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>

      <div className="mb-4">
        <DataTable
          title={t("admin.reports.loansByDept")}
          columns={deptColumns}
          rows={DEPT_REPORTS}
          rowKey={(d) => d.departmentId}
          pageSize={20}
        />
      </div>

      <div className="mb-4">
        <ChartCard title={t("admin.charts.loanTrend")} height={260}>
          <LineChart data={LOANS_TREND} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis {...axisProps} width={44} />
            <Tooltip content={<ChartTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="loans" name={t("admin.charts.loans")} stroke={CHART_COLOR.accent} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="returns" name={t("admin.charts.returns")} stroke={CHART_COLOR.info} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="overdue" name={t("admin.charts.overdue")} stroke={CHART_COLOR.alert} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ChartCard>
      </div>

      <DataTable
        title={t("admin.reports.topEquipment")}
        columns={equipColumns}
        rows={TOP_EQUIPMENT}
        rowKey={(e) => e.name}
        pageSize={20}
      />
    </div>
  );
}
