import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import type {
  AuthorityRoleOption,
  EligibilityGroupOption,
  EligibilityRule,
  EligibilityTarget,
} from "./permissions.types";

/**
 * Who may borrow which catalogue type, or book which room.
 *
 * Reference data (groups, roles) is cached for the session - it is admin
 * configuration, not something that changes while the editor is open - while
 * the rule list itself is refetched per target and invalidated on every save,
 * so two staff editing the same type never overwrite one another silently.
 */
const ELIGIBILITY_KEY = ["staff", "eligibility"] as const;

/** An item type and a room can share a numeric key, so the kind is part of the cache key. */
function targetKey(target: EligibilityTarget) {
  return "roomKey" in target ? ["room", target.roomKey] : ["type", target.itemKey];
}

export function useEligibility(target: EligibilityTarget | null) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...ELIGIBILITY_KEY, ...(target === null ? [null] : targetKey(target))],
    queryFn: async (): Promise<EligibilityRule[]> =>
      target === null ? [] : trpc.item.listEligibility.query(target),
    enabled: target !== null,
  });
}

/**
 * Replaces the rule set wholesale (the server's own semantics): rules missing
 * from the array are removed, so an empty array closes the type or room to
 * everyone.
 */
export function useSetEligibility() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      input: EligibilityTarget & {
        rules: { groupKey: number; authorityRoleKey: number }[];
      },
    ): Promise<EligibilityRule[]> => trpc.item.setEligibility.mutate(input),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: [...ELIGIBILITY_KEY, ...targetKey(variables)] }),
  });
}

export function useManagementGroups() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...ELIGIBILITY_KEY, "groups"],
    queryFn: async (): Promise<EligibilityGroupOption[]> =>
      trpc.item.listManagementGroups.query(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAuthorityRoles() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...ELIGIBILITY_KEY, "roles"],
    queryFn: async (): Promise<AuthorityRoleOption[]> => trpc.item.listAuthorityRoles.query(),
    staleTime: 5 * 60 * 1000,
  });
}
