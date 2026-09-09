import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { damageWeight, type AppealRow, type DecideAppealInput } from "./appeal.types";
import { MOCK_APPEALS } from "./mock-appeals";

/**
 * The appeal desk's data layer.
 *
 * MOCK. `appeal.*` does not exist on the backend yet (schema.prisma has
 * AppealInfo; no router or service reads it), so these two hooks are the only
 * place that knows. They already have the shape the real ones will have, so
 * landing the backend means swapping the two bodies for
 * `trpc.appeal.queue.query()` / `trpc.appeal.decide.mutate()` and deleting
 * mock-appeals.ts.
 *
 * The decision is kept in module state rather than pretending to persist: a
 * refresh puts the queue back, which is honest about there being no server.
 */
const APPEALS_KEY = ["appeals"] as const;

/** Decisions taken this session, so the list visibly responds to the desk. */
const decided = new Map<number, AppealRow["status"]>();

export function useAppeals() {
  return useQuery({
    queryKey: APPEALS_KEY,
    queryFn: async (): Promise<AppealRow[]> =>
      MOCK_APPEALS.filter((a) => (decided.get(a.appealKey) ?? a.status) === "Pending"),
  });
}

/**
 * Credit handed back by lowering a grade.
 *
 * Derived from the two grades rather than typed in, so the refund can never
 * disagree with the verdict it came from. Mirrors DAMAGE_CREDIT_WEIGHT on the
 * server; the real procedure will compute the same figure server-side and this
 * becomes a preview of it.
 */
export function refundFor(row: AppealRow, newLevel: AppealRow["gradedLevel"]): number {
  const before = damageWeight(row.gradedLevel);
  const after = damageWeight(newLevel);
  if (before === 0) return 0;
  const perPoint = row.creditDeducted / before;
  return Math.max(0, Math.round(row.creditDeducted - perPoint * after));
}

export function useDecideAppeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DecideAppealInput) => {
      // Same refusals the server will make, so the page is written against the
      // real rules rather than against a permissive stub.
      if (!input.reason.trim()) throw new Error("APPEAL_REASON_REQUIRED");
      if (input.decision === "reduce" && !input.newLevel) {
        throw new Error("APPEAL_NEW_LEVEL_REQUIRED");
      }
      decided.set(input.appealKey, input.decision === "reduce" ? "Approved" : "Rejected");
      return { ok: true as const };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: APPEALS_KEY }),
  });
}
