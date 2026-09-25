import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Add-to-request button. Flips to a "selected" state once the item is in the
 * draft - accent fill, a check instead of the plus, and the count - so a glance
 * down the list shows what is already picked. Still adds another unit on click
 * until the shelf runs out. The minus button can reduce or remove a selection.
 */
export function AddButton({
  qty,
  capped,
  blocked = false,
  size,
  variant = "outline",
  className,
  onAdd,
  onDecrease,
}: {
  qty: number;
  capped: boolean;
  /**
   * The borrower may not borrow this at all. Closed, and says so, rather than
   * letting them fill a request the server will refuse with NOT_ELIGIBLE.
   */
  blocked?: boolean;
  size?: "sm";
  /** Look to use before anything is selected; the selected look is fixed. */
  variant?: "outline" | "default";
  className?: string;
  onAdd: (ev: MouseEvent<HTMLButtonElement>) => void;
  onDecrease: () => void;
}) {
  const { t } = useTranslation();
  const selected = qty > 0;
  const icon = size === "sm" ? 14 : 15;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md",
        size === "sm" ? "h-8" : "h-9",
        selected && "bg-[var(--accent-soft)]",
        className,
      )}
    >
      {selected ? (
        <Button
          type="button"
          size={size}
          variant="ghost"
          className="h-full rounded-r-none border border-[var(--s-alert-t)] bg-[var(--s-alert-bg)] px-2 text-[var(--s-alert-t)] hover:bg-[var(--accent-red)] hover:text-white"
          aria-label={t("borrower.request.decrease")}
          onClick={(ev) => {
            ev.stopPropagation();
            onDecrease();
          }}
        >
          <Minus size={icon} strokeWidth={2.2} />
        </Button>
      ) : null}
      <Button
        type="button"
        size={size}
        variant={selected ? "outline" : variant}
        className={cn(
          "h-full flex-1",
          selected &&
            "rounded-l-none border-accent border-l-0 bg-transparent text-accent hover:bg-accent hover:text-white",
        )}
        disabled={capped || blocked}
        onClick={onAdd}
      >
        {blocked ? null : selected ? (
          <Check size={icon} strokeWidth={2.6} />
        ) : (
          <Plus size={icon} strokeWidth={2.2} />
        )}
        {blocked
          ? t("borrower.catalog.notEligible")
          : selected
            ? t("borrower.catalog.selected", { count: qty })
            : t("borrower.catalog.add")}
      </Button>
    </span>
  );
}

