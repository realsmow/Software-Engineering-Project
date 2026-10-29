import { useTranslation } from "react-i18next";
import { localInstant, todayLocalDayKey, toLocalDayKey } from "@/lib/datetime";
import { isClosedDay, useHolidays, useOpenDates } from "@/lib/closed-days";
import { useUnitSchedule } from "@/features/borrower/catalog/use-equipment-types";
import { cn } from "@/lib/utils";

const DAYS = 14;
const MAX_DAYS = 31;
/** Days shown before the pickup day, so a booking that ends just before it shows. */
const LEAD_DAYS = 2;
/** Days shown after the return day, so a booking that starts just after it shows. */
const TAIL_DAYS = 3;
const DAY_MS = 86_400_000;

function shiftDay(dayKey: string, days: number): string {
  return toLocalDayKey(new Date(localInstant(dayKey).getTime() + days * DAY_MS));
}

/**
 * #235 (instructor item 7, team decision D-04): which unit of one type is
 * busy on which day around the request being prepared, so staff can choose a
 * unit whose other bookings sit close to this one and keep a unit with a long
 * free stretch for a long loan.
 *
 * Restored from the borrower catalogue, where it was removed when staff took
 * over choosing the unit (dbce547), and now shown to staff only. Borrower
 * names are never shown. Weekends and the admin's holidays are closed (#234)
 * unless the admin opened the day (0946c26).
 */
export function UnitSchedule({
  itemKey,
  window = null,
  exclude = null,
  options,
}: {
  itemKey: number;
  /** This request's pickup and return; the table is laid out around them. */
  window?: { start: string; end: string } | null;
  /** This request's reservation, left out so its own unit does not look taken by it. */
  exclude?: number | null;
  /** The units staff may choose (loan.prepareOptions); without it every unit looks alike. */
  options?: readonly { resourceKey: number; recommended: boolean }[];
}) {
  const { t, i18n } = useTranslation();
  const holidays = useHolidays();
  // Staff see their own department's queue, so any opened day is theirs.
  const openDates = useOpenDates();
  const today = todayLocalDayKey();
  const pickupDay = window ? toLocalDayKey(window.start) : null;
  const returnDay = window ? toLocalDayKey(window.end) : null;
  const lead = pickupDay ? shiftDay(pickupDay, -LEAD_DAYS) : today;
  const firstDay = lead > today ? lead : today;
  const span = returnDay
    ? Math.round((localInstant(returnDay).getTime() - localInstant(firstDay).getTime()) / DAY_MS) +
      1 +
      TAIL_DAYS
    : DAYS;
  const dayCount = Math.min(MAX_DAYS, Math.max(DAYS, span));
  const { data: units, isLoading } = useUnitSchedule(
    String(itemKey),
    localInstant(firstDay).toISOString(),
    dayCount,
    exclude ?? undefined,
  );
  if (isLoading) return <p className="text-[11px] text-t3">{t("common.loading")}</p>;
  if (!units || units.length === 0) return null;

  const locale = i18n.language.startsWith("th") ? "th-TH" : "en-GB";
  const days = Array.from({ length: dayCount }, (_, i) => {
    const iso = shiftDay(firstDay, i);
    const at = localInstant(iso);
    return {
      iso,
      from: at.getTime(),
      closed: isClosedDay(iso, holidays, openDates),
      inRequest: pickupDay !== null && returnDay !== null && iso >= pickupDay && iso <= returnDay,
      label: new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "Asia/Bangkok" }).format(at),
      num: Number(iso.slice(8)),
    };
  });
  const optionOf = new Map(options?.map((o) => [o.resourceKey, o]));

  return (
    <div className="max-w-full overflow-x-auto rounded border border-border bg-card p-2">
      <table className="border-separate border-spacing-0.5 text-[11px]">
        <thead>
          <tr>
            <th />
            {days.map((d) => (
              <th
                key={d.iso}
                className={cn(
                  "w-7 text-center font-normal",
                  d.inRequest ? "font-semibold text-[var(--accent)]" : "text-t4",
                )}
              >
                {d.label}
                <br />
                <span className={cn("font-mono", d.inRequest ? "text-[var(--accent)]" : "text-t2")}>{d.num}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {units.map((u) => {
            const option = optionOf.get(u.resourceKey);
            const choosable = options === undefined || option !== undefined;
            return (
              <tr key={u.resourceKey} className={choosable ? undefined : "opacity-50"}>
                <th scope="row" className="whitespace-nowrap pr-2 text-left font-normal">
                  <span className="font-mono text-t2">{u.serialNo}</span>
                  {options ? (
                    <span
                      className={cn(
                        "ml-1.5 rounded px-1 py-px text-[10px]",
                        option?.recommended
                          ? "bg-[var(--s-ok-bg)] font-semibold text-[var(--s-ok-t)]"
                          : "text-t3",
                      )}
                    >
                      {option?.recommended
                        ? t("staff.queue.unitRecommendedBadge")
                        : option
                          ? t("staff.queue.unitChoosable")
                          : t("staff.queue.unitNotFree")}
                    </span>
                  ) : null}
                </th>
                {days.map((d) => {
                  const busy =
                    u.unavailable ||
                    u.busy.some(
                      (b) => new Date(b.start).getTime() < d.from + DAY_MS && new Date(b.end).getTime() > d.from,
                    );
                  const state = d.closed ? "closed" : busy ? "busy" : "free";
                  const label = t(`borrower.detail.slot_${state}`);
                  return (
                    <td
                      key={d.iso}
                      title={label}
                      aria-label={`${u.serialNo} ${d.iso}: ${label}${d.inRequest ? `, ${t("staff.queue.thisRequest")}` : ""}`}
                      className={cn(
                        "h-6 min-w-[26px] rounded",
                        state === "busy"
                          ? "bg-[var(--s-warn-t)] opacity-70"
                          : state === "closed"
                            ? "bg-muted"
                            : "bg-[var(--s-ok-bg)]",
                        d.inRequest
                          ? "ring-2 ring-inset ring-[var(--accent)]"
                          : state === "free" && "ring-1 ring-inset ring-[var(--s-ok-t)]/40",
                      )}
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-t3">
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-[var(--s-ok-bg)] ring-1 ring-[var(--s-ok-t)]/40" />
          {t("borrower.detail.slot_free")}
        </span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-[var(--s-warn-t)] opacity-70" />
          {t("borrower.detail.slot_busy")}
        </span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-muted" />
          {t("borrower.detail.slot_closed")}
        </span>
        {window ? (
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded ring-2 ring-inset ring-[var(--accent)]" />
            {t("staff.queue.thisRequest")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
