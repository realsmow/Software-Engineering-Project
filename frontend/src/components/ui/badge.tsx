import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export type BadgeTone = "ok" | "warn" | "hot" | "info" | "alert" | "neutral";

/**
 * Status pill (shadcn/ui pattern). Tone maps to the semantic surface tokens.
 * Colors use the --s-*-bg/-t/-b tokens directly so they follow dark mode.
 * `dot` prepends a small dot; `mono` renders the label in the mono font.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11.5px] font-semibold leading-5 whitespace-nowrap",
  {
    variants: {
      tone: {
        ok: "bg-[var(--s-ok-bg)] text-[var(--s-ok-t)] border-[var(--s-ok-b)]",
        warn: "bg-[var(--s-warn-bg)] text-[var(--s-warn-t)] border-[var(--s-warn-b)]",
        hot: "bg-[var(--s-hot-bg)] text-[var(--s-hot-t)] border-[var(--s-hot-b)]",
        info: "bg-[var(--s-info-bg)] text-[var(--s-info-t)] border-[var(--s-info-b)]",
        alert: "bg-[var(--s-alert-bg)] text-[var(--s-alert-t)] border-[var(--s-alert-b)]",
        neutral: "bg-[var(--s-subtle)] text-[var(--s-t2)] border-[var(--s-line)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  tone = "neutral",
  dot = false,
  mono = false,
  className,
  children,
}: VariantProps<typeof badgeVariants> & {
  tone?: BadgeTone;
  dot?: boolean;
  mono?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn(badgeVariants({ tone }), mono && "font-mono", className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export { badgeVariants };
export default Badge;
