import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { POLLING } from "@/constants";
import { useTRPCClient } from "@/lib/trpc";
import { fetchAllPages } from "@/lib/paging";
import type {
  ApprovalCounts,
  ApprovalQueueRow,
  DecidableRoute,
  DecideApprovalOutput,
} from "./approval.types";

/**
 * The approval desk's data layer.
 *
 * Polled on the interval the SRS sets for the supervisor queue (60s), slower
 * than the staff counter because nobody is standing in front of a supervisor
 * waiting for the screen to move.
 */
const APPROVALS_KEY = ["approvals"] as const;

export function useApprovalCounts() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...APPROVALS_KEY, "counts"],
    queryFn: async (): Promise<ApprovalCounts> => trpc.approval.counts.query(),
    refetchInterval: POLLING.SUPERVISOR_QUEUE,
    staleTime: 0,
  });
}

/**
 * The queue itself.
 *
 * `route` omitted means "everything this caller may decide", which is what the
 * server already scopes for us - a supervisor sees their pile, staff see
 * theirs, and neither has to be told which they are.
 */
export function useApprovalQueue(route: DecidableRoute | undefined, q: string) {
  const trpc = useTRPCClient();
  const search = q.trim();

  return useQuery({
    queryKey: [...APPROVALS_KEY, "queue", route ?? "all", search],
    queryFn: async (): Promise<ApprovalQueueRow[]> =>
      fetchAllPages((page, pageSize) =>
        trpc.approval.queue.query({
          page,
          pageSize,
          ...(route ? { route } : {}),
          ...(search ? { q: search } : {}),
        }),
      ),
    refetchInterval: POLLING.SUPERVISOR_QUEUE,
    staleTime: 0,
  });
}

/**
 * Approve or reject one request.
 *
 * A rejection without a reason is refused by the server, so the caller has to
 * collect one first. That is deliberate on both sides: a borrower whose
 * request is refused is owed an explanation from the person who refused it.
 */
export function useDecideApproval() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      reservationKey: number;
      decision: "approve" | "reject";
      reason?: string;
    }): Promise<DecideApprovalOutput> => trpc.approval.decide.mutate(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: APPROVALS_KEY }),
  });
}
