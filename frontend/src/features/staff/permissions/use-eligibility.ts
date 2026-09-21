import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";
import type {
  AuthorityRoleOption,
  EligibilityGroupOption,
  EligibilityRule,
} from "./permissions.types";

/**
 * Who may borrow which catalogue type.
 *
 * Reference data (groups, roles) is cached for the session - it is admin
 * configuration, not something that changes while the editor is open - while
 * the rule list itself is refetched per type and invalidated on every save, so
 * two staff editing the same type never overwrite one another silently.
 */
const ELIGIBILITY_KEY = ["staff", "eligibility"] as const;

export function useEligibility(itemKey: number | null) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...ELIGIBILITY_KEY, itemKey],
    queryFn: async (): Promise<EligibilityRule[]> =>
      itemKey === null ? [] : trpc.item.listEligibility.query({ itemKey }),
    enabled: itemKey !== null,
  });
}

/**
 * Replaces the rule set wholesale (the server's own semantics): rules missing
 * from the array are removed, so an empty array closes the type to everyone.
 */
export function useSetEligibility() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      itemKey: number;
      rules: { groupKey: number; authorityRoleKey: number }[];
    }): Promise<EligibilityRule[]> => trpc.item.setEligibility.mutate(input),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: [...ELIGIBILITY_KEY, variables.itemKey] }),
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
