import type { ReactElement, ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Card-styled container for a single chart. Renders a titled Card with an
 * optional actions slot (e.g. a Segmented control) and sizes the Recharts chart
 * with a `ResponsiveContainer` at a fixed pixel height.
 *
 * `children` must be a single Recharts chart element (LineChart, BarChart, …),
 * as required by ResponsiveContainer.
 */
export function ChartCard({
  title,
  subtitle,
  actions,
  height = 260,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  height?: number;
  children: ReactElement;
}) {
  return (
    <Card>
      {/* flex-wrap: on a phone the actions drop under the title instead of
          pushing the card past the screen (audit page, R7-13). */}
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {subtitle ? (
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex max-w-full items-center gap-2">{actions}</div>
        ) : null}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          {children}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export default ChartCard;
