import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Download, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { SlideOver } from "@/components/ui/modal";
import { ChartCard } from "@/components/ui/chart-card";
import { Segmented } from "@/components/ui/segmented";
import { ChartTooltip, CHART_COLOR, CHART_SERIES, axisProps, gridProps } from "@/components/ui/chart-kit";
import {
  ACTIVITY_BY_ROLE,
  AUDIT_BY_ACTION,
  AUDIT_BY_HOUR,
  AUDIT_EVENTS,
  type AuditAction,
  type AuditEvent,
} from "../mock-data";
import { fmtDateTime, fmtDayShort, fmtHour } from "../format";
import type { Role } from "@/types/domain";

const ACTIONS: AuditAction[] = ["login", "create", "update", "delete", "role", "config"];

const ACTION_TONE: Record<AuditAction, BadgeTone> = {
  login: "neutral",
  create: "ok",
  update: "info",
  delete: "alert",
  role: "warn",
  config: "hot",
};

const ROLE_TONE: Record<Role, BadgeTone> = {
  borrower: "neutral",
  staff: "info",
  supervisor: "warn",
  admin: "ok",
};

type AuditView = "hour" | "type" | "role";
const ROLE_KEYS: Role[] = ["borrower", "staff", "supervisor", "admin"];

export default function AdminAuditPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<AuditAction | "all">("all");
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [view, setView] = useState<AuditView>("hour");

  const peakEvents = useMemo(() => Math.max(...AUDIT_BY_HOUR.map((h) => h.events)), []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return AUDIT_EVENTS.filter((e) => {
      if (action !== "all" && e.action !== action) return false;
      if (!q) return true;
      return (
        e.actorName.toLowerCase().includes(q) ||
        e.target.toLowerCase().includes(q) ||
        e.detail.toLowerCase().includes(q) ||
        e.ip.includes(q)
      );
    });
  }, [query, action]);

  const columns: Column<AuditEvent>[] = [
    {
      key: "at",
      header: t("admin.audit.colTime"),
      render: (e) => <span className="mono t-muted">{fmtDateTime(e.at)}</span>,
    },
    {
      key: "actor",
      header: t("admin.audit.colActor"),
      render: (e) => (
        <span className="u-cell">
          <span className="t-strong">{e.actorName}</span>
          <Badge tone={ROLE_TONE[e.actorRole]}>{t(`nav.${e.actorRole}`)}</Badge>
        </span>
      ),
    },
    {
      key: "action",
      header: t("admin.audit.colAction"),
      render: (e) => (
        <Badge tone={ACTION_TONE[e.action]} dot>
          {t(`admin.audit.act${cap(e.action)}`)}
        </Badge>
      ),
    },
    {
      key: "target",
      header: t("admin.audit.colTarget"),
      render: (e) => <span className="mono t-muted">{e.target}</span>,
    },
    {
      key: "ip",
      header: t("admin.audit.colIp"),
      align: "right",
      render: (e) => <span className="mono t-muted">{e.ip}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("admin.audit.title")}
        actions={
          <>
            <Button type="button" variant="outline" onClick={exportCsv}>
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

      <div className="mb-4">
        <ChartCard
          title={t("admin.charts.auditActivity")}
          subtitle={view === "hour" ? t("admin.charts.peak", { hour: fmtHour(AUDIT_BY_HOUR.find((h) => h.events === peakEvents)!.hour) }) : undefined}
          height={260}
          actions={
            <Segmented<AuditView>
              value={view}
              onChange={setView}
              options={[
                { value: "hour", label: t("admin.charts.byHour") },
                { value: "type", label: t("admin.charts.byType") },
                { value: "role", label: t("admin.charts.byRole") },
              ]}
            />
          }
        >
          {view === "hour" ? (
            <BarChart data={AUDIT_BY_HOUR} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="hour" tickFormatter={(h) => fmtHour(h as number)} interval={1} {...axisProps} />
              <YAxis {...axisProps} width={40} allowDecimals={false} />
              <Tooltip
                content={<ChartTooltip labelFormatter={(l) => fmtHour(l as number)} />}
                cursor={{ fill: "var(--s-inset)", opacity: 0.5 }}
              />
              <Bar dataKey="events" name={t("admin.charts.events")} radius={[3, 3, 0, 0]} maxBarSize={22}>
                {AUDIT_BY_HOUR.map((h) => (
                  <Cell key={h.hour} fill={h.events === peakEvents ? CHART_COLOR.hot : CHART_COLOR.accent} />
                ))}
              </Bar>
            </BarChart>
          ) : view === "type" ? (
            <BarChart data={AUDIT_BY_ACTION} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="action"
                tickFormatter={(a) => t(`admin.audit.act${cap(a as string)}`)}
                {...axisProps}
              />
              <YAxis {...axisProps} width={44} allowDecimals={false} />
              <Tooltip
                content={<ChartTooltip labelFormatter={(l) => t(`admin.audit.act${cap(l as string)}`)} />}
                cursor={{ fill: "var(--s-inset)", opacity: 0.5 }}
              />
              <Bar dataKey="count" name={t("admin.charts.events")} radius={[3, 3, 0, 0]} maxBarSize={48}>
                {AUDIT_BY_ACTION.map((_, i) => (
                  <Cell key={i} fill={CHART_SERIES[i % CHART_SERIES.length]} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <BarChart data={ACTIVITY_BY_ROLE} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" tickFormatter={(d) => fmtDayShort(d as string)} {...axisProps} />
              <YAxis {...axisProps} width={44} allowDecimals={false} />
              <Tooltip
                content={<ChartTooltip labelFormatter={(l) => fmtDayShort(l as string)} />}
                cursor={{ fill: "var(--s-inset)", opacity: 0.5 }}
              />
              <Legend />
              {ROLE_KEYS.map((r, i) => (
                <Bar
                  key={r}
                  dataKey={r}
                  stackId="role"
                  name={t(`nav.${r}`)}
                  fill={CHART_SERIES[i % CHART_SERIES.length]}
                  maxBarSize={40}
                  radius={i === ROLE_KEYS.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          )}
        </ChartCard>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          className="max-w-xs"
          placeholder={t("admin.audit.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select value={action} onValueChange={(v) => setAction(v as AuditAction | "all")}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.audit.allActions")}</SelectItem>
            {ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {t(`admin.audit.act${cap(a)}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(e) => e.id}
        onRowClick={(e) => setSelected(e)}
        pageSize={12}
        emptyTitle={t("table.empty")}
        emptyDescription={t("table.emptyDesc")}
        rangeLabel={(s, e, total) => t("table.range", { start: s, end: e, total })}
      />

      <SlideOver
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={t("admin.audit.detailTitle")}
        subtitle={selected?.id}
      >
        {selected ? (
          <div className="flex flex-col divide-y divide-border">
            <KvRow label={t("admin.audit.colTime")}>
              <span className="font-mono">{fmtDateTime(selected.at)}</span>
            </KvRow>
            <KvRow label={t("admin.audit.colActor")}>
              {selected.actorName}{" "}
              <Badge tone={ROLE_TONE[selected.actorRole]}>{t(`nav.${selected.actorRole}`)}</Badge>
            </KvRow>
            <KvRow label={t("admin.audit.colAction")}>
              <Badge tone={ACTION_TONE[selected.action]} dot>
                {t(`admin.audit.act${cap(selected.action)}`)}
              </Badge>
            </KvRow>
            <KvRow label={t("admin.audit.colTarget")}>
              <span className="font-mono">{selected.target}</span>
            </KvRow>
            <KvRow label={t("admin.audit.colIp")}>
              <span className="font-mono">{selected.ip}</span>
            </KvRow>
            <KvRow label={t("admin.audit.userAgent")}>{selected.userAgent}</KvRow>
            <div className="pt-4">
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">{t("admin.audit.changes")}</div>
              <div className="min-h-[44px] whitespace-pre-wrap rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                {selected.detail}
              </div>
            </div>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
}

function KvRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-right text-sm text-foreground">{children}</div>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function exportCsv(): void {
  const header = ["id", "at", "actor", "role", "action", "target", "ip", "detail"];
  const lines = AUDIT_EVENTS.map((e) =>
    [e.id, e.at, e.actorName, e.actorRole, e.action, e.target, e.ip, e.detail]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  const csv = "﻿" + [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "audit-log.csv";
  a.click();
  URL.revokeObjectURL(url);
}
