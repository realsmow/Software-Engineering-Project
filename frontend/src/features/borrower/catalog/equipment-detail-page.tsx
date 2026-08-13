import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { addDays } from "date-fns";
import { ArrowLeft, Package, Plus } from "lucide-react";
import { TierDot, tierNoteKey } from "@/components/shared/tier-badge";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CREDIT_BANDS, ROUTES } from "@/constants";
import { useAuthStore } from "@/features/auth/auth.store";
import { cn } from "@/lib/utils";
import {
  EQUIPMENT_CATEGORIES,
  catalogDeptName,
  unitsOf,
  type CatalogItem,
  type StockStatus,
  type UnitState,
} from "../mock-data";
import { fmtDateTime, fmtDayMonth } from "../format";
import { remainingUnits, useRequestDraft } from "../request/request-draft.store";
import { useEquipmentType } from "./use-equipment-types";

const STOCK_TONE: Record<StockStatus, BadgeTone> = {
  ok: "ok",
  queue: "warn",
  maintenance: "neutral",
};

const UNIT_TONE: Record<UnitState, BadgeTone> = { free: "ok", fix: "warn", out: "neutral" };

/** How far ahead the availability strip looks. */
const AVAIL_DAYS = 14;

/**
 * Equipment detail — reached from a catalog row. Layout follows the reference
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
  const { data: item, isLoading } = useEquipmentType(id);
  const creditBand = useAuthStore((s) => s.user?.creditBand) ?? "D0";

  // Draft lines live in the shared store, so the count survives navigation
  // and the request page sees whatever was added here.
  const draftLines = useRequestDraft((s) => s.lines);
  const addItem = useRequestDraft((s) => s.addItem);
  const qty = draftLines.find((l) => l.itemId === id)?.qty ?? 0;

  const units = useMemo(() => (item ? unitsOf(item) : []), [item]);
  const days = useMemo(() => (item ? buildDays(item) : []), [item]);

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

  // Out of stock, or the draft already holds every free unit.
  const atCap = remainingUnits(draftLines, item) === 0;
  const category = EQUIPMENT_CATEGORIES.find((c) => c.id === item.categoryId);
  const loanDays = CREDIT_BANDS.find((b) => b.band === creditBand)?.loanDays ?? 14;
  // T3 is booked by slot; everything else is capped by the borrower's credit band.
  const period =
    item.tier === "T3"
      ? t("borrower.detail.perSlot")
      : t("borrower.detail.days", { count: loanDays });


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
            <div className="flex h-[150px] w-full shrink-0 items-center justify-center rounded-md border border-border bg-surface-inset text-t4 sm:h-[132px] sm:w-[132px]">
              <Package size={34} strokeWidth={1.4} />
            </div>

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

        {/* Compact summary + CTA — the sticky rail's job on wide screens. */}
        <Panel className="lg:hidden">
          <div className="divide-y divide-border px-3.5 py-1">
            <SpecRow label={t("borrower.catalog.colAvail")} mono>
              {item.availableUnits} / {item.totalUnits}
            </SpecRow>
            <SpecRow label={t("borrower.detail.deptL")}>
              {catalogDeptName(item.departmentId)}
            </SpecRow>
            <SpecRow label={t("borrower.detail.periodL")}>{period}</SpecRow>
          </div>
          <div className="px-3.5 pb-3.5 pt-3">
            <Button
              type="button"
              className="h-11 w-full"
              disabled={atCap}
              onClick={() => addItem(item.id)}
            >
              <Plus size={15} strokeWidth={2.2} />
              {t("borrower.detail.addToRequest")}
              {qty ? ` (${qty})` : ""}
            </Button>
          </div>
        </Panel>

        {/* Description — hidden when the item has no blurb yet. */}
        {item.description ? (
          <Panel title={t("borrower.detail.desc")}>
            <p className="px-3.5 py-3 text-[13px] leading-relaxed text-t2">{item.description}</p>
          </Panel>
        ) : null}

        {/* Specifications */}
        <Panel title={t("borrower.detail.spec")}>
          <div className="divide-y divide-border px-3.5 py-1">
            <SpecRow label={t("borrower.detail.catL")}>
              {category ? t(`borrower.catalog.${category.labelKey}`) : item.categoryId}
            </SpecRow>
            <SpecRow label={t("borrower.detail.deptL")}>
              {catalogDeptName(item.departmentId)}
            </SpecRow>
            <SpecRow label={t("borrower.detail.totalL")} mono>
              {item.totalUnits}
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

        {/* Availability, next 14 days */}
        <Panel title={t("borrower.detail.availTitle")}>
          <div className="p-3.5">
            <div className="grid grid-cols-7 gap-1.5 md:grid-cols-[repeat(14,minmax(0,1fr))]">
              {days.map((d) => (
                <div
                  key={d.date.toISOString()}
                  title={fmtDayMonth(d.date)}
                  className={cn(
                    "flex h-[34px] items-center justify-center rounded-sm border font-mono text-[11px] tabular-nums",
                    d.busy
                      ? "border-border bg-surface-inset text-t4"
                      : "border-accent bg-[var(--accent-soft)] text-accent",
                  )}
                >
                  {d.date.getDate()}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-t3">
              {t("borrower.detail.availHelp")}
            </p>
          </div>
        </Panel>

        {/* Units */}
        <Panel title={t("borrower.detail.units")}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("borrower.detail.colUnit")}</TableHead>
                <TableHead>{t("borrower.detail.colCond")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((u) => (
                <TableRow key={u.serial} className="hover:bg-transparent">
                  <TableCell className="whitespace-nowrap font-mono text-xs">{u.serial}</TableCell>
                  <TableCell className="text-t2">{t(UNIT_CONDITION_KEY[u.state])}</TableCell>
                  <TableCell>
                    <Badge tone={UNIT_TONE[u.state]}>
                      {t(`borrower.detail.unit${cap(u.state)}`)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>

      {/* Sticky summary rail (wide screens only). */}
      <aside className="hidden lg:sticky lg:top-0 lg:block">
        <Panel title={t("borrower.catalog.colAvail")}>
          <div className="flex flex-col gap-2.5 p-3.5 text-sm">
            <div className="flex items-baseline justify-between gap-2.5">
              <span className="text-t3">{t("borrower.catalog.colAvail")}</span>
              <b className="font-mono text-[15px] tabular-nums text-foreground">
                {item.availableUnits} / {item.totalUnits}
              </b>
            </div>
            <div className="flex items-baseline justify-between gap-2.5">
              <span className="text-t3">{t("borrower.catalog.colNext")}</span>
              <b className="font-mono text-xs text-foreground">
                {fmtDateTime(item.nextAvailableAt)}
              </b>
            </div>
          </div>
          <div className="flex flex-col gap-2 px-3.5 pb-3.5">
            <Button
              type="button"
              className="h-10"
              disabled={atCap}
              onClick={() => addItem(item.id)}
            >
              <Plus size={15} strokeWidth={2.2} />
              {t("borrower.detail.addToRequest")}
              {qty ? ` (${qty})` : ""}
            </Button>
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

const UNIT_CONDITION_KEY: Record<UnitState, string> = {
  free: "borrower.detail.condOk",
  fix: "borrower.detail.condFix",
  out: "borrower.detail.condUse",
};

/**
 * Placeholder booking calendar: a fully checked-out item is blocked for the
 * next nine days, anything else carries a light recurring load. Deterministic
 * so the strip doesn't flicker between renders.
 *
 * TODO: replace with GET /equipment-types/:id/availability.
 */
function buildDays(item: CatalogItem): { date: Date; busy: boolean }[] {
  const today = new Date();
  return Array.from({ length: AVAIL_DAYS }, (_, i) => ({
    date: addDays(today, i),
    busy: item.availableUnits === 0 ? i < 9 : i % 5 === 2 || i % 7 === 6,
  }));
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
