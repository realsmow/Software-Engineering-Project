import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-client";
import { useTRPCClient } from "@/lib/trpc";
import { toMyCredit, type MyCredit } from "./credit.adapter";

/**
 * useMyCredit - the signed-in borrower's own standing (`credit.me`).
 *
 * Reads no id: the server takes the account from the session, so there is no
 * parameter here that could be pointed at somebody else.
 *
 * `auth.me` already carries score and band for the shell, so this is only
 * worth fetching on screens that show the borrow window or the penalties -
 * hence a separate hook rather than a field on the auth store.
 */
export function useMyCredit() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: queryKeys.myCredit,
    queryFn: async (): Promise<MyCredit> => toMyCredit(await trpc.credit.me.query()),
  });
}
