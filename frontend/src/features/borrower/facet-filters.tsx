import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface FilterOption {
  /** Namespaced key, e.g. "dept:ee" - unique across every group. */
  key: string;
  label: string;
  /** Label for the active-filter chip when the rail label needs disambiguating ("Tier: T2"). */
  chipLabel?: string;
  /** How many items in the full list match, not the filtered view. */
  count: number;
}

export interface FilterGroup {
  key: string;
  label: string;
  options: FilterOption[];
}

/**
 * Faceted filter list shared by the borrower's browse pages (equipment
 * catalog, room list). Chrome-free on purpose - the desktop rail wraps it in a
 * card and the mobile Sheet renders it as the drawer body, so both share one
 * implementation.
 *
 * Options are OR-ed within a group and AND-ed across groups; the owning page
 * does the actual filtering.
 */
export function FacetFilters({
  groups,
  selected,
  onToggle,
  onClear,
  showHeader = true,
  className,
}: {
  groups: FilterGroup[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onClear: () => void;
  showHeader?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <div className={cn("divide-y divide-border", className)}>
      {showHeader ? (
        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-t3">
            {t("borrower.filters.title")}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-accent transition-colors hover:text-accent-hover"
          >
            {t("borrower.filters.clear")}
          </button>
        </div>
      ) : null}

      {/* role=group instead of fieldset/legend: a <legend> straddles the
          fieldset's top border and would sit on the divider, not below it. */}
      {groups.map((g) => (
        <div key={g.key} role="group" aria-labelledby={`filter-${g.key}`} className="px-3.5 py-3">
          <div
            id={`filter-${g.key}`}
            className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3"
          >
            {g.label}
          </div>
          {g.options.map((o) => (
            <label
              key={o.key}
              className="flex cursor-pointer items-center gap-2.5 py-1 text-[13px] text-t2 hover:text-t1"
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 shrink-0 cursor-pointer"
                checked={selected.has(o.key)}
                onChange={() => onToggle(o.key)}
              />
              <span className="min-w-0 flex-1">{o.label}</span>
              <span className="font-mono text-[10px] tabular-nums text-t4">{o.count}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

export default FacetFilters;
