import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MetricTrend = "up" | "down" | "flat";

const trendClass: Record<MetricTrend, string> = {
  up: "text-[var(--s-ok-t)]",
  down: "text-[var(--s-alert-t)]",
  flat: "text-muted-foreground",
};

/**
 * Dashboard metric tile: optional icon, label, big value (with optional unit)
 * and an optional delta line. Drop several inside a metrics grid.
 */
export function MetricCard({
  label,
  value,
  unit,
  icon,
  delta,
  trend = "flat",
  onClick,
  active = false,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  icon?: ReactNode;
  delta?: ReactNode;
  trend?: MetricTrend;
  /** When set, the card becomes a button (used to open a drill-down chart). */
  onClick?: () => void;
  /** Highlights the card when its drill-down is the one currently shown. */
  active?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        {icon ? <span className="text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{icon}</span> : null}
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</span>
        {unit ? <span className="text-xs text-muted-foreground">{unit}</span> : null}
      </div>
      {delta ? <div className={cn("text-xs font-medium", trendClass[trend])}>{delta}</div> : null}
    </>
  );

  const base = "flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 text-left";

  if (onClick) {
    return (
      <button
        type="button"
        className={cn(
          base,
          "transition-colors hover:border-[var(--s-line-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active && "border-primary ring-1 ring-primary",
        )}
        onClick={onClick}
        aria-pressed={active}
      >
        {body}
      </button>
    );
  }

  return <div className={base}>{body}</div>;
}

export default MetricCard;
