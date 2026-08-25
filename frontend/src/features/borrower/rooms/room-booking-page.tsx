import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { Building2, Check, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BUSINESS, ROUTES } from "@/constants";
import { cn } from "@/lib/utils";
import {
  ROOM_TYPES,
  TIME_SLOTS,
  bookedSlotsOf,
  buildingName,
  slotsAdjacent,
  type Room,
} from "../mock-data";
import { useSubmittedRequests } from "../loans/submitted-requests.store";
import { useRoom } from "./use-rooms";

/**
 * Room booking request - reached from a room-list row. The room comes from the
 * URL, so the page is refreshable and shareable; the date and the chosen slots
 * are form state that lives here.
 *
 * Layout follows the reference mockup: a content column (steps → chosen room →
 * date & slots) beside a sticky summary rail.
 *
 * T3 facilities are entitlement-checked and confirmed automatically - no
 * supervisor step, which is why the rail has no approval gate.
 */
export default function RoomBookingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: room, isLoading } = useRoom(id);
  const addRoomBooking = useSubmittedRequests((s) => s.addRoomBooking);

  const [picked, setPicked] = useState<Set<number>>(new Set());

  const booked = useMemo(() => (room ? bookedSlotsOf(room) : new Set<number>()), [room]);

  const backToList = () => navigate(ROUTES.ROOMS);

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-t3">{t("common.loading")}</div>;
  }

  if (!room) {
    return (
      <Panel>
        <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
          <div className="text-sm font-semibold text-foreground">{t("borrower.booking.notFound")}</div>
          <div className="max-w-sm text-xs leading-relaxed text-t3">
            {t("borrower.booking.notFoundDesc")}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={backToList}>
            {t("borrower.booking.back")}
          </Button>
        </div>
      </Panel>
    );
  }

  const maxSlots = BUSINESS.MAX_T3_CONCURRENT_SLOTS;
  const pickedIdx = [...picked].sort((a, b) => a - b);
  const roomFull = booked.size >= TIME_SLOTS.length;

  /**
   * A slot is locked when it is already booked, when the quota is used up, or
   * when taking it would leave a gap. Adjacency is by clock time, so 11:00 and
   * 13:00 never join across the lunch break.
   */
  function lockedReason(i: number): "booked" | "quota" | "gap" | null {
    if (booked.has(i)) return "booked";
    if (picked.has(i)) return null;
    if (picked.size >= maxSlots) return "quota";
    if (picked.size > 0 && !pickedIdx.some((j) => slotsAdjacent(i, j))) return "gap";
    return null;
  }

  function toggleSlot(i: number) {
    if (lockedReason(i) !== null) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(i)) next.add(i);
      return next;
    });
  }

  const canSubmit = picked.size > 0 && !roomFull;

  const timeLabel =
    pickedIdx.length === 0
      ? t("borrower.booking.noSlot")
      : `${TIME_SLOTS[pickedIdx[0]].start}–${TIME_SLOTS[pickedIdx[pickedIdx.length - 1]].end}`;

  function submit() {
    if (!canSubmit || !room) return;
    // TODO: POST /facilities/:id/bookings with { date, slots }. Until then the
    // booking is pushed to the session store so it shows up under "my requests".
    addRoomBooking({ room, date: todayIso() });
    navigate(ROUTES.MY_LOANS);
  }

  function saveDraft() {
    // Nothing to persist yet. TODO: POST as status "draft".
    navigate(ROUTES.MY_LOANS);
  }

  return (
    <div>
      <PageHeader title={t("nav.roomBooking")} subtitle={t("borrower.booking.subtitle")} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_312px]">
        <div className="flex min-w-0 flex-col gap-4">
          <StepsBar />

          {/* Chosen room */}
          <Panel>
            <div className="p-3.5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-foreground">
                  {t("borrower.booking.chosen")}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={backToList}>
                  {t("borrower.booking.change")}
                </Button>
              </div>
              <RoomCard room={room} />
            </div>
          </Panel>

          {/* Date + slots */}
          <Panel>
            <div className="p-3.5">
              <div className="text-sm font-semibold text-foreground">
                {t("borrower.booking.dateTitle")}
              </div>
              <p className="mb-3 mt-1 text-xs leading-relaxed text-t3">
                {t("borrower.booking.dateHelp", { max: maxSlots })}
              </p>

              <div className="max-w-[260px]">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-t2">
                    {t("borrower.booking.date")}
                  </span>
                  {/* Same-day only: locked rather than hidden so the borrower can
                      still read which date the booking lands on. */}
                  <Input type="date" className="font-mono" value={todayIso()} readOnly disabled />
                </label>
                <p className="mt-1.5 text-[11.5px] text-t4">{t("borrower.booking.sameDay")}</p>
              </div>

              <div className="mt-4 text-sm font-semibold text-foreground">
                {t("borrower.booking.slotTitle")}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-t3">
                {t("borrower.booking.slotHelp", { max: maxSlots })}
              </p>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {TIME_SLOTS.map((slot, i) => {
                  const isPicked = picked.has(i);
                  const reason = lockedReason(i);
                  return (
                    <button
                      key={slot.start}
                      type="button"
                      disabled={reason !== null}
                      aria-pressed={isPicked}
                      onClick={() => toggleSlot(i)}
                      className={cn(
                        "inline-flex min-h-[34px] min-w-[68px] items-center justify-center rounded border px-2.5 font-mono text-xs font-medium transition-colors",
                        isPicked && "border-accent bg-accent text-white",
                        !isPicked && reason === "booked" && "border-border bg-surface-inset text-t4",
                        !isPicked && reason !== "booked" && reason !== null && "border-border bg-card text-t4 opacity-50",
                        !isPicked && reason === null && "border-border bg-card text-t2 hover:border-line-strong hover:text-foreground",
                        reason !== null && "cursor-not-allowed",
                      )}
                    >
                      {slot.start}
                    </button>
                  );
                })}
              </div>

              <p className="mt-2.5 text-xs leading-relaxed text-t3">
                {t("borrower.booking.slotBreak")}
              </p>

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-t3">
                <LegendSwatch className="border-border bg-card" label={t("borrower.booking.slotFree")} />
                <LegendSwatch className="border-accent bg-accent" label={t("borrower.booking.slotPicked")} />
                <LegendSwatch
                  className="border-border bg-surface-inset"
                  label={t("borrower.booking.slotTaken")}
                />
              </div>

              {roomFull ? (
                <Notice tone="alert">{t("borrower.booking.roomFullWarn")}</Notice>
              ) : picked.size === 0 ? (
                <Notice tone="warn">{t("borrower.booking.pickSlotWarn")}</Notice>
              ) : null}
            </div>
          </Panel>
        </div>

        {/* Summary rail */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-0">
          <Panel
            title={
              <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-t3">
                {t("borrower.booking.summary")}
              </span>
            }
          >
            <div className="flex flex-col gap-2.5 p-3.5 text-[13px]">
              <SumRow label={t("borrower.booking.sumRoom")} plain>
                {room.name}
              </SumRow>
              <SumRow label={t("borrower.booking.sumDate")}>{fmtToday()}</SumRow>
              <SumRow label={t("borrower.booking.sumTime")}>{timeLabel}</SumRow>
              <SumRow label={t("borrower.booking.sumHours")}>
                {t("borrower.booking.hours", { count: picked.size })}
              </SumRow>
            </div>

            <div className="border-t border-border bg-[var(--s-info-bg)] px-3.5 py-3 text-xs leading-relaxed text-[var(--s-info-t)]">
              {t("borrower.booking.approvalNote")}
            </div>

            <div className="flex flex-col gap-2 border-t border-border px-3.5 py-3">
              <Button type="button" className="h-10" disabled={!canSubmit} onClick={submit}>
                {t("borrower.booking.submit")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9"
                disabled={!canSubmit}
                onClick={saveDraft}
              >
                {t("borrower.booking.saveDraft")}
              </Button>
            </div>
          </Panel>

          <div className="rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0 text-accent">
                <Check size={15} strokeWidth={2.4} />
              </span>
              <p className="text-xs leading-relaxed text-t3">{t("borrower.booking.autoNote")}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * 1-2-3 progress strip. Step 2 is always current - this page *is* step 2.
 *
 * No draft id here: the reference mockup printed a fixed one, which made
 * every draft look identical. Show it once the server assigns a real id.
 */
function StepsBar() {
  const { t } = useTranslation();
  const steps = [
    t("borrower.booking.step1"),
    t("borrower.booking.step2"),
    t("borrower.booking.step3"),
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm">
      {steps.map((label, i) => {
        const active = i === 1;
        return (
          <div key={label} className="flex items-center gap-2.5">
            <span
              className={cn(
                "inline-flex h-[22px] w-[22px] items-center justify-center rounded border font-mono text-xs font-semibold",
                active ? "border-accent bg-accent text-white" : "border-border bg-transparent text-t3",
              )}
            >
              {i + 1}
            </span>
            <span
              className={cn(
                "whitespace-nowrap text-[13px]",
                active ? "font-semibold text-foreground" : "text-t3",
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RoomCard({ room }: { room: Room }) {
  const { t } = useTranslation();
  const typeDef = ROOM_TYPES.find((rt) => rt.id === room.type);
  return (
    <div className="flex items-start gap-3">
      <div
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-border bg-surface-inset text-t4"
        aria-hidden
      >
        <Building2 size={24} strokeWidth={1.5} />
      </div>
      <div className="min-w-0">
        <div className="text-[15px] font-semibold leading-snug text-foreground">{room.name}</div>
        <div className="mt-1 font-mono text-[11px] text-t4">{room.code}</div>
        <div className="mt-1.5 text-xs text-t3">
          {t(`borrower.rooms.${typeDef?.labelKey ?? "typeLab"}`)} ·{" "}
          {buildingName(room.buildingId)} · {t("borrower.booking.seats", { count: room.capacity })}
        </div>
      </div>
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("inline-block h-[9px] w-[9px] border", className)} aria-hidden />
      {label}
    </span>
  );
}

/** Inline warning strip, matching the mockup's left-accent notice. */
function Notice({ tone, children }: { tone: "warn" | "alert"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "mt-3 rounded border border-l-[3px] px-3 py-2.5 text-xs leading-relaxed",
        tone === "warn"
          ? "border-border border-l-accent-orange bg-[var(--s-hot-bg)] text-[var(--s-hot-t)]"
          : "border-border border-l-[var(--s-alert-t)] bg-[var(--s-alert-bg)] text-[var(--s-alert-t)]",
      )}
    >
      <span className="inline-flex items-start gap-2">
        <TriangleAlert size={13} strokeWidth={2.4} className="mt-0.5 shrink-0" />
        {children}
      </span>
    </div>
  );
}

/** Card frame with an optional title bar. */
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

function SumRow({
  label,
  plain = false,
  children,
}: {
  label: string;
  /** Room names are prose, not figures - skip the mono treatment. */
  plain?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-t3">{label}</span>
      <span className={cn("text-right font-medium text-foreground", !plain && "font-mono")}>
        {children}
      </span>
    </div>
  );
}

function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** "12 ส.ค. 2569" - the booking date, spelled out for the summary. */
function fmtToday(): string {
  const now = new Date();
  return `${format(now, "d MMM", { locale: th })} ${now.getFullYear() + 543}`;
}
