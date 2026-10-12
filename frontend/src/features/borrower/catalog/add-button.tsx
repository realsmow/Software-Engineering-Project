import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Select toggle for the catalogue (demo feedback): tap to put the item in the
 * request, tap again to take it out. How many, and when, are set on the
 * request page, so the list stays a simple pick.
 */
export function AddButton({
  qty,
  capped,
  blocked = false,
  size,
  variant = "outline",
  className,
  onAdd,
  onRemove,
}: {
  qty: number;
  /** Nothing free to select. Only stops selecting; a selection can still be undone. */
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
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const selected = qty > 0;
  const icon = size === "sm" ? 14 : 15;

  return (
    <Button
      type="button"
      size={size}
      variant={selected ? "outline" : variant}
      aria-pressed={selected}
      className={cn(
        size === "sm" ? "h-8" : "h-9",
        selected && "border-accent bg-[var(--accent-soft)] text-accent hover:bg-accent hover:text-white",
        className,
      )}
      disabled={!selected && (capped || blocked)}
      onClick={(ev) => {
        ev.stopPropagation();
        if (selected) onRemove();
        else onAdd(ev);
      }}
    >
      {blocked && !selected ? null : selected ? (
        <Check size={icon} strokeWidth={2.6} />
      ) : (
        <Plus size={icon} strokeWidth={2.2} />
      )}
      {blocked && !selected
        ? t("borrower.catalog.notEligible")
        : selected
          ? t("borrower.catalog.selectedToggle")
          : t("borrower.catalog.select")}
    </Button>
  );
}
