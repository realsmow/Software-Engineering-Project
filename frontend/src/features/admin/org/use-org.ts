import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPCClient } from "@/lib/trpc";

/**
 * Faculties, departments and clubs, and the mutations that add to them.
 *
 * A group with a facultyId is a department of that faculty; one without is a
 * club. Items can only be created under a group, so every create also
 * invalidates the `item.listManagementGroups` caches the staff screens hold.
 */
const ADMIN_ORG_KEY = ["admin", "org"] as const;

export interface OrgFaculty {
  id: number;
  name: string | null;
}

export interface OrgGroup {
  id: number;
  name: string | null;
  type: "Club" | "Faculty";
  facultyId: number | null;
}

export interface AdminOrg {
  faculties: OrgFaculty[];
  groups: OrgGroup[];
}

export function useAdminOrg() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: ADMIN_ORG_KEY,
    queryFn: (): Promise<AdminOrg> => trpc.admin.listOrg.query(),
  });
}

function useInvalidateOrg() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ADMIN_ORG_KEY }),
      // Inventory and eligibility each cache listManagementGroups under a key ending in "groups".
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "staff" && q.queryKey[q.queryKey.length - 1] === "groups",
      }),
    ]);
}

export function useCreateFaculty() {
  const trpc = useTRPCClient();
  const invalidate = useInvalidateOrg();

  return useMutation({
    mutationFn: (input: { name: string }) => trpc.admin.createFaculty.mutate(input),
    onSuccess: invalidate,
  });
}

/** facultyId given makes a department of that faculty; omitted makes a club. */
export function useCreateGroup() {
  const trpc = useTRPCClient();
  const invalidate = useInvalidateOrg();

  return useMutation({
    mutationFn: (input: { name: string; facultyId?: number }) =>
      trpc.admin.createGroup.mutate(input),
    onSuccess: invalidate,
  });
}
