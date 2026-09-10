import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { POLLING } from "@/constants";
import { useTRPCClient } from "@/lib/trpc";
import { fetchAllPages } from "@/lib/paging";
import type {
  ConditionType,
  RecordReturnOutput,
  StaffQueueBucket,
  StaffQueueCounts,
  StaffQueueRow,
} from "./queue.types";

/**
 * The staff counter's data layer.
 *
 * Everything here refetches rather than patching local state. Two people work
 * this queue from two machines, so the row a staff member is looking at may
 * already have been actioned by the other one; the server is the only thing
 * that knows, and guessing the new state locally is how the two screens drift.
 */
const QUEUE_KEY = ["staff", "queue"] as const;
const COUNTS_KEY = ["staff", "queue", "counts"] as const;

/**
 * Bucket counts for the tiles above the table.
 *
 * Polled on the interval the SRS sets for the staff dashboard (30s). Cheap by
 * design on the server: one count per bucket, no rows.
 */
export function useStaffQueueCounts() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: COUNTS_KEY,
    queryFn: async (): Promise<StaffQueueCounts> => trpc.loan.queueCounts.query(),
    refetchInterval: POLLING.STAFF_QUEUE,
    staleTime: 0,
  });
}

/**
 * One bucket of the queue.
 *
 * `q` is passed to the server rather than filtered here: at a counter the
 * useful search is by the student standing in front of you, and the server
 * matches their name, their ID, the serial and the item name in one go. It
 * also means a match outside the current page is still found.
 */
export function useStaffQueue(bucket: StaffQueueBucket, q: string) {
  const trpc = useTRPCClient();
  const search = q.trim();

  return useQuery({
    queryKey: [...QUEUE_KEY, bucket, search],
    queryFn: async (): Promise<StaffQueueRow[]> =>
      fetchAllPages((page, pageSize) =>
        trpc.loan.staffQueue.query({
          page,
          pageSize,
          bucket,
          ...(search ? { q: search } : {}),
        }),
      ),
    refetchInterval: POLLING.STAFF_QUEUE,
    // A queue row that has already been actioned elsewhere is worse than a
    // brief spinner, so this never serves a cached bucket without revalidating.
    staleTime: 0,
  });
}

/**
 * Refetch the queue and the tiles together after any action.
 *
 * Both, always: acting on a row moves it between buckets, so a count that is
 * not refreshed immediately contradicts the table right next to it.
 */
function useRefreshQueue() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
}

/**
 * Set a unit aside for an approved request.
 *
 * `condition` is the baseline the eventual return is graded against, which is
 * why it is recorded now and not at the counter: whatever is already wrong
 * with the unit must not become this borrower's problem. `resourceKey` is
 * optional - omit it and the server picks a free unit of the right type.
 */
export function useAllocate() {
  const trpc = useTRPCClient();
  const refresh = useRefreshQueue();

  return useMutation({
    mutationFn: (input: {
      reservationKey: number;
      resourceKey?: number;
      condition?: ConditionType;
      note?: string;
    }) => trpc.loan.allocate.mutate(input),
    onSuccess: refresh,
  });
}

/** Hand the prepared unit over. Records that it physically left the counter. */
export function useConfirmPickup() {
  const trpc = useTRPCClient();
  const refresh = useRefreshQueue();

  return useMutation({
    mutationFn: (input: { usageKey: number; note?: string }) =>
      trpc.loan.confirmPickup.mutate(input),
    onSuccess: refresh,
  });
}

/**
 * Take the item back.
 *
 * Settles lateness but deliberately does not grade damage - that is
 * `inspection.create`, so a busy counter can clear returns and inspect later.
 * The late penalty comes back in the result and the caller must show it: the
 * borrower is still standing there when they lose the credit.
 */
export function useRecordReturn() {
  const trpc = useTRPCClient();
  const refresh = useRefreshQueue();

  return useMutation({
    mutationFn: (input: { usageKey: number; note?: string }): Promise<RecordReturnOutput> =>
      trpc.loan.recordReturn.mutate(input),
    onSuccess: refresh,
  });
}

/** Write a unit off as lost. Refused by the server until the row is eligible. */
export function useMarkLost() {
  const trpc = useTRPCClient();
  const refresh = useRefreshQueue();

  return useMutation({
    mutationFn: (input: {
      usageKey: number;
      reason?: string;
      reportedByBorrower?: boolean;
    }) => trpc.loan.markLost.mutate(input),
    onSuccess: refresh,
  });
}
