import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { Building2, Check, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BUSINESS, ROUTES } from "@/constants";
import { ImageThumb } from "@/components/shared/image-thumb";
import { fmtDate, todayLocalDayKey } from "@/lib/datetime";
import { getErrorMessage } from "@/lib/error-messages";
import { cn } from "@/lib/utils";
import { activeRoomBookings } from "../mock-data";
import { useMyRequests } from "../loans/use-my-requests";
import type { Room, RoomSlot } from "./room.adapter";
import { useCreateRoomBooking, useRoom, useRoomDay } from "./use-rooms";

/**
 * Room booking request - reached from a room-list row. The room comes from the
 * URL, so the page is refreshable and shareable; the date and the chosen slots
 * are form state that lives here.
 *
 * Layout follows the reference mockup: a content column (steps → chosen room →
 * date & slots) beside a sticky summary rail.
 *
 * T3 goes to staff for approval, not to a supervisor: what makes a room T3 is
 * that it cannot be carried away (approval-policy.ts). Sending the request
 * holds the slots straight away, pending or not.
 *
 * The chips come from `item.roomAvailability`, so a slot somebody else took,
 * or one that has already passed, is greyed out by the same rule the booking
 * is checked against on the server.
 */
export default function RoomBookingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const today = todayLocalDayKey();
  const { data: room, isLoading } = useRoom(id);
  const { data: day } = useRoomDay(id, today);
  const create = useCreateRoomBooking();
  const { requests } = useMyRequests();

  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const slots: RoomSlot[] = useMemo(() => day?.slots ?? [], [day]);
  // Taken by someone else, or already in the past.
  const booked = useMemo(
    () => new Set(slots.filter((s) => !s.available).map((s) => s.index)),
    [slots],
  );

  // One room at a time: a booking already in flight closes this form.
  const held = activeRoomBookings(requests);
  const heldBooking = held.length >= BUSINESS.MAX_T3_ACTIVE_BOOKINGS ? held[0] : null;

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

  const maxSlots = day?.maxSlotsPerBooking ?? BUSINESS.MAX_ROOM_BOOKING_SLOTS;
  const slotMinutes = day?.slotMinutes ?? BUSINESS.ROOM_SLOT_MINUTES;
  // Derived from the server's cap, so the copy and the limit it describes move together.
  const maxHours = (maxSlots * slotMinutes) / 60;
  const pickedIdx = [...picked].sort((a, b) => a - b);
  const roomFull = slots.length > 0 && booked.size >= slots.length;
  const byIndex = new Map(slots.map((s) => [s.index, s]));

  /**
   * By clock time, not by position: 11:30 and 13:00 sit next to each other in
   * the list and an hour apart on the clock, so a booking may not span lunch.
   */
  function adjacent(a: number, b: number): boolean {
    const x = byIndex.get(a);
    const y = byIndex.get(b);
    return Boolean(x && y && (x.end === y.start || y.end === x.start));
  }

  /**
   * A slot is locked when it is already booked, when the quota is used up, or
   * when taking it would leave a gap. Adjacency is by clock time, so 11:00 and
   * 13:00 never join across the lunch break.
   */
  function lockedReason(i: number): "booked" | "quota" | "gap" | null {
    if (booked.has(i)) return "booked";
    if (picked.has(i)) {
      // Only an edge may be removed. Removing a slot from the middle would
      // split one booking into two disconnected periods.
      const first = pickedIdx[0];
      const last = pickedIdx[pickedIdx.length - 1];
      return picked.size > 1 && i !== first && i !== last ? "gap" : null;
    }
    if (picked.size >= maxSlots) return "quota";
    if (picked.size > 0 && !pickedIdx.some((j) => adjacent(i, j))) return "gap";
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

  const canSubmit =
    room.bookable && picked.size > 0 && !roomFull && heldBooking === null && !create.isPending;

  const timeLabel =
    pickedIdx.length === 0
      ? t("borrower.booking.noSlot")
      : `${byIndex.get(pickedIdx[0])?.start}–${byIndex.get(pickedIdx[pickedIdx.length - 1])?.end}`;

  async function submit() {
    if (!canSubmit || !room) return;
    setError(null);
    try {
      const result = await create.mutateAsync({
        roomKey: Number(room.id),
        date: today,
        slots: pickedIdx,
        reason: reason.trim() || undefined,
      });
      // A clash comes back as a rejected line, not a thrown error.
      if (result.created.length === 0) {
        setError(getErrorMessage(result.rejected[0]?.code ?? "UNKNOWN_ERROR"));
        setPicked(new Set());
        return;
      }
      navigate(ROUTES.MY_LOANS);
    } catch (e) {
      setError(getErrorMessage(e));
    }
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
                {t("borrower.booking.dateHelp", {
                  minutes: slotMinutes,
                  hours: maxHours,
                })}
              </p>

              <div className="max-w-[260px]">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-t2">
                    {t("borrower.booking.date")}
                  </span>
                  {/* Same-day only: locked rather than hidden so the borrower can
                      still read which date the booking lands on. */}
                  <Input type="date" className="font-mono" value={today} readOnly disabled />
                </label>
                <p className="mt-1.5 text-[11.5px] text-t4">{t("borrower.booking.sameDay")}</p>
              </div>

              <div className="mt-4 text-sm font-semibold text-foreground">
                {t("borrower.booking.slotTitle")}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-t3">
                {t("borrower.booking.slotHelp", {
                  max: maxSlots,
                  hours: maxHours,
                })}
              </p>

              <div className="mt-2.5 overflow-x-auto pb-1">
                <div className="grid min-w-[730px] grid-cols-10 gap-1.5">
                  {slots.map((slot) => {
                    const i = slot.index;
                    const isPicked = picked.has(i);
                    const locked = lockedReason(i);
                    return (
                      <button
                        key={slot.start}
                        type="button"
                        disabled={locked !== null}
                        aria-pressed={isPicked}
                        onClick={() => toggleSlot(i)}
                        className={cn(
                          "inline-flex min-h-[34px] min-w-[68px] items-center justify-center rounded border px-2.5 font-mono text-xs font-medium transition-colors",
                          isPicked && "border-accent bg-accent text-white",
                          !isPicked && locked === "booked" && "border-border bg-surface-inset text-t4",
                          !isPicked && locked !== "booked" && locked !== null && "border-border bg-card text-t4 opacity-50",
                          !isPicked && locked === null && "border-border bg-card text-t2 hover:border-line-strong hover:text-foreground",
                          locked !== null && "cursor-not-allowed",
                        )}
                      >
                        {slot.start}
                      </button>
                    );
                  })}
                </div>
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

              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs font-medium text-t2">
                  {t("borrower.booking.reason")}
                </span>
                <Input
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("borrower.booking.reasonPlaceholder")}
                />
              </label>

              {error ? <Notice tone="alert">{error}</Notice> : null}

              {!room.bookable ? (
                <Notice tone="alert">{t("borrower.booking.closedWarn")}</Notice>
              ) : heldBooking ? (
                <Notice tone="alert">
                  {t("borrower.booking.heldWarn", { name: heldBooking.name })}
                </Notice>
              ) : roomFull ? (
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
                {t("borrower.booking.hours", {
                  count: (picked.size * slotMinutes) / 60,
                })}
              </SumRow>
            </div>

            <div className="border-t border-border bg-[var(--s-info-bg)] px-3.5 py-3 text-xs leading-relaxed text-[var(--s-info-t)]">
              {t("borrower.booking.approvalNote")}
            </div>

            <div className="flex flex-col gap-2 border-t border-border px-3.5 py-3">
              <Button type="button" className="h-10" disabled={!canSubmit} onClick={() => void submit()}>
                {create.isPending ? t("common.loading") : t("borrower.booking.submit")}
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
  const facts = [
    room.location,
    room.capacity !== null ? t("borrower.booking.seats", { count: room.capacity }) : null,
  ].filter(Boolean);
  return (
    <div className="flex items-start gap-3">
      <ImageThumb src={room.imageUrl} alt={room.name} size={64} icon={Building2} />
      <div className="min-w-0">
        <div className="text-[15px] font-semibold leading-snug text-foreground">{room.name}</div>
        {room.description ? (
          <div className="mt-1 text-[11px] text-t4">{room.description}</div>
        ) : null}
        {facts.length > 0 ? (
          <div className="mt-1.5 text-xs text-t3">{facts.join(" · ")}</div>
        ) : null}
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

/** "12 ส.ค. 2569" / "12 Aug 2026" - the booking date, spelled out for the summary. */
function fmtToday(): string {
  return fmtDate(new Date());
}
