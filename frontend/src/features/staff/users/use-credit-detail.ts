import { useQuery } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import { toMyCredit, type MyCredit } from "@/features/account/credit.adapter";

const CREDIT_DETAIL_KEY = ["staff", "credit-detail"] as const;

/**
 * A borrower's credit standing, for staff reviewing them (`credit.getById`).
 *
 * Same `creditOutput` shape as the borrower's own `credit.me`, so this goes
 * through the same adapter - score, band and penalties mean one thing in this
 * app, not a staff-side copy that can drift from the borrower-side one.
 */
export function useCreditDetail(id: number | null) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...CREDIT_DETAIL_KEY, id],
    queryFn: async (): Promise<MyCredit | null> =>
      id === null ? null : toMyCredit(await trpc.credit.getById.query({ id })),
    enabled: id !== null,
  });
}
