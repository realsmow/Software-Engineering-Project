import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { TierDot } from "@/components/shared/tier-badge";
import { fmtDateTime } from "@/features/borrower/format";
import { useReportSummary } from "./use-reports";

/**
 * Consolidated lending report.
 *
 * Counted from UsageLog, ResourceInfo and ItemInfo at the moment it is opened.
 * What was here before was a fixed table of six departments with figures
 * nobody computed (412 loans, 74% utilisation) plus charts drawn from an array
 * of invented points - readable, plausible, and untrue.
 *
 * There are no charts now because the server keeps no history to draw one
 * from. Adding a time axis means aggregating UsageLog by day, which is a
 * different piece of work and should be asked for rather than faked.
 *
 * Scope is stated on the page: a department head sees their own departments,
 * an admin sees the institution, and the two must not be confused.
 */
export default function AdminReportsPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useReportSummary();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("nav.reports")}
        subtitle={t("admin.reports.subtitle")}
        actions={
          data ? (
            <span className="font-mono text-xs text-t4">
              {fmtDateTime(data.generatedAt)}
            </span>
          ) : null
        }
      />

      {isLoading ? (
        <p className="py-16 text-center text-sm text-t3">{t("common.loading")}</p>
      ) : isError || !data ? (
        <p className="rounded border border-[var(--s-warn-b)] bg-[var(--s-warn-bg)] px-3.5 py-3 text-[13px] text-[var(--s-warn-t)]">
          {t("admin.reports.unavailable")}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-[13px] text-t3">
            {data.unscoped ? t("admin.reports.scopeAll") : t("admin.reports.scopeMine")}
          </p>

          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="divide-y divide-border">
              <Fact label={t("admin.reports.totalLoans")} value={data.totals.loans} />
              <Fact label={t("admin.reports.overdueNow")} value={data.totals.overdue} />
              <Fact
                label={t("admin.reports.unitsOut")}
                value={data.totals.unitsOut}
                trailing={t("admin.reports.ofHeld", { held: data.totals.unitsHeld })}
              />
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <h2 className="border-b border-border px-3.5 py-2.5 text-sm font-semibold text-foreground">
              {t("admin.reports.byDepartment")}
            </h2>
            {/* Scrolls inside its own frame rather than pushing the page wide. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-secondary">
                    <Th>{t("admin.reports.colDepartment")}</Th>
                    <Th right>{t("admin.reports.colLoans")}</Th>
                    <Th right>{t("admin.reports.colOverdue")}</Th>
                    <Th right>{t("admin.reports.colUnits")}</Th>
                    <Th right>{t("admin.reports.colUtilization")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.departments.map((d) => (
                    <tr key={d.manageGroupKey} className="border-b border-border last:border-b-0">
                      <td className="px-3.5 py-2 text-foreground">
                        {d.name ?? t("admin.reports.unnamedGroup")}
                      </td>
                      <Td>{d.loans}</Td>
                      <Td>
                        {d.overdue > 0 ? (
                          <Badge tone="warn">{d.overdue}</Badge>
                        ) : (
                          d.overdue
                        )}
                      </Td>
                      <Td>
                        {d.unitsOut} / {d.unitsHeld}
                      </Td>
                      <Td>{d.utilization}%</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <h2 className="border-b border-border px-3.5 py-2.5 text-sm font-semibold text-foreground">
              {t("admin.reports.mostBorrowed")}
            </h2>
            {data.topEquipment.length === 0 ? (
              <p className="px-3.5 py-4 text-[13px] text-t3">{t("admin.reports.noBorrowing")}</p>
            ) : (
              <div className="divide-y divide-border">
                {data.topEquipment.map((e) => (
                  <div
                    key={e.itemKey}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3.5 py-2.5"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[13px] text-foreground">
                      <TierDot tier={e.tier} />
                      {e.name ?? "-"}
                    </span>
                    <span className="shrink-0 font-mono text-[13px] tabular-nums text-foreground">
                      {e.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Fact({
  label,
  value,
  trailing,
}: {
  label: string;
  value: number;
  trailing?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3.5 py-2.5">
      <span className="min-w-0 flex-1 text-[13px] text-foreground">{label}</span>
      <span className="font-mono text-[15px] font-semibold tabular-nums text-foreground">
        {value}
      </span>
      {trailing ? (
        <span className="w-24 shrink-0 text-right font-mono text-[11px] text-t4">{trailing}</span>
      ) : null}
    </div>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={[
        "border-b border-border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.03em] text-t3",
        right ? "text-right" : "text-left",
      ].join(" ")}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3.5 py-2 text-right font-mono tabular-nums text-t2">{children}</td>
  );
}
