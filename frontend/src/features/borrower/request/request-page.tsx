import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { th } from "date-fns/locale";
import { Check, Minus, Package, Plus, ShoppingCart, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { TierDot } from "@/components/shared/tier-badge";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BUSINESS, CREDIT_BANDS, CREDIT_BAND_POLICY, ROUTES } from "@/constants";
import { useAuthStore } from "@/features/auth/auth.store";
import { useSubmittedRequests } from "../loans/submitted-requests.store";
import { cn } from "@/lib/utils";
import { CATALOG_ITEMS, unitsOf, type CatalogItem, type UnitState } from "../mock-data";
import {
  expandToUnits,
  isoOffset,
  todayIso,
  useRequestDraft,
  type DraftLine,
} from "./request-draft.store";

/** A draft line joined with the catalog row it points at. */
interface CartRow extends DraftLine {
  item: CatalogItem;
}

const UNIT_TONE: Record<UnitState, BadgeTone> = { free: "ok", fix: "warn", out: "neutral" };

const UNIT_CONDITION_KEY: Record<UnitState, string> = {
  free: "borrower.request.condOk",
  fix: "borrower.request.condFix",
  out: "borrower.request.condUse",
};

/**
 * Create borrow request — step 2 of the borrow flow. The catalog fills the
 * draft (see request-draft.store); this page edits quantities and serials,
 * sets the period, and runs the pre-submit checks before letting it go.
 *
 * Layout follows the reference mockup: a content column (steps → selected
 * items → period → T2 serials) beside a sticky rail carrying the summary,
 * the checks, and the submit buttons.
 *
 * Rooms and T3 slot booking are deliberately out of scope here — that flow
 * lands with the room booking pages.
 */
export default function RequestPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const lines = useRequestDraft((s) => s.lines);
  const startDate = useRequestDraft((s) => s.startDate);
  const endDate = useRequestDraft((s) => s.endDate);
  const setQty = useRequestDraft((s) => s.setQty);
  const removeItem = useRequestDraft((s) => s.removeItem);
  const toggleSerial = useRequestDraft((s) => s.toggleSerial);
  const setStartDate = useRequestDraft((s) => s.setStartDate);
  const setEndDate = useRequestDraft((s) => s.setEndDate);
  const clear = useRequestDraft((s) => s.clear);
  const addEquipmentRequest = useSubmittedRequests((s) => s.addEquipmentRequest);

  const band = user?.creditBand ?? "D0";
  const score = user?.creditScore ?? 100;
  const maxDays = CREDIT_BANDS.find((b) => b.band === band)?.loanDays ?? 14;
  const policy = CREDIT_BAND_POLICY[band];

  const rows = useMemo<CartRow[]>(
    () =>
      lines.flatMap((l) => {
        const item = CATALOG_ITEMS.find((i) => i.id === l.itemId);
        return item ? [{ ...l, item }] : [];
      }),
    [lines],
  );

  const t2Rows = rows.filter((r) => r.item.tier === "T2");
  // The cart groups by type, but the request that goes out is per unit — each
  // one is approved, handed over, and returned on its own.
  const units = useMemo(() => expandToUnits(lines), [lines]);
  const totalUnits = units.length;
  const hasT2 = t2Rows.length > 0;
  const hasT1 = rows.some((r) => r.item.tier === "T1");

  // Supervisor sign-off: always for T2, and for T1 too once credit is low.
  const needsSupervisor = hasT2 || (policy.needsSupervisor && (hasT1 || hasT2));
  const approvalKey = !needsSupervisor
    ? "borrower.request.apvAuto"
    : policy.needsSupervisor
      ? "borrower.request.apvLowCredit"
      : "borrower.request.apvT2";

  // The picker is capped at the credit band's allowance, but a typed-in date
  // can still land outside it — hence the duplicate check below.
  const days = endDate ? differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1 : 0;
  const overDays = days > maxDays;
  const endMax = isoOffset(
    Math.min(
      differenceInCalendarDays(parseISO(startDate), parseISO(todayIso())) + maxDays - 1,
      BUSINESS.RESERVATION_MAX_DAYS,
    ),
  );

  const short = rows.filter((r) => r.qty > r.item.availableUnits);
  const checks = [
    {
      id: "eligible",
      ok: !policy.blocked,
      label: t("borrower.request.pcEligible"),
      detail: policy.blocked
        ? t("borrower.request.pcEligibleBad", { band })
        : needsSupervisor
          ? t("borrower.request.pcEligibleSup")
          : t("borrower.request.pcEligibleOk"),
    },
    {
      id: "credit",
      ok: rows.length > 0 && endDate !== null && !overDays,
      label: t("borrower.request.pcCredit"),
      detail:
        rows.length === 0
          ? t("borrower.request.pcCreditIdle")
          : endDate === null
            ? t("borrower.request.pcCreditNoEnd")
            : overDays
              ? t("borrower.request.pcCreditOver", { days, max: maxDays })
              : t("borrower.request.pcCreditOk", { score, band, days, max: maxDays }),
    },
    {
      id: "stock",
      ok: short.length === 0,
      label: t("borrower.request.pcStock"),
      detail: short.length
        ? t("borrower.request.pcStockBad", { items: short.map((r) => r.item.name).join(" · ") })
        : t("borrower.request.pcStockOk"),
    },
  ];

  const canSubmit = rows.length > 0 && checks.every((c) => c.ok);
  const blockedReason = rows.length === 0
    ? t("borrower.request.pcNothing")
    : (checks.find((c) => !c.ok)?.detail ?? "");

  function handleStart(iso: string) {
    if (!iso) return;
    setStartDate(iso);
    // A return date that no longer fits the new pickup date is cleared rather
    // than silently left behind as an out-of-range value.
    if (endDate && (endDate < iso || differenceInCalendarDays(parseISO(endDate), parseISO(iso)) + 1 > maxDays)) {
      setEndDate(null);
    }
  }

  function submit() {
    if (!canSubmit || endDate === null) return;
    // TODO: POST /loan-requests with these units. Until then the request is
    // pushed to the session store so it shows up under "my requests".
    addEquipmentRequest({ units, startDate, endDate, needsSupervisor });
    clear();
    navigate(ROUTES.MY_LOANS);
  }

  function saveDraft() {
    // Nothing to persist yet — the draft already lives in the store, so this
    // just steps out of the flow. TODO: POST /loan-requests as status "draft".
    navigate(ROUTES.MY_LOANS);
  }

  return (
    <div>
      <PageHeader title={t("nav.newRequest")} subtitle={t("borrower.request.subtitle")} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_312px]">
        <div className="flex min-w-0 flex-col gap-4">
          <StepsBar />

          {rows.length === 0 ? (
            <EmptyState onBrowse={() => navigate(ROUTES.CATALOG)} />
          ) : (
            <Panel title={t("borrower.request.selectedItems")}>
              <LineTable rows={rows} onQty={setQty} onRemove={removeItem} />
            </Panel>
          )}

          <Panel title={t("borrower.request.periodTitle")}>
            <div className="p-3.5">
              <p className="mb-3 text-xs leading-relaxed text-t3">
                {t("borrower.request.periodHelp", {
                  band,
                  days: maxDays,
                  horizon: BUSINESS.RESERVATION_MAX_DAYS,
                })}
              </p>

              <div className="grid max-w-[540px] gap-3 sm:grid-cols-2">
                <DateField
                  label={t("borrower.request.pickupDate")}
                  value={startDate}
                  min={todayIso()}
                  max={isoOffset(BUSINESS.RESERVATION_MAX_DAYS)}
                  onChange={handleStart}
                />
                <DateField
                  label={t("borrower.request.returnDate")}
                  value={endDate ?? ""}
                  min={startDate}
                  max={endMax}
                  onChange={(iso) => setEndDate(iso || null)}
                />
              </div>

              {overDays ? (
                <div className="mt-3 max-w-[540px] rounded border border-[var(--s-warn-b)] bg-[var(--s-warn-bg)] px-3 py-2 text-xs font-medium leading-relaxed text-[var(--s-warn-t)]">
                  {t("borrower.request.calWarn", { band, days: maxDays })}
                </div>
              ) : null}
            </div>
          </Panel>

          {/* T2 lines are issued by serial, so they get a picker. T0/T1 are
              handed out from the pool and T3 is slot-booked elsewhere. */}
          {hasT2 ? (
            <Panel title={t("borrower.request.serialTitle")}>
              <div className="space-y-4 p-3.5">
                <p className="text-xs leading-relaxed text-t3">
                  {t("borrower.request.serialHelp")}
                </p>
                {t2Rows.map((row) => (
                  <SerialPicker key={row.itemId} row={row} onToggle={toggleSerial} />
                ))}
              </div>
            </Panel>
          ) : null}
        </div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-0">
          <Panel
            title={
              <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-t3">
                {t("borrower.request.summary")}
              </span>
            }
          >
            <div className="flex flex-col gap-2.5 p-3.5 text-[13px]">
              <SumRow label={t("borrower.request.sumContents")}>
                {t("borrower.request.sumTotals", { lines: rows.length, units: totalUnits })}
              </SumRow>
              <p className="text-xs leading-relaxed text-t3">
                {t("borrower.request.sumPerUnit")}
              </p>
              <SumRow label={t("borrower.request.sumPeriod")}>
                {endDate
                  ? t("borrower.request.periodDays", {
                      start: fmtShort(startDate),
                      end: fmtShort(endDate),
                      days,
                    })
                  : t("borrower.request.noEnd")}
              </SumRow>
            </div>

            <div className="border-t border-border px-3.5 py-3">
              <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
                {t("borrower.request.pcTitle")}
              </div>
              {checks.map((c) => (
                <div key={c.id} className="mb-2.5 flex items-start gap-2.5 last:mb-0">
                  <span
                    className={cn(
                      "mt-0.5 flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full",
                      c.ok
                        ? "bg-[var(--s-ok-bg)] text-[var(--s-ok-t)]"
                        : "bg-[var(--s-warn-bg)] text-[var(--s-warn-t)]",
                    )}
                  >
                    {c.ok ? (
                      <Check size={11} strokeWidth={3} />
                    ) : (
                      <TriangleAlert size={11} strokeWidth={2.6} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-foreground">{c.label}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-t3">{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>

            <div
              className={cn(
                "border-t border-border px-3.5 py-3 text-xs leading-relaxed",
                needsSupervisor
                  ? "bg-[var(--s-info-bg)] text-[var(--s-info-t)]"
                  : "bg-[var(--s-ok-bg)] text-[var(--s-ok-t)]",
              )}
            >
              {t(approvalKey, { band })}
            </div>

            <div className="flex flex-col gap-2 border-t border-border px-3.5 py-3">
              <Button
                type="button"
                className="h-10"
                disabled={!canSubmit}
                title={canSubmit ? undefined : blockedReason}
                onClick={submit}
              >
                {t("borrower.request.submit")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9"
                disabled={rows.length === 0}
                onClick={saveDraft}
              >
                {t("borrower.request.saveDraft")}
              </Button>
            </div>
          </Panel>

          <div className="rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0 text-accent">
                <Check size={15} strokeWidth={2.4} />
              </span>
              <p className="text-xs leading-relaxed text-t3">
                {t("borrower.request.autoApproveNote")}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * 1-2-3 progress strip. Step 2 is always current — this page *is* step 2.
 *
 * No draft id here: the reference mockup printed a fixed one, which made
 * every draft look identical. Show it once the server assigns a real id.
 */
function StepsBar() {
  const { t } = useTranslation();
  const steps = [t("borrower.request.step1"), t("borrower.request.step2"), t("borrower.request.step3")];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm">
      {steps.map((label, i) => {
        const active = i === 1;
        return (
          <div key={label} className="flex items-center gap-2.5">
            <span
              className={cn(
                "inline-flex h-[22px] w-[22px] items-center justify-center rounded border font-mono text-xs font-semibold",
                active
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-transparent text-t3",
              )}
            >
              {i + 1}
            </span>
            <span className={cn("whitespace-nowrap text-[13px]", active ? "font-semibold text-foreground" : "text-t3")}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Selected lines. A table on wide screens, stacked cards on phones — the
 * quantity stepper needs more room than a 4-column table gives it.
 */
function LineTable({
  rows,
  onQty,
  onRemove,
}: {
  rows: CartRow[];
  onQty: (itemId: string, qty: number) => void;
  onRemove: (itemId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-secondary">
              <Th>{t("borrower.request.colItem")}</Th>
              <Th className="whitespace-nowrap">{t("borrower.request.colTier")}</Th>
              <Th className="text-center">{t("borrower.request.colQty")}</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.itemId} className="border-b border-border last:border-b-0">
                <td className="px-3.5 py-2.5">
                  <ItemCell row={r} />
                </td>
                <td className="whitespace-nowrap px-3.5 py-2.5 text-t2">
                  <span className="inline-flex items-center gap-2">
                    <TierDot tier={r.item.tier} />
                    {r.item.tier}
                  </span>
                </td>
                <td className="px-3.5 py-2.5">
                  <QtyStepper row={r} onQty={onQty} />
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <Button type="button" variant="outline" size="sm" onClick={() => onRemove(r.itemId)}>
                    {t("borrower.request.remove")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border md:hidden">
        {rows.map((r) => (
          <div key={r.itemId} className="p-3.5">
            <ItemCell row={r} />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-xs text-t2">
                <TierDot tier={r.item.tier} />
                {r.item.tier}
              </span>
              <QtyStepper row={r} onQty={onQty} />
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-3 h-10 w-full"
              onClick={() => onRemove(r.itemId)}
            >
              {t("borrower.request.remove")}
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}

function ItemCell({ row }: { row: CartRow }) {
  return (
    <div className="flex items-center gap-3">
      <Thumb />
      <div className="min-w-0">
        <div className="font-medium text-foreground">{row.item.name}</div>
        <div className="mt-0.5 font-mono text-[11px] text-t4">{row.item.code}</div>
      </div>
    </div>
  );
}

function QtyStepper({
  row,
  onQty,
}: {
  row: CartRow;
  onQty: (itemId: string, qty: number) => void;
}) {
  const { t } = useTranslation();
  const stepBtn =
    "inline-flex h-7 w-7 items-center justify-center rounded border border-border text-t2 transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        className={stepBtn}
        disabled={row.qty <= 1}
        aria-label={t("borrower.request.decrease")}
        onClick={() => onQty(row.itemId, row.qty - 1)}
      >
        <Minus size={13} strokeWidth={2.4} />
      </button>
      <span className="w-8 text-center font-mono text-[13px] font-medium tabular-nums">
        {row.qty}
      </span>
      <button
        type="button"
        className={stepBtn}
        aria-label={t("borrower.request.increase")}
        onClick={() => onQty(row.itemId, row.qty + 1)}
      >
        <Plus size={13} strokeWidth={2.4} />
      </button>
    </div>
  );
}

/** Serial checkboxes for one T2 line, capped at the line's quantity. */
function SerialPicker({
  row,
  onToggle,
}: {
  row: CartRow;
  onToggle: (itemId: string, serial: string) => void;
}) {
  const { t } = useTranslation();
  const units = unitsOf(row.item);
  const full = row.serials.length >= row.qty;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-foreground">{row.item.name}</span>
        <span
          className={cn(
            "font-mono text-xs tabular-nums",
            full ? "text-[var(--s-ok-t)]" : "text-t3",
          )}
        >
          {t("borrower.request.serialPicked", { picked: row.serials.length, qty: row.qty })}
        </span>
      </div>

      <div className="max-h-[184px] overflow-y-auto rounded border border-border">
        {units.map((u) => {
          const checked = row.serials.includes(u.serial);
          // Only free units can be issued; a full line locks the rest.
          const disabled = u.state !== "free" || (!checked && full);
          return (
            <label
              key={u.serial}
              className={cn(
                "flex items-center gap-3 border-b border-border px-3 py-2 text-[13px] last:border-b-0",
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted",
              )}
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 shrink-0"
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(row.itemId, u.serial)}
              />
              <span className="whitespace-nowrap font-mono text-xs">{u.serial}</span>
              <span className="min-w-0 truncate text-t3">{t(UNIT_CONDITION_KEY[u.state])}</span>
              <span className="ml-auto">
                <Badge tone={UNIT_TONE[u.state]}>
                  {t(`borrower.request.unit${cap(u.state)}`)}
                </Badge>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min: string;
  max: string;
  onChange: (iso: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-t2">{label}</span>
      <Input
        type="date"
        className="font-mono"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border bg-card p-9 text-center shadow-sm">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md border-[1.5px] border-accent text-accent">
        <ShoppingCart size={20} strokeWidth={1.6} />
      </div>
      <div className="mt-3.5 text-base font-semibold text-foreground">
        {t("borrower.request.emptyTitle")}
      </div>
      <div className="mt-1.5 text-[13px] text-t3">{t("borrower.request.emptyBody")}</div>
      <Button type="button" className="mt-4" onClick={onBrowse}>
        {t("borrower.request.emptyCta")}
      </Button>
    </div>
  );
}

/** Card frame with the standard title bar. */
function Panel({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      {title ? (
        <div className="border-b border-border px-3.5 py-2.5 text-sm font-semibold text-foreground">
          {title}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function SumRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-t3">{label}</span>
      <span className="text-right font-mono font-medium text-foreground">{children}</span>
    </div>
  );
}

function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "border-b border-border px-3.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.03em] text-t3",
        className,
      )}
    >
      {children}
    </th>
  );
}

/** Photo placeholder — equipment images land with the upload feature. */
function Thumb() {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-surface-inset text-t4"
      aria-hidden
    >
      <Package size={17} strokeWidth={1.6} />
    </div>
  );
}

/** "12 ส.ค." — compact date for the summary rail. */
function fmtShort(iso: string): string {
  return format(parseISO(iso), "d MMM", { locale: th });
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
