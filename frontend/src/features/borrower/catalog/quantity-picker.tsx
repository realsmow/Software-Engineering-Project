import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * How many units to borrow (demo feedback): type it, tap Max, drag the
 * slider, or step with - and +. Kept between 1 and the free stock.
 */
export function QuantityPicker({
  qty,
  stock,
  name,
  onChange,
}: {
  qty: number;
  stock: number;
  name: string;
  onChange: (qty: number) => void;
}) {
  const { t } = useTranslation();
  // Typing is held locally so "1" on the way to "12" is not clamped mid-word.
  const [typed, setTyped] = useState<string | null>(null);
  const set = (n: number) => onChange(Math.max(1, Math.min(n, Math.max(stock, 1))));
  const commit = () => {
    if (typed !== null && typed.trim() !== "") set(Number(typed));
    setTyped(null);
  };
  const stepBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded border border-border text-t2 transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex flex-wrap items-center justify-center gap-1">
        <button
          type="button"
          className={stepBtn}
          disabled={qty <= 1}
          aria-label={t("borrower.request.decrease")}
          onClick={() => set(qty - 1)}
        >
          <Minus size={13} strokeWidth={2.4} />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={Math.max(stock, 1)}
          aria-label={t("borrower.request.qtyLabel", { item: name })}
          value={typed ?? String(qty)}
          onChange={(e) => setTyped(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          className="h-8 w-14 rounded border border-border bg-transparent text-center font-mono text-[13px] font-medium tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          className={stepBtn}
          disabled={qty >= stock}
          aria-label={t("borrower.request.increase")}
          onClick={() => set(qty + 1)}
        >
          <Plus size={13} strokeWidth={2.4} />
        </button>
        {stock > 0 ? (
          <button
            type="button"
            className="h-8 rounded border border-border px-2 text-[11px] font-semibold text-t2 hover:bg-muted hover:text-foreground disabled:opacity-40"
            disabled={qty >= stock}
            onClick={() => set(stock)}
          >
            {t("borrower.request.qtyMax", { count: stock })}
          </button>
        ) : null}
      </div>
      {/* Dragging is quicker than tapping + for a large count. */}
      {stock > 2 ? (
        <input
          type="range"
          min={1}
          max={stock}
          value={qty}
          aria-label={t("borrower.request.qtySlider", { item: name })}
          onChange={(e) => set(Number(e.target.value))}
          className="w-full max-w-[220px] accent-[var(--accent)]"
        />
      ) : null}
    </div>
  );
}
