import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDay, parseISO } from "date-fns";
import { useTRPCClient } from "@/lib/trpc";

/** One cache entry for every screen, so an admin's save shows everywhere. */
export const HOLIDAYS_QUERY_KEY = ["admin", "holidays"] as const;

/**
 * Saturday, Sunday, or a day on the admin's holiday list (#234), for a
 * `YYYY-MM-DD` calendar day. The counter is shut all day on these.
 */
export function isClosedDay(iso: string, holidays: ReadonlySet<string>): boolean {
  const weekday = getDay(parseISO(iso));
  return weekday === 0 || weekday === 6 || holidays.has(iso);
}

const NONE: ReadonlySet<string> = new Set();

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
