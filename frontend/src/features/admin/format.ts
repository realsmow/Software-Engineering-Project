import { format } from "date-fns";
import { th } from "date-fns/locale";

/** "6 ส.ค. 09:50" — compact date+time for tables. Returns "—" for "-"/empty. */
export function fmtDateTime(iso: string): string {
  if (!iso || iso === "-") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${format(d, "d MMM", { locale: th })} ${format(d, "HH:mm")}`;
}

/** "6 ส.ค. 2569" — date only, Buddhist year. */
export function fmtDate(iso: string): string {
  if (!iso || iso === "-") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${format(d, "d MMM", { locale: th })} ${d.getFullYear() + 543}`;
}

/** "6 ส.ค." — compact day+month for chart axes. */
export function fmtDayShort(iso: string): string {
  if (!iso || iso === "-") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "d MMM", { locale: th });
}

/** "09:00" — hour label for a 0–23 hour bucket. */
export function fmtHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}
