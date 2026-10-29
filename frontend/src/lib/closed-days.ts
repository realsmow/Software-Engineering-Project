import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDay, parseISO } from "date-fns";
import { useTRPCClient } from "@/lib/trpc";

/** One cache entry for every screen, so an admin's save shows everywhere. */
export const HOLIDAYS_QUERY_KEY = ["admin", "holidays"] as const;

export const OPEN_DAYS_QUERY_KEY = ["admin", "openDays"] as const;

/** A weekend or holiday the counter opens anyway; no groupKeys means every department. */
export type OpenDay = { date: string; groupKeys: number[] };

const NONE: ReadonlySet<string> = new Set();

/**
 * Saturday, Sunday, or a day on the admin's holiday list (#234), for a
 * `YYYY-MM-DD` calendar day, unless the admin opened it (presentation day).
 * The counter is shut all day on these.
 */
export function isClosedDay(
  iso: string,
  holidays: ReadonlySet<string>,
  openDates: ReadonlySet<string> = NONE,
): boolean {
  if (openDates.has(iso)) return false;
  const weekday = getDay(parseISO(iso));
  return weekday === 0 || weekday === 6 || holidays.has(iso);
}

/**
 * #234: the days the counter is shut besides weekends, readable by every
 * signed-in role. Empty until the server answers, so a slow answer shows
 * weekends only instead of blocking the page; the server refuses a holiday
 * pickup either way.
 */
export function useHolidays(): ReadonlySet<string> {
  const trpc = useTRPCClient();
  const { data } = useQuery({
    queryKey: HOLIDAYS_QUERY_KEY,
    queryFn: async () => trpc.admin.holidays.query(),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => (data ? new Set(data.dates) : NONE), [data]);
}

/** Weekends or holidays the counter opens anyway, e.g. presentation day. */
export function useOpenDays() {
  const trpc = useTRPCClient();
  return useQuery({
    queryKey: OPEN_DAYS_QUERY_KEY,
    queryFn: async (): Promise<{ days: OpenDay[] }> => trpc.admin.openDays.query(),
    staleTime: 5 * 60_000,
  });
}

/**
 * The opened dates, for any department. The screen treats them as open; the
 * server checks each unit's own department and refuses the rest.
 */
export function useOpenDates(): ReadonlySet<string> {
  const { data } = useOpenDays();
  return useMemo(() => (data ? new Set(data.days.map((d) => d.date)) : NONE), [data]);
}
