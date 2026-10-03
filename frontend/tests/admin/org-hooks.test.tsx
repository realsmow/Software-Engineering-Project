import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { orgOutput } from "../../../backend/src/admin/admin.schema";
import {
  useAdminOrg,
  useCreateFaculty,
  useCreateGroup,
} from "../../src/features/admin/org/use-org";

const api = vi.hoisted(() => ({ list: vi.fn(), faculty: vi.fn(), group: vi.fn() }));
vi.mock("../../src/lib/trpc", () => ({
  useTRPCClient: () => ({
    admin: {
      listOrg: { query: api.list },
      createFaculty: { mutate: api.faculty },
      createGroup: { mutate: api.group },
    },
  }),
}));

describe("organization query and cache refresh", () => {
  let client: QueryClient;
  const org = orgOutput.strict().parse({
    faculties: [{ id: 1, name: "Engineering" }],
    groups: [{ id: 10, name: "Computer Engineering", type: "Faculty", facultyId: 1 }],
  });
  const relatedKeys = [
    ["admin", "org"],
    ["staff", "inventory", "groups"],
    ["staff", "eligibility", "groups"],
  ];
  beforeEach(() => {
    vi.resetAllMocks();
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });
  afterEach(() => client.clear());
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  it("reads faculties and departments using the backend output contract", async () => {
    api.list.mockResolvedValue(org);
    const { result } = renderHook(() => useAdminOrg(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(org);
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it.each(["faculty", "department", "club"] as const)(
    "refreshes organization and staff group caches after creating a %s",
    async (kind) => {
      for (const key of relatedKeys) client.setQueryData(key, org);
      client.setQueryData(["admin", "users"], []);
      api.faculty.mockResolvedValue({ id: 2, name: "Science" });
      api.group.mockResolvedValue({
        id: 20,
        name: "Physics",
        type: kind === "club" ? "Club" : "Faculty",
        facultyId: kind === "club" ? null : 1,
      });
      const { result } = renderHook(
        () => ({ faculty: useCreateFaculty(), group: useCreateGroup() }),
        { wrapper }
      );
      const input =
        kind === "faculty"
          ? { name: "Science" }
          : kind === "club"
            ? { name: "Physics" }
            : { name: "Physics", facultyId: 1 };
      await act(async () => {
        if (kind === "faculty") await result.current.faculty.mutateAsync(input);
        else await result.current.group.mutateAsync(input);
      });
      expect(kind === "faculty" ? api.faculty : api.group).toHaveBeenCalledWith(input);
      for (const key of relatedKeys)
        expect(client.getQueryState(key)?.isInvalidated).toBe(true);
      expect(client.getQueryState(["admin", "users"])?.isInvalidated).toBe(false);
    }
  );

  it("preserves cached organizations when group creation fails", async () => {
    for (const key of relatedKeys) client.setQueryData(key, org);
    const error = new Error("FACULTY_NOT_FOUND");
    api.group.mockRejectedValue(error);
    const { result } = renderHook(() => useCreateGroup(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ name: "Physics", facultyId: 999 })
      ).rejects.toBe(error);
    });
    for (const key of relatedKeys) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
      expect(client.getQueryData(key)).toEqual(org);
    }
  });
});
