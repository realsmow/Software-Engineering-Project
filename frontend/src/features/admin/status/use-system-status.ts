import { useQuery } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import type { CronJob, SystemStatus } from "./status.types";

/**
 * System status and the scheduled jobs behind it.
 *
 * Polled on a slow timer: this is a page someone leaves open to watch, and
 * uptime that never moves looks like a frozen screen.
 */
const STATUS_POLL_MS = 30_000;

export function useSystemStatus() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: ["admin", "system-status"],
    queryFn: async (): Promise<SystemStatus> => trpc.admin.getSystemStatus.query(),
    refetchInterval: STATUS_POLL_MS,
    staleTime: 0,
  });
}

export function useCronJobs() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: ["admin", "cron-jobs"],
    queryFn: async (): Promise<CronJob[]> => trpc.admin.listCronJobs.query(),
    refetchInterval: STATUS_POLL_MS,
  });
}
