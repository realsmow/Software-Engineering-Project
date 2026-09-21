import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/features/borrower/format";
import { useUnitInspectionHistory } from "./use-repairs";
import { isUsable } from "./repairs.types";

/**
 * Every grade one unit has been given, newest first.
 *
 * The proposal keys damage history to the serial rather than to the loan, so
 * that a unit which keeps coming back marked is visible to whoever is deciding
 * about it now. That is why this is a panel and not a page: it is only ever
 * useful beside the unit it describes, which is the inspection desk mid-grade
 * and the workshop list mid-repair.
 *
 * `inspection.listForResource` answers grades, not condition changes. It
 * therefore shows who graded and whose loan it was, which the ConditionLog
 * history on the grading screen cannot: the two sit together on purpose.
 */
export function UnitHistory({ resourceKey }: { resourceKey: number }) {
  const { t } = useTranslation();
  const { data: rows, isLoading } = useUnitInspectionHistory(resourceKey);

  if (isLoading) {
    return (
      <p className="text-xs text-t3">{t("common.loading")}</p>
    );
  }

  if (!rows || rows.length === 0) {
    return <p className="text-xs text-t3">{t("staff.repairs.historyEmpty")}</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <li
          key={row.inspectionKey}
          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-t2"
        >
          <span className="font-mono text-t4">
            {fmtDateTime(row.inspectedAt ?? undefined)}
          </span>
          <Badge tone={isUsable(row.condition) ? "neutral" : "warn"}>
            {row.level ? `${row.level} · ` : ""}
            {t(`staff.inspection.cond${row.condition}`)}
          </Badge>
          <span className="font-mono text-[11px] text-t4">
            {t("staff.repairs.historyBy", {
              inspector: row.inspectorName,
              borrower: row.borrowerStudentId,
            })}
          </span>
          {row.note ? (
            <span className="min-w-0 basis-full truncate text-t3">{row.note}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default UnitHistory;
