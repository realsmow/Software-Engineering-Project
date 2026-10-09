import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  parseISO,
  startOfMonth,
} from "date-fns";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmtDate, localInstant, todayLocalDayKey } from "@/lib/datetime";
import { cn } from "@/lib/utils";

/**
 * Date picker that shows dates the way the rest of the app does ("9 Oct 2026"),
 * instead of the browser's own format, which differs per machine (10/09/2026
 * reads as 10 September in Thailand).
 *
 * A hidden native input carries the value, so labels, forms and tests keep
 * working with plain yyyy-MM-dd.
 */
export function DateInput({
  value,
  min,
  max,
  onChange,
  ariaLabel,
  className,
}: {
  value: string;
  min?: string;
  max?: string;
  onChange: (iso: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(parseISO(value || todayLocalDayKey())));
  const shown = value ? fmtDate(localInstant(value, 12)) : t("common.pickDate");

  const days = eachDayOfInterval({ start: month, end: endOfMonth(month) });
  const lead = getDay(month); // Sunday first
  const locale = i18n.language.startsWith("th") ? "th-TH" : "en-GB";
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2024, 8, 1 + i)),
  );
  const monthTitle = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month);
  const canPrev = !min || format(endOfMonth(addMonths(month, -1)), "yyyy-MM-dd") >= min;
  const canNext = !max || format(addMonths(month, 1), "yyyy-MM-dd") <= max;

  return (
    <>
      <input
        type="date"
        className="sr-only"
        tabIndex={-1}
        aria-label={ariaLabel}
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
      />
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) setMonth(startOfMonth(parseISO(value || todayLocalDayKey())));
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel ? `${ariaLabel}: ${shown}` : shown}
            className={cn(
              "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 text-left text-sm text-foreground hover:bg-muted",
              className,
            )}
          >
            <span>{shown}</span>
            <CalendarDays size={15} className="text-t3" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[264px] p-3">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label={t("common.prevMonth")}
              disabled={!canPrev}
              onClick={() => setMonth(addMonths(month, -1))}
              className="rounded p-1 hover:bg-muted disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium">{monthTitle}</span>
            <button
              type="button"
              aria-label={t("common.nextMonth")}
              disabled={!canNext}
              onClick={() => setMonth(addMonths(month, 1))}
              className="rounded p-1 hover:bg-muted disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-t4">
            {weekdays.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-0.5">
            {Array.from({ length: lead }, (_, i) => (
              <span key={`lead-${i}`} />
            ))}
            {days.map((day) => {
              const iso = format(day, "yyyy-MM-dd");
              const off = (min !== undefined && iso < min) || (max !== undefined && iso > max);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={off}
                  aria-label={fmtDate(localInstant(iso, 12))}
                  aria-pressed={iso === value}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={cn(
                    "h-8 rounded text-sm",
                    iso === value
                      ? "bg-accent font-semibold text-white"
                      : "text-foreground hover:bg-muted",
                    off && "pointer-events-none opacity-30",
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
