import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, parseISO, startOfMonth } from "date-fns";
import { useTranslation } from "react-i18next";
import { fmtDate, localInstant, todayLocalDayKey } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { isClosedDay } from "@/lib/closed-days";
import { useCartSchedule } from "../catalog/use-equipment-types";

const DAY_MS = 86_400_000;
const HORIZON_DAYS = 92;

type DayState = "free" | "partial" | "none" | "closed" | "past";

const NO_HOLIDAYS: ReadonlySet<string> = new Set();

export interface CalendarLine {
  itemId: string;
  name: string;
  qty: number;
}

/**
 * Month calendar for the request page (demo feedback): each day is colored by
 * whether the cart's items are free, so the borrower sees when they can borrow
 * before choosing. Click a pickup day, then a return day; the range between
 * is highlighted. The server still checks the exact hours on submit.
 */
export function AvailabilityCalendar({
  lines,
  startDate,
  endDate,
  maxDate,
  holidays = NO_HOLIDAYS,
  openDates = NO_HOLIDAYS,
  onPickup,
  onReturn,
}: {
  lines: CalendarLine[];
  startDate: string;
  endDate: string | null;
  maxDate: string;
  /** #234: the admin's holidays, closed like a weekend. */
  holidays?: ReadonlySet<string>;
  /** Weekends or holidays the admin opened anyway (presentation day). */
  openDates?: ReadonlySet<string>;
  onPickup: (iso: string) => void;
  onReturn: (iso: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const today = todayLocalDayKey();
  const [month, setMonth] = useState(() => startOfMonth(parseISO(startDate || today)));
  // No return day yet means the next tap sets it. Derived, not stored, so a
  // remount while the page reloads cannot lose the step.
  const picking: "pickup" | "return" = endDate === null ? "return" : "pickup";
  const from = localInstant(today).toISOString();
  const schedules = useCartSchedule(
    lines.map((l) => l.itemId),
    from,
    HORIZON_DAYS,
  );

  const locale = i18n.language.startsWith("th") ? "th-TH" : "en-GB";
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2024, 8, 1 + i)),
  );
  const title = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month);
  const days = eachDayOfInterval({ start: month, end: endOfMonth(month) });

  /** Free units per line on one Bangkok day, or null while loading. */
  function freeCounts(iso: string): number[] | null {
    const dayFrom = localInstant(iso).getTime();
    const counts: number[] = [];
    for (const query of schedules) {
      if (!query.data) return null;
      counts.push(
        query.data.filter(
          (u) =>
            !u.unavailable &&
            !u.busy.some(
              (b) => new Date(b.start).getTime() < dayFrom + DAY_MS && new Date(b.end).getTime() > dayFrom,
            ),
        ).length,
      );
    }
    return counts;
  }

  function stateOf(iso: string, counts: number[] | null): DayState {
    if (iso < today || iso > maxDate) return "past";
    // Weekends and holidays are shut unless the admin opened the day.
    if (isClosedDay(iso, holidays, openDates)) return "closed";
    if (!counts || lines.length === 0) return "free";
    if (counts.some((n) => n === 0)) return "none";
    return counts.every((n, i) => n >= lines[i].qty) ? "free" : "partial";
  }

  function pick(iso: string, state: DayState) {
    if (state === "past") return;
    // A day before the pickup starts over instead of making a backwards range.
    if (picking === "pickup" || iso < startDate) {
      // The counter is shut at weekends and on holidays, so nobody collects then.
      if (state === "closed") return;
      onPickup(iso);
    } else {
      // A return on a closed day is fine: it rolls to the next open day.
      onReturn(iso);
    }
  }

  const prevAllowed = format(endOfMonth(addMonths(month, -1)), "yyyy-MM-dd") >= today;
  const nextAllowed = format(addMonths(month, 1), "yyyy-MM-dd") <= maxDate;

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label={t("common.prevMonth")}
          disabled={!prevAllowed}
          onClick={() => setMonth(addMonths(month, -1))}
          className="rounded p-1.5 hover:bg-muted disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <div className="text-[11px] text-t3">
            {picking === "pickup" ? t("borrower.request.calPickPickup") : t("borrower.request.calPickReturn")}
          </div>
        </div>
        <button
          type="button"
          aria-label={t("common.nextMonth")}
          disabled={!nextAllowed}
          onClick={() => setMonth(addMonths(month, 1))}
          className="rounded p-1.5 hover:bg-muted disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-t4">
        {weekdays.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: getDay(month) }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {days.map((day) => {
          const iso = format(day, "yyyy-MM-dd");
          const counts = freeCounts(iso);
          const state = stateOf(iso, counts);
          const isEnd = iso === startDate || iso === endDate;
          const inRange = endDate !== null && iso > startDate && iso < endDate;
          const detail = counts
            ? lines
                .map((l, i) => t("borrower.request.calDetail", { item: l.name, free: counts[i], need: l.qty }))
                .join(", ")
            : "";
          return (
            <button
              key={iso}
              type="button"
              disabled={state === "past"}
              aria-pressed={isEnd}
              aria-label={`${fmtDate(localInstant(iso, 12))}: ${t(`borrower.request.cal_${state}`)}${detail ? ` (${detail})` : ""}`}
              title={detail || undefined}
              onClick={() => pick(iso, state)}
              className={cn(
                "relative h-10 rounded text-sm font-medium transition-colors",
                state === "free" && "bg-[var(--s-ok-bg)] text-[var(--s-ok-t)] hover:brightness-110",
                state === "partial" && "bg-[var(--s-warn-bg)] text-[var(--s-warn-t)] hover:brightness-110",
                state === "none" && "bg-[var(--s-alert-bg)] text-[var(--s-alert-t)] line-through",
                state === "closed" && "bg-muted text-t4",
                state === "past" && "text-t4 opacity-40",
                inRange && "ring-2 ring-inset ring-accent/60",
                isEnd && "bg-accent text-white ring-2 ring-accent",
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-t3">
        {(["free", "partial", "none", "closed"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span
              className={cn(
                "inline-block h-2.5 w-2.5 rounded",
                s === "free" && "bg-[var(--s-ok-t)]",
                s === "partial" && "bg-[var(--s-warn-t)]",
                s === "none" && "bg-[var(--s-alert-t)]",
                s === "closed" && "bg-muted ring-1 ring-border",
              )}
            />
            {t(`borrower.request.cal_${s}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
