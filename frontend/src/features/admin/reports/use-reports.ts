import { useQuery } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import type { ReportSummary } from "./report.types";

/**
 * Lending activity, counted live.
 *
 * Not polled: a report is something you open, read and act on, and a total
 * that moves while you are reading it is harder to trust, not easier.
 */
export function useReportSummary(topLimit = 10) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: ["reports", "summary", topLimit],
    queryFn: async (): Promise<ReportSummary> =>
      trpc.report.summary.query({ topLimit }),
  });
}
