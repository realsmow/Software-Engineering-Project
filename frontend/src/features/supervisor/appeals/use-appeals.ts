import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { POLLING } from "@/constants";
import { fetchAllPages } from "@/lib/paging";
import { useTRPCClient } from "@/lib/trpc";
import type { AppealOutput, AppealStatus, DecideAppealInput } from "./appeal.types";

/**
 * The appeal desk's data layer, on `appeal.list` and `appeal.decide`.
 *
 * Polled on the supervisor interval (60s) like the approval queue next door:
 * nobody is standing at a counter waiting for an appeal to move.
 *
 * This was mock until the backend's appeal module landed. What the mock had
 * wrong was not the transport but the model - it let the desk lower a damage
 * grade and worked a refund out of the difference, and the server has no grade
 * in this domain at all. See appeal.types.ts.
 */
const APPEALS_KEY = ["appeals"] as const;

/**
 * The queue for one status.
 *
 * Every page is pulled rather than paged through, because the screen shows one
 * card per appeal and has no pager: a supervisor reads the pile, they do not
 * navigate it. The server scopes the rows to the departments this caller
 * manages, so there is nothing to filter here.
 */
export function useAppeals(status: AppealStatus) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...APPEALS_KEY, "queue", status],
    queryFn: async (): Promise<AppealOutput[]> =>
      fetchAllPages((page, pageSize) => trpc.appeal.list.query({ page, pageSize, status })),
    refetchInterval: POLLING.SUPERVISOR_QUEUE,
    staleTime: 0,
  });
}

/**
 * Approve or reject one appeal.
 *
 * The refusals worth knowing about are the server's: it will not let the
 * inspector whose grade is under appeal decide it, and it will not accept a
 * reduction that is not smaller than the original deduction. The page checks
 * the first before offering the buttons at all; the second it checks as the
 * figure is typed. Both are still enforced server-side, so a stale screen
 * gets an error rather than a wrong decision.
 */
export function useDecideAppeal() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DecideAppealInput): Promise<AppealOutput> =>
      trpc.appeal.decide.mutate(input),
    // Every status list moves at once: the row leaves `pending` and arrives in
    // `approved` or `rejected`, so invalidating only the visible one would
    // leave the other two showing the state before the decision.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: APPEALS_KEY }),
  });
}
