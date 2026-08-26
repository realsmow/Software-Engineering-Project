import { format } from "date-fns";
import { th } from "date-fns/locale";

/**
 * "12 ส.ค. 13:00" - compact date+time for catalog/loan tables. Returns "-" for
 * missing or unparsable values so callers don't have to guard.
 *
 * TODO: `features/admin/format.ts` has the same helper. Both should move to a
 * shared `lib/format.ts` once someone owns that consolidation - duplicating the
 * wrapper beats coupling two feature folders in the meantime.
 */
export function fmtDateTime(iso?: string): string {
  if (!iso || iso === "-") return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return `${format(d, "d MMM", { locale: th })} ${format(d, "HH:mm")}`;
}

/** "12 ส.ค." - day + month, for the availability strip tooltips. */
export function fmtDayMonth(date: Date): string {
  return format(date, "d MMM", { locale: th });
}
