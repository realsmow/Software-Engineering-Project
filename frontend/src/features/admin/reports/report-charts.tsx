import { useTranslation } from "react-i18next";
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
import { ChartCard } from "@/components/ui/chart-card";
import { CHART_COLOR, CHART_SERIES, ChartTooltip, axisProps, gridProps } from "@/components/ui/chart-kit";
import { fmtDayMonth, localInstant } from "@/lib/datetime";
import type { ReportSummary } from "./report.types";

const dayLabel = (day: string) => fmtDayMonth(localInstant(day, 12));
/** Long Thai department names would push the plot off the card. */
const shorten = (name: string) => (name.length > 18 ? `${name.slice(0, 17)}…` : name);

/**
 * The report's figures as charts. Every point comes from the summary the
 * server counted; the tables below on the page carry the same numbers for
 * anyone who cannot read a chart.
 */
export function ReportCharts({ data }: { data: ReportSummary }) {
  const { t } = useTranslation();
  const departments = data.departments.map((d) => ({
    name: shorten(d.name ?? t("admin.reports.unnamedGroup")),
    utilization: d.utilization,
  }));
  const top = data.topEquipment.map((e) => ({ name: shorten(e.name ?? "-"), count: e.count }));
  const damage = data.damage.map((d) => ({
    name: t(`admin.reports.condition.${d.condition}`),
    count: d.count,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <ChartCard title={t("admin.reports.chartTrend")} subtitle={t("admin.reports.chartTrendSub")}>
          <LineChart data={data.daily} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="day" tickFormatter={dayLabel} minTickGap={24} {...axisProps} />
            <YAxis {...axisProps} width={36} allowDecimals={false} />
            <Tooltip content={<ChartTooltip labelFormatter={(l) => dayLabel(String(l))} />} />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="borrowed"
              name={t("admin.reports.borrowed")}
              stroke={CHART_SERIES[0]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="returned"
              name={t("admin.reports.returned")}
              stroke={CHART_SERIES[3]}
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ChartCard>
      </div>

      <ChartCard
        title={t("admin.reports.chartUtilization")}
        subtitle={t("admin.reports.chartUtilizationSub")}
        height={Math.max(160, departments.length * 36 + 40)}
      >
        <BarChart data={departments} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps} vertical horizontal={false} />
          <XAxis type="number" domain={[0, 100]} unit="%" {...axisProps} />
          <YAxis type="category" dataKey="name" width={130} {...axisProps} />
          <Tooltip content={<ChartTooltip unit="%" />} cursor={{ fill: "var(--s-inset)", opacity: 0.5 }} />
          <Bar
            dataKey="utilization"
            name={t("admin.reports.colUtilization")}
            fill={CHART_COLOR.accent}
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
          />
        </BarChart>
      </ChartCard>

      <ChartCard
        title={t("admin.reports.mostBorrowed")}
        subtitle={t("admin.reports.chartTopSub")}
        height={Math.max(160, top.length * 30 + 40)}
      >
        <BarChart data={top} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps} vertical horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...axisProps} />
          <YAxis type="category" dataKey="name" width={130} {...axisProps} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--s-inset)", opacity: 0.5 }} />
          <Bar
            dataKey="count"
            name={t("admin.reports.colLoans")}
            fill={CHART_COLOR.accent}
            radius={[0, 4, 4, 0]}
            maxBarSize={16}
          />
        </BarChart>
      </ChartCard>

      <div className="lg:col-span-2">
        <ChartCard title={t("admin.reports.chartDamage")} subtitle={t("admin.reports.chartDamageSub")} height={220}>
          <BarChart data={damage} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" interval={0} {...axisProps} />
            <YAxis {...axisProps} width={36} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--s-inset)", opacity: 0.5 }} />
            <Bar
              dataKey="count"
              name={t("admin.reports.chartDamageCount")}
              fill={CHART_COLOR.accent}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ChartCard>
      </div>
    </div>
  );
}
