import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dots joined by lines, one dot per step, label under each.
 *
 * Steps before `at` are finished (filled dot with a tick), step `at` is the
 * one in play (ringed dot), later steps are hollow. `at >= labels.length`
 * means everything is finished. A stalled track greys out the current dot
 * instead of colouring it.
 */
export function StepDots({
  labels,
  at,
  stalled = false,
  className,
}: {
  labels: readonly string[];
  at: number;
  stalled?: boolean;
  className?: string;
}) {
  return (
    <ol className={cn("flex", className)}>
      {labels.map((label, i) => {
        const done = i < at;
        const current = i === at;
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center">
            {/* Line to the previous dot, coloured once this step is reached. */}
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute right-1/2 top-[9px] h-0.5 w-full -translate-y-1/2",
                  i <= at && !(current && stalled) ? "bg-accent" : "bg-border"
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2",
                done && "border-accent bg-accent text-white",
                current && !stalled && "border-accent bg-card ring-2 ring-accent/25",
                current && stalled && "border-[var(--s-t4)] bg-card",
                !done && !current && "border-border bg-card"
              )}
            >
              {done ? (
                <Check size={11} strokeWidth={3} />
              ) : current ? (
                <span className={cn("h-1.5 w-1.5 rounded-full", stalled ? "bg-[var(--s-t4)]" : "bg-accent")} />
              ) : null}
            </span>
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "mt-1.5 px-0.5 text-center text-[10.5px] leading-tight",
                done && "text-t1",
                current && !stalled && "font-semibold text-accent",
                current && stalled && "font-semibold text-t4",
                !done && !current && "text-t4"
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
