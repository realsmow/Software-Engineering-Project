import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import type { CronJob, CronJobId, SystemStatus } from "./status.types";

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

/**
 * Runs one scheduled job now.
 *
 * The three unbuilt jobs refuse with NOT_IMPLEMENTED naming the table they
 * would need, so the button explains itself rather than failing blankly. On
 * success the job list is refetched: the point of pressing it is to see the
 * run recorded.
 */
export function useRunCronJob() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (job: CronJobId) => trpc.admin.runCronJob.mutate({ job }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "cron-jobs"] });
      // A job that charges penalties or writes off a unit changes what every
      // other admin screen reports.
      void queryClient.invalidateQueries({ queryKey: ["admin", "system-status"] });
    },
  });
}
