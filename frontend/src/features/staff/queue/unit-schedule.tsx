import { useTranslation } from "react-i18next";
import { localInstant, todayLocalDayKey } from "@/lib/datetime";
import { isClosedDay, useHolidays } from "@/lib/closed-days";
import { isoOffset } from "@/features/borrower/request/request-draft.store";
import { useUnitSchedule } from "@/features/borrower/catalog/use-equipment-types";

const DAYS = 14;
const DAY_MS = 86_400_000;

/**
 * #235 (instructor item 7, team decision D-04): which unit of one type is
 * busy on which day over the next two weeks, so staff preparing a request
 * can choose a unit whose next booking is not right behind this one.
 *
 * Restored from the borrower catalogue, where it was removed when staff took
 * over choosing the unit (dbce547), and now shown to staff only. Borrower
 * names are never shown. Weekends and the admin's holidays are closed (#234).
 */
export function UnitSchedule({ itemKey }: { itemKey: number }) {
  const { t, i18n } = useTranslation();
  const holidays = useHolidays();
  const start = localInstant(todayLocalDayKey());
  const { data: units, isLoading } = useUnitSchedule(String(itemKey), start.toISOString(), DAYS);
  if (isLoading) return <p className="text-[11px] text-t3">{t("common.loading")}</p>;
  if (!units || units.length === 0) return null;

  const locale = i18n.language.startsWith("th") ? "th-TH" : "en-GB";
  const days = Array.from({ length: DAYS }, (_, i) => {
    const iso = isoOffset(i);
    const at = localInstant(iso);
    return {
      iso,
      from: at.getTime(),
      closed: isClosedDay(iso, holidays),
      label: new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "Asia/Bangkok" }).format(at),
      num: Number(iso.slice(8)),
    };
  });

  return (
    <div className="max-w-full overflow-x-auto rounded border border-border bg-card p-2">
      <table className="border-separate border-spacing-0.5 text-[11px]">
        <thead>
          <tr>
            <th />
            {days.map((d) => (
              <th key={d.iso} className="w-7 text-center font-normal text-t4">
                {d.label}
                <br />
                <span className="font-mono text-t2">{d.num}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.resourceKey}>
              <th className="whitespace-nowrap pr-2 text-left font-mono font-normal text-t2">{u.serialNo}</th>
              {days.map((d) => {
                const busy =
                  u.unavailable ||
                  u.busy.some(
                    (b) => new Date(b.start).getTime() < d.from + DAY_MS && new Date(b.end).getTime() > d.from,
                  );
                const state = d.closed ? "closed" : busy ? "busy" : "free";
                return (
                  <td
                    key={d.iso}
                    title={t(`borrower.detail.slot_${state}`)}
                    aria-label={`${u.serialNo} ${d.iso}: ${t(`borrower.detail.slot_${state}`)}`}
                    className={
                      state === "busy"
                        ? "h-6 min-w-[26px] rounded bg-[var(--s-warn-t)] opacity-70"
                        : state === "closed"
                          ? "h-6 min-w-[26px] rounded bg-muted"
                          : "h-6 min-w-[26px] rounded bg-[var(--s-ok-bg)] ring-1 ring-inset ring-[var(--s-ok-t)]/40"
                    }
                  />
                );
              })}
            </tr>
          ))}
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
      </div>
    </div>
  );
}
