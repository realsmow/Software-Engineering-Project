import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { POLLING } from "@/constants";
import { useTRPCClient } from "@/lib/trpc";
import { fetchAllPages } from "@/lib/paging";
import type {
  ApprovalCounts,
  ApprovalQueueRow,
  DecidableRoute,
  DecideApprovalOutput,
  ConditionType,
  ExtensionReviewRow,
  RetirementRequest,
  BorrowerHistoryData,
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

/**
 * Extension requests waiting on this desk.
 *
 * Scoped server-side the same way the main queue is, so no route filter is
 * passed: a supervisor sees what was routed up to them.
 */
export function useExtensionQueue(q: string) {
  const trpc = useTRPCClient();
  const search = q.trim();

  return useQuery({
    queryKey: [...APPROVALS_KEY, "extensions", search],
    queryFn: async (): Promise<ExtensionReviewRow[]> =>
      fetchAllPages((page, pageSize) =>
        trpc.approval.extensionQueue.query({
          page,
          pageSize,
          ...(search ? { q: search } : {}),
        }),
      ),
    refetchInterval: POLLING.SUPERVISOR_QUEUE,
    staleTime: 0,
  });
}

/**
 * Grant or refuse one extension.
 *
 * `condition` is what the item was found in when it was carried to the desk.
 * It is the reason this decision belongs to a person rather than the system,
 * so it is always sent rather than left to the server's default.
 */
export function useDecideExtension() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      extensionKey: number;
      decision: "approve" | "reject";
      condition?: ConditionType;
      note?: string;
    }) => trpc.approval.decideExtension.mutate(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: APPROVALS_KEY });
      // The borrower's own view of this loan just changed too.
      void queryClient.invalidateQueries({ queryKey: ["borrower"] });
    },
  });
}

/**
 * Pending retirement requests (FR-EQP-08), a supervisor's own desk.
 *
 * Same polling interval as the rest of the desk - nobody is standing in
 * front of a supervisor waiting for this pile to move either.
 */
export function useRetirementQueue() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...APPROVALS_KEY, "retirements"],
    queryFn: async (): Promise<RetirementRequest[]> =>
      fetchAllPages((page, pageSize) => trpc.approval.retirementQueue.query({ page, pageSize })),
    refetchInterval: POLLING.SUPERVISOR_QUEUE,
    staleTime: 0,
  });
}

/** Approve or reject one retirement request. Approving retires the resource. */
export function useDecideRetirement() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      requestKey: number;
      decision: "approve" | "reject";
      note?: string;
    }): Promise<RetirementRequest> => trpc.approval.decideRetirement.mutate(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: APPROVALS_KEY });
      // The resource's own row (lendable, status) just changed too.
      void queryClient.invalidateQueries({ queryKey: ["staff", "inventory"] });
    },
  });
}


//Add new function useBorrowerHistory
export function useBorrowerHistory(accountKey: number | undefined) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...APPROVALS_KEY, "borrowerHistory", accountKey],
    queryFn: async (): Promise<BorrowerHistoryData> => {
      if (!accountKey) throw new Error("Missing account key");
      return trpc.staff.borrowerHistory.query({ accountKey }); 
    },
    enabled: !!accountKey,
    staleTime: 5 * 60 * 1000
  });
}
