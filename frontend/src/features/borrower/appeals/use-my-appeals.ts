import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/paging";
import { queryKeys } from "@/lib/query-client";
import { useTRPCClient } from "@/lib/trpc";
import type {
  AppealOutput,
  AppealablePenalty,
} from "@/features/supervisor/appeals/appeal.types";

/**
 * The borrower's side of appeals, on `appeal.appealable`, `appeal.mine` and
 * `appeal.create`.
 *
 * An appeal argues with a credit PENALTY, not with a loan: one return can
 * produce a late penalty and a damage penalty, and the borrower may accept one
 * and dispute the other. Which penalties can still be appealed (in force, not
 * already appealed, inside the window) is the server's answer; nothing here
 * works it out again.
 */
const APPEALS_KEY = ["borrower", "appeals"] as const;

export function useAppealable() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...APPEALS_KEY, "appealable"],
    queryFn: (): Promise<AppealablePenalty[]> => trpc.appeal.appealable.query(),
  });
}

export function useMyAppeals() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...APPEALS_KEY, "mine"],
    queryFn: (): Promise<AppealOutput[]> =>
      fetchAllPages((page, pageSize) => trpc.appeal.mine.query({ page, pageSize })),
  });
}

/** Files one. No photos: `appeal.create` takes the penalty and the argument only. */
export function useCreateAppeal() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { penaltyKey: number; appealReason: string }): Promise<AppealOutput> =>
      trpc.appeal.create.mutate(input),
    onSuccess: () => {
      // The penalty leaves `appealable` and the appeal arrives in `mine`.
      void queryClient.invalidateQueries({ queryKey: APPEALS_KEY });
      // `credit.me` marks the deduction as appealed.
      void queryClient.invalidateQueries({ queryKey: queryKeys.myCredit });
    },
  });
}

/** One penalty against a loan, as far as the borrower's screens can see it. */
export interface LoanPenalty {
  penaltyKey: number;
  reason: string | null;
  creditDeducted: number | null;
  issuedAt: string | null;
  /** Set while it can still be appealed. */
  appealableUntil: string | null;
  /** The appeal filed against it, if any. */
  appeal: AppealOutput | null;
}

/**
 * Penalties grouped by the loan they came from.
 *
 * Built from the two appeal lists because they are the only borrower-readable
 * sources that carry `usageKey`: `credit.me` lists penalties without saying
 * which loan each came from. A penalty past its window that was never
 * appealed is therefore not linked to a loan here, and is simply not shown on
 * the loan card rather than guessed at.
 */
export function usePenaltiesByUsage(): Map<number, LoanPenalty[]> {
  const { data: appealable } = useAppealable();
  const { data: mine } = useMyAppeals();

  return useMemo(() => {
    const byUsage = new Map<number, LoanPenalty[]>();
    const add = (usageKey: number | null, penalty: LoanPenalty) => {
      if (usageKey === null) return;
      byUsage.set(usageKey, [...(byUsage.get(usageKey) ?? []), penalty]);
    };

    for (const p of appealable ?? []) {
      add(p.usageKey, {
        penaltyKey: p.penaltyKey,
        reason: p.reason,
        creditDeducted: p.creditDeducted,
        issuedAt: p.issuedAt,
        appealableUntil: p.appealableUntil,
        appeal: null,
      });
    }
    for (const a of mine ?? []) {
      add(a.penalty.usageKey, {
        penaltyKey: a.penalty.penaltyKey,
        reason: a.penalty.reason,
        creditDeducted: a.penalty.creditDeducted,
        issuedAt: a.penalty.issuedAt,
        appealableUntil: null,
        appeal: a,
      });
    }
    return byUsage;
  }, [appealable, mine]);
}
