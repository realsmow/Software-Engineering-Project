import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Tier } from "@/types/domain";

/**
 * Tier dot colors — the visual shorthand used everywhere a tier appears
 * (catalog table, request review, staff queue). Values match the reference
 * mockup: T0 is neutral, T1 is the KU green accent, T2 warns, T3 is a booking.
 */
export const TIER_DOT: Record<Tier, string> = {
  T0: "var(--s-t4)",
  T1: "var(--accent)",
  T2: "var(--accent-orange)",
  T3: "var(--accent-blue)",
};

export const TIERS: Tier[] = ["T0", "T1", "T2", "T3"];

/** i18n key for a tier's one-line borrowing rule ("ต้องอาจารย์อนุมัติ"). */
export function tierNoteKey(tier: Tier): string {
  return `borrower.catalog.tierNote${tier}`;
}

/**
 * Colored dot + tier code, with the borrowing rule underneath when `note` is
 * set. Inline (dot + code only) suits dense rows; `note` suits the wider
 * catalog/detail views.
 */
export function TierBadge({
  tier,
  note = false,
  className,
}: {
  tier: Tier;
  note?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <span className={cn("inline-flex flex-col gap-0.5", className)}>
      <span className="inline-flex items-center gap-2 whitespace-nowrap text-t2">
        <TierDot tier={tier} />
        {tier}
      </span>
      {note ? (
        <span className="pl-[15px] text-[11px] leading-tight text-t4">
          {t(tierNoteKey(tier))}
        </span>
      ) : null}
    </span>
  );
}

/** Bare 7px dot — for legends and places that render their own label. */
export function TierDot({ tier, className }: { tier: Tier; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("h-[7px] w-[7px] shrink-0 rounded-full", className)}
      style={{ background: TIER_DOT[tier] }}
    />
  );
}

export default TierBadge;
