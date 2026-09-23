import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import type { LoanOutput } from "@/features/staff/queue/queue.types";

/**
 * One loan in full, for the counter's detail view.
 *
 * Reached from a row in the staff queue (`staff-queue-page.tsx`) rather than
 * listed anywhere of its own - the queue is already the worklist, this is
 * where staff go to see everything about one row and, while it is `Prepared`,
 * swap the unit set aside for it.
 */
const HANDOVER_KEY = ["staff", "handover"] as const;

export function useLoanForStaff(usageKey: number | null) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...HANDOVER_KEY, usageKey],
    queryFn: async (): Promise<LoanOutput | null> =>
      usageKey === null ? null : trpc.loan.getForStaff.query({ usageKey }),
    enabled: usageKey !== null,
  });
}

/**
 * Swap the prepared unit for another of the same type. T1 only (proposal
 * §5.4) - refused by the server on anything else.
 */
export function useSwapUnit() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      usageKey: number;
      resourceKey: number;
      reason?: string;
    }): Promise<LoanOutput> => trpc.loan.swapUnit.mutate(input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: [...HANDOVER_KEY, variables.usageKey] });
      // The row this loan belongs to changes serial/resourceKey too.
      void queryClient.invalidateQueries({ queryKey: ["staff", "queue"] });
    },
  });
}
