import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import type { TechnicalConfig } from "./config.types";

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
