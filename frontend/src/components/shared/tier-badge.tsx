import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Tier } from "@/types/domain";

/**
 * Tier dot colors - the visual shorthand used everywhere a tier appears
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

/**
 * i18n key for a tier's one-line borrowing rule ("ต้องอาจารย์อนุมัติ").
 *
 * `null` is a real answer from the server - an item whose units sit on a
 * BorrowRule outside T0-T3 has no tier - so it gets its own line rather than
 * being defaulted into one of the four.
 */
export function tierNoteKey(tier: Tier | null): string {
  return tier === null
    ? "borrower.catalog.tierNoteUnknown"
    : `borrower.catalog.tierNote${tier}`;
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
  tier: Tier | null;
  note?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <span className={cn("inline-flex flex-col gap-0.5", className)}>
      <span className="inline-flex items-center gap-2 whitespace-nowrap text-t2">
        <TierDot tier={tier} />
        {tier ?? t("borrower.catalog.tierUnknown")}
      </span>
      {note ? (
        <span className="pl-[15px] text-[11px] leading-tight text-t4">
          {t(tierNoteKey(tier))}
        </span>
      ) : null}
    </span>
  );
}

/** Bare 7px dot - for legends and places that render their own label. */
export function TierDot({
  tier,
  className,
}: {
  tier: Tier | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("h-[7px] w-[7px] shrink-0 rounded-full", className)}
      // An unclassified item gets the muted dot rather than borrowing another
      // tier's colour, which would read as a classification it does not have.
      style={{ background: tier === null ? "var(--s-t4)" : TIER_DOT[tier] }}
    />
  );
}

export default TierBadge;
