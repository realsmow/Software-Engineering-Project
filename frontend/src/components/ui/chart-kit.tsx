import type { ReactNode } from "react";

/**
 * Shared theming helpers for the admin drill-down charts (Recharts).
 *
 * Colors are plain `var(--…)` strings that resolve to the design-system tokens
 * in globals.css. Because those tokens change under `body.dark`, every chart
 * that references them re-paints automatically when the theme is toggled — no
 * JS color recalculation needed.
 */

/** Categorical palette for multi-series charts, in preferred order. */
export const CHART_SERIES = [
  "var(--accent)",
  "var(--s-info-t)",
  "var(--s-warn-t)",
  "var(--s-hot-t)",
  "var(--s-alert-t)",
  "var(--s-t3)",
] as const;

/** Semantic colors for state-based charts (health, pass/fail, etc.). */
export const CHART_COLOR = {
  accent: "var(--accent)",
  ok: "var(--s-ok-t)",
  warn: "var(--s-warn-t)",
  hot: "var(--s-hot-t)",
  info: "var(--s-info-t)",
  alert: "var(--s-alert-t)",
  muted: "var(--s-t3)",
} as const;

/** Grid line + axis tick styling shared by every chart. */
export const gridProps = {
  stroke: "var(--s-line)",
  strokeDasharray: "3 3",
  vertical: false,
} as const;

export const axisProps = {
  stroke: "var(--s-line)",
  tick: { fill: "var(--s-t3)", fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: "var(--s-line)" },
} as const;

type TooltipRow = { name?: ReactNode; value?: ReactNode; color?: string; unit?: ReactNode };

/**
 * Custom Recharts tooltip that matches the panel/surface look and follows dark
 * mode. Pass to any chart via `content={<ChartTooltip unit="…" />}`.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  unit,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipRow[];
  label?: ReactNode;
  unit?: ReactNode;
  labelFormatter?: (label: ReactNode) => ReactNode;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-label">{labelFormatter ? labelFormatter(label) : label}</div>
      {payload.map((row, i) => (
        <div className="chart-tip-row" key={i}>
          <span className="chart-tip-dot" style={{ background: row.color }} />
          {row.name ? <span className="chart-tip-name">{row.name}</span> : null}
          <span className="chart-tip-val">
            {row.value}
            {unit ? <span className="chart-tip-unit">{unit}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export default ChartTooltip;
