import { useQuery } from "@tanstack/react-query";
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
