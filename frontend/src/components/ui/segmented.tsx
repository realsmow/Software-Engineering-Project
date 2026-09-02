import { cn } from "@/lib/utils";

export interface SegOption<V extends string> {
  value: V;
  label: string;
  count?: number;
}

/**
 * Compact segmented control for filtering/switching (e.g. status filters).
 * For page-level navigation between sections use `.tabs` markup instead.
 */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: SegOption<V>[];
  value: V;
  onChange: (next: V) => void;
}) {
  return (
    <div
      className="inline-flex h-9 items-center gap-0.5 rounded-md border border-border bg-secondary p-0.5"
      role="tablist"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={cn(
            "inline-flex h-8 items-center whitespace-nowrap rounded-[4px] px-3 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            o.value === value
              ? "bg-card text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {typeof o.count === "number" ? ` (${o.count})` : ""}
        </button>
      ))}
    </div>
  );
}

export default Segmented;
