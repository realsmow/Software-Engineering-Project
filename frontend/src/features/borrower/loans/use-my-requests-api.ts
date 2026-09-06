import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { POLLING } from "@/constants";
import { useTRPCClient } from "@/lib/trpc";
import { fetchAllPages } from "@/lib/paging";
import { toBorrowerRequest, type BorrowerRequest } from "./request.adapter";

/**
 * The signed-in borrower's own requests.
 *
 * Polled on the request-status interval the SRS sets: what changes here is
 * somebody else's decision (a supervisor approving, staff preparing), so the
 * borrower has no local event to refresh on.
 */
const MY_REQUESTS_KEY = ["loan", "my-requests"] as const;

export function useMyRequestsApi() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: MY_REQUESTS_KEY,
    queryFn: async (): Promise<BorrowerRequest[]> => {
      const rows = await fetchAllPages((page, pageSize) =>
        trpc.loan.list.query({ page, pageSize }),
      );
      return rows.map(toBorrowerRequest);
    },
    refetchInterval: POLLING.REQUEST_STATUS,
  });
}

/**
 * Calls off a request.
 *
 * Only while nothing physical has happened - once staff have set a unit aside
 * it goes back through the counter instead. The server decides that and
 * reports it in `cancellable`, so the button is hidden rather than the rule
 * being re-implemented here.
 */
export function useCancelRequest() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { reservationKey: number; reason?: string }) =>
      trpc.loan.cancel.mutate(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MY_REQUESTS_KEY });
      // Cancelling frees the unit, so the catalogue's counts move too.
      void queryClient.invalidateQueries({ queryKey: ["equipment-types"] });
    },
  });
}
