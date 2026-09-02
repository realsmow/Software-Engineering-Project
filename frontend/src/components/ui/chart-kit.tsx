import type { ReactNode } from "react";

/**
 * Shared theming helpers for the admin drill-down charts (Recharts).
 *
 * Colors are plain `var(--…)` strings that resolve to the design-system tokens
 * in globals.css. Because those tokens change under `body.dark`, every chart
 * that references them re-paints automatically when the theme is toggled - no
 * JS color recalculation needed.
 */

/**
 * Series palette for multi-series charts: one hue, five steps.
 *
 * This used to cycle accent, info, warn, hot, alert - six unrelated hues, which
 * made a single stacked metric read as six different subjects and quietly
 * borrowed the status colours. Amber and red now mean only what they mean in
 * CHART_COLOR below: something needs attention.
 *
 * Five steps because a chart needing a sixth distinguishable series is a chart
 * that should be split, not recoloured.
 */
export const CHART_SERIES = [
  "var(--c-1)",
  "var(--c-2)",
  "var(--c-3)",
  "var(--c-4)",
  "var(--c-5)",
] as const;

/**
 * Semantic colors for state-based charts (health, pass/fail, etc.).
 *
 * `accent` is the default fill and is deliberately NOT var(--accent): the UI
 * accent is tuned for text contrast, and a chart full of it reads as a wall of
 * dark green. `highlight` is for picking one bar out of many - it is red
 * because red is opposite green on the wheel, so the emphasis reads as a
 * different thing rather than a darker shade of the same thing.
 */
export const CHART_COLOR = {
  accent: "var(--c-fill)",
  highlight: "var(--c-highlight)",
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
