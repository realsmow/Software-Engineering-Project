import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import type { TechnicalConfig } from "./config.types";
import { HOLIDAYS_QUERY_KEY, OPEN_DAYS_QUERY_KEY, type OpenDay } from "@/lib/closed-days";

/**
 * What this server instance is running with.
 *
 * Read once, not polled: these are environment variables and compiled-in
 * constants, fixed for the life of the process. A value here changing while
 * you look at it would mean the server restarted underneath you.
 */
export function useTechnicalConfig() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: ["admin", "config"],
    queryFn: async (): Promise<TechnicalConfig> => trpc.admin.getConfig.query(),
    staleTime: Infinity,
  });
}

/** FR-ADM-04: the counter's working day; loans fall due at its end. */
export function useWorkHours() {
  const trpc = useTRPCClient();
  return useQuery({
    queryKey: ["admin", "workHours"],
    queryFn: async () => (await trpc.admin.getLendingSettings.query()).workHours,
  });
}

export function useUpdateWorkHours() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hours: { start: number; end: number }) =>
      trpc.admin.updateWorkHours.mutate(hours),
    onSuccess: (settings) =>
      queryClient.setQueryData(["admin", "workHours"], settings.workHours),
  });
}

/** #234: the counter's closed days besides weekends, as `YYYY-MM-DD`. */
export function useHolidaysSetting() {
  const trpc = useTRPCClient();
  return useQuery({
    queryKey: HOLIDAYS_QUERY_KEY,
    queryFn: async () => trpc.admin.holidays.query(),
  });
}

/** Replaces the whole list; the borrower screens share the cache entry. */
export function useUpdateHolidays() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dates: string[]) => trpc.admin.updateHolidays.mutate({ dates }),
    onSuccess: (saved) => queryClient.setQueryData(HOLIDAYS_QUERY_KEY, saved),
  });
}

/** Weekends or holidays the counter opens anyway, per department. */
export function useUpdateOpenDays() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (days: OpenDay[]) => trpc.admin.updateOpenDays.mutate({ days }),
    onSuccess: (saved) => queryClient.setQueryData(OPEN_DAYS_QUERY_KEY, saved),
  });
}
