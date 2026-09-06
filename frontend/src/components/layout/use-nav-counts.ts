import { useQuery } from "@tanstack/react-query";
import { POLLING } from "@/constants";
import { useAuthStore } from "@/features/auth/auth.store";
import { useTRPCClient } from "@/lib/trpc";

/**
 * Live badge numbers for the sidebar.
 *
 * navigation.ts used to carry these as literals (`count: 23`, `count: 6`),
 * which its own comment warned against: "a wrong count is worse than none".
 * They were decoration copied from the mockup, and they stayed wrong on every
 * screen - the sidebar claimed 23 items of counter work against 5 real ones.
 *
 * Only the counts an endpoint can actually answer appear here. An item with no
 * number is honest; an item with the wrong one is not, so `appeals` and
 * `inventory` stay blank until something can count them.
 */
export function useNavCounts(): Record<string, number | undefined> {
  const role = useAuthStore((s) => s.user?.role);
  const trpc = useTRPCClient();

  // Both procedures sit behind StaffMiddleware, so a borrower asking would
  // simply collect a 403 on every page. Don't ask.
  const staffSide = role === "staff" || role === "supervisor" || role === "admin";

  const { data: queue } = useQuery({
    queryKey: ["nav-counts", "queue"],
    queryFn: () => trpc.loan.queueCounts.query(),
    enabled: staffSide,
    refetchInterval: POLLING.STAFF_QUEUE,
  });

  const { data: approvals } = useQuery({
    queryKey: ["nav-counts", "approvals"],
    queryFn: () => trpc.approval.counts.query(),
    enabled: staffSide,
    refetchInterval: POLLING.SUPERVISOR_QUEUE,
  });

  return {
    /**
     * Work the counter can act on right now. `onLoan` is deliberately left
     * out: an item sitting correctly with a borrower is not a task, and
     * counting it would make the badge grow as lending goes well.
     */
    queue: nonZero(queue && queue.toPrepare + queue.toHandover + queue.overdue),
    inspect: nonZero(queue?.toInspect),
    /** A supervisor's own pile, not the whole desk. */
    approvals: nonZero(approvals?.supervisor),
  };
}

/**
 * Hide a badge showing nothing.
 *
 * A "0" next to a menu item is not information, it is a number the eye stops
 * on before finding out it means "empty". An item with no work simply carries
 * no badge, which is what every other counter in the shell does.
 */
function nonZero(n: number | undefined): number | undefined {
  return n ? n : undefined;
}
