import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { TierDot, tierNoteKey } from "@/components/shared/tier-badge";
import { ImageThumb } from "@/components/shared/image-thumb";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BUSINESS, CREDIT_BANDS, ROUTES } from "@/constants";
import { useAuthStore } from "@/features/auth/auth.store";
import { cn } from "@/lib/utils";
import type { StockStatus } from "./catalog.types";
import { isoOffset, remainingUnits, useRequestDraft } from "../request/request-draft.store";
import { AddButton } from "./add-button";
import { toAvailabilityWindow } from "./availability-window";
import { useEquipmentType } from "./use-equipment-types";
import { AvailabilityCalendar } from "../request/availability-calendar";
import { useMyCredit } from "@/features/account/use-my-credit";

const STOCK_TONE: Record<StockStatus, BadgeTone> = {
  ok: "ok",
  queue: "warn",
  maintenance: "neutral",
};

/**
 * Equipment detail - reached from a catalog row. Layout follows the reference
 * mockup: a content column (hero → specs → availability → units) beside a
 * sticky summary rail that carries the "add to request" action.
 *
 * No PageHeader here on purpose: the hero card already carries the item name,
 * and the topbar breadcrumb names the page.
 */
export default function EquipmentDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  // The same period the catalogue filtered by, so the count here matches the
  // row the borrower clicked on and the Add cap is for the dates they asked for.
  const startDate = useRequestDraft((s) => s.startDate);
  const pickupTime = useRequestDraft((s) => s.pickupTime);
  const endDate = useRequestDraft((s) => s.endDate);
  const returnTime = useRequestDraft((s) => s.returnTime);
  const availabilityWindow = toAvailabilityWindow(startDate, pickupTime, endDate, returnTime);
  const { data: item, isLoading } = useEquipmentType(id, availabilityWindow);
  const { data: credit } = useMyCredit();
  const creditBand = useAuthStore((s) => s.user?.creditBand) ?? "D0";

  // Draft lines live in the shared store, so the count survives navigation
  // and the request page sees whatever was added here.
  const draftLines = useRequestDraft((s) => s.lines);
  const addItem = useRequestDraft((s) => s.addItem);
  const removeItem = useRequestDraft((s) => s.removeItem);
  const setStartDate = useRequestDraft((s) => s.setStartDate);
  const setEndDate = useRequestDraft((s) => s.setEndDate);
  const qty = draftLines.find((l) => l.itemId === id)?.qty ?? 0;


  const backToCatalog = () => navigate(ROUTES.CATALOG);

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-t3">{t("common.loading")}</div>;
  }

  if (!item) {
    return (
      <Panel>
        <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
          <div className="text-sm font-semibold text-foreground">
            {t("borrower.detail.notFound")}
          </div>
          <div className="max-w-sm text-xs leading-relaxed text-t3">
            {t("borrower.detail.notFoundDesc")}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={backToCatalog}>
            {t("borrower.detail.back")}
          </Button>
        </div>
      </Panel>
    );
  }

  const availableUnits = item.availableUnits;
  const totalUnits = item.totalUnits;

  // Out of stock, or the draft already holds every free unit.
  const atCap = remainingUnits(draftLines, { ...item, availableUnits }) === 0;
  // The real window comes from BorrowConstraints via `credit.me`; CREDIT_BANDS
  // is the static fallback for the moment before that query resolves.
  const loanDays =
    credit?.maxBorrowDays ?? CREDIT_BANDS.find((b) => b.band === creditBand)?.loanDays ?? 14;
  // T3 is booked by slot; everything else is capped by the borrower's credit band.
  const period =
    item.tier === "T3"
      ? t("borrower.detail.perSlot")
      : t("borrower.detail.days", { count: loanDays });


  /** Select toggle; how many is set on the request page. */
  const pickControl = (className: string) => (
    <AddButton
      className={className}
      qty={qty}
      capped={atCap}
      blocked={!item.eligible}
      variant="default"
      onAdd={() => addItem(item.id, availableUnits)}
      onRemove={() => removeItem(item.id)}
    />
  );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        {/* Hero */}
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <button
            type="button"
            onClick={backToCatalog}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
          >
            <ArrowLeft size={13} strokeWidth={2.2} />
            {t("borrower.detail.back")}
          </button>

          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
            <ImageThumb
              src={item.imageUrl}
              alt={item.name}
              className="h-[150px] w-full rounded-md sm:h-[132px] sm:w-[132px]"
            />

            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold leading-snug text-foreground sm:text-xl">
                {item.name}
              </h1>
              <div className="mt-1 font-mono text-xs text-t4">{item.code}</div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs text-t2">
                  <TierDot tier={item.tier} />
                  {item.tier} · {t(tierNoteKey(item.tier))}
                </span>
                <Badge tone={STOCK_TONE[item.stockStatus]}>
                  {t(`borrower.catalog.st${cap(item.stockStatus)}`)}
                </Badge>
              </div>
            </div>
          </div>
        </section>

        {/* Demo feedback: when it can be borrowed, as a calendar, not a list
            of serials - staff choose the unit. Tapping days sets the dates. */}
        {item.tier !== "T3" ? (
          <Panel title={t("borrower.detail.calendarTitle")}>
            <div className="p-3.5">
              <AvailabilityCalendar
                lines={[{ itemId: item.id, name: item.name, qty: Math.max(qty, 1) }]}
                startDate={startDate}
                endDate={endDate}
                maxDate={isoOffset(BUSINESS.RESERVATION_MAX_DAYS)}
                onPickup={(iso) => {
                  setStartDate(iso);
                  setEndDate(null);
                }}
                onReturn={(iso) => setEndDate(iso)}
              />
            </div>
          </Panel>
        ) : null}

        {/* Compact summary + CTA - the sticky rail's job on wide screens. */}
        <Panel className="lg:hidden">
          <div className="divide-y divide-border px-3.5 py-1">
            <SpecRow label={t("borrower.catalog.colAvail")} mono>
              {availableUnits} / {totalUnits}
            </SpecRow>
            <SpecRow label={t("borrower.detail.deptL")}>
              {item.owner?.name ??
                (item.owner
                  ? t(`borrower.catalog.owner${item.owner.type}`)
                  : t("borrower.catalog.ownerUnknown"))}
            </SpecRow>
            <SpecRow label={t("borrower.detail.periodL")}>{period}</SpecRow>
          </div>
          <div className="px-3.5 pb-3.5 pt-3">
            {pickControl("h-11 w-full")}
          </div>
        </Panel>

        {/* Always shown; "-" until staff write one (demo feedback). */}
        <Panel title={t("borrower.detail.desc")}>
          <p className="whitespace-pre-line px-3.5 py-3 text-[13px] leading-relaxed text-t2">
            {item.description?.trim() || "-"}
          </p>
        </Panel>

        {/* Specifications */}
        <Panel title={t("borrower.detail.spec")}>
          <div className="divide-y divide-border px-3.5 py-1">
            <SpecRow label={t("borrower.detail.deptL")}>
              {item.owner?.name ??
                (item.owner
                  ? t(`borrower.catalog.owner${item.owner.type}`)
                  : t("borrower.catalog.ownerUnknown"))}
            </SpecRow>
            <SpecRow label={t("borrower.detail.totalL")} mono>
              {totalUnits}
            </SpecRow>
            <SpecRow label={t("borrower.detail.periodL")}>{period}</SpecRow>
            <SpecRow label={t("borrower.detail.weightL")} mono>
              {item.creditWeight}
            </SpecRow>
          </div>
          <div className="border-t border-border bg-[var(--accent-soft)] px-3.5 py-2.5 text-xs leading-relaxed text-t2">
            <b className="font-semibold">{t("borrower.detail.rule")}:</b> {item.tier} ·{" "}
            {t(`borrower.detail.rule${item.tier}`)}
          </div>
        </Panel>

      </div>

      {/* Sticky summary rail (wide screens only). */}
      <aside className="hidden lg:sticky lg:top-0 lg:block">
        <Panel title={t("borrower.catalog.colAvail")}>
          <div className="flex flex-col gap-2.5 p-3.5 text-sm">
            <div className="flex items-baseline justify-between gap-2.5">
              <span className="text-t3">{t("borrower.catalog.colAvail")}</span>
              <b className="font-mono text-[15px] tabular-nums text-foreground">
                {availableUnits} / {totalUnits}
              </b>
            </div>
          </div>
          <div className="flex flex-col gap-2 px-3.5 pb-3.5">
            {pickControl("h-10")}
            <Button type="button" variant="outline" className="h-9" onClick={backToCatalog}>
              {t("borrower.detail.back")}
            </Button>
          </div>
        </Panel>
      </aside>
    </div>
  );
}

/** Card frame with the standard title bar. */
function Panel({
  title,
  className,
  children,
}: {
  title?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card shadow-sm",
        className,
      )}
    >
      {title ? (
        <div className="border-b border-border px-3.5 py-2.5 text-sm font-semibold text-foreground">
          {title}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function SpecRow({
  label,
  mono = false,
  children,
}: {
  label: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
      <span className="text-t3">{label}</span>
      <b className={cn("text-right font-semibold text-foreground", mono && "font-mono tabular-nums")}>
        {children}
      </b>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
