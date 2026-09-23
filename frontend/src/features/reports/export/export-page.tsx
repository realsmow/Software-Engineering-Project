import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { useReportSummary } from "@/features/admin/reports/use-reports";
import type { ReportSummary } from "@/features/admin/reports/report.types";

/**
 * Export the lending report as CSV.
 *
 * The same `report.summary` the analytics page reads, as files a department
 * can open in a spreadsheet. There is no export procedure on the server and
 * none is needed: the numbers are already here, and a second path that could
 * count differently from the page beside it would be worse than none.
 *
 * Scoped like the analytics page: staff get their departments, admins get the
 * whole institution, and the file says which.
 */
export default function ReportExportPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useReportSummary(50);

  return (
    <div>
      <PageHeader title={t("nav.exportData")} subtitle={t("reports.export.subtitle")} />

      {isLoading ? (
        <div className="py-16 text-center text-sm text-t3">{t("common.loading")}</div>
      ) : isError || !data ? (
        <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-t3">
          {t("reports.export.failed")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ExportCard
            title={t("reports.export.departmentsTitle")}
            description={t("reports.export.departmentsDesc", { count: data.departments.length })}
            onDownload={() => downloadCsv(`departments-${stamp(data)}.csv`, departmentRows(data))}
            disabled={data.departments.length === 0}
          />
          <ExportCard
            title={t("reports.export.equipmentTitle")}
            description={t("reports.export.equipmentDesc", { count: data.topEquipment.length })}
            onDownload={() => downloadCsv(`top-equipment-${stamp(data)}.csv`, equipmentRows(data))}
            disabled={data.topEquipment.length === 0}
          />
          <p className="text-xs text-t3">
            {data.unscoped ? t("reports.export.scopeAll") : t("reports.export.scopeMine")}
          </p>
        </div>
      )}
    </div>
  );
}

function ExportCard({
  title,
  description,
  onDownload,
  disabled,
}: {
  title: string;
  description: string;
  onDownload: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3.5 shadow-sm">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-0.5 text-xs text-t3">{description}</div>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onDownload}>
        <Download size={14} strokeWidth={2} />
        {t("reports.export.download")}
      </Button>
    </div>
  );
}

function departmentRows(data: ReportSummary): (string | number)[][] {
  return [
    ["department", "loans", "overdue", "units_held", "units_out", "utilization_percent"],
    ...data.departments.map((d) => [
      d.name ?? `#${d.manageGroupKey}`,
      d.loans,
      d.overdue,
      d.unitsHeld,
      d.unitsOut,
      d.utilization,
    ]),
  ];
}

function equipmentRows(data: ReportSummary): (string | number)[][] {
  return [
    ["equipment", "tier", "times_borrowed"],
    ...data.topEquipment.map((e) => [e.name ?? `#${e.itemKey}`, e.tier ?? "", e.count]),
  ];
}

/** The report's own timestamp, so two downloads of the same numbers share a name. */
function stamp(data: ReportSummary): string {
  return data.generatedAt.slice(0, 10);
}

function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const body = rows
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  // BOM first so Excel reads the Thai department names as UTF-8.
  const blob = new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
