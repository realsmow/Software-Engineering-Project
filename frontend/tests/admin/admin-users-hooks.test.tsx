import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminUserSummary,
  adminUserDetail,
  userLoanHistory,
  createUserOutput,
  resetPasswordOutput,
} from "../../../backend/src/admin/admin.schema";
import {
  useAdminUsers,
  useUserDetail,
  useUserLoans,
  useSetUserActive,
  useChangeRole,
  useCreateUser,
  useUpdateUser,
  useResetPassword,
} from "../../src/features/admin/users/use-admin-users";

const api = vi.hoisted(() => ({
  listUsers: { query: vi.fn() },
  getUserById: { query: vi.fn() },
  getUserLoans: { query: vi.fn() },
  setUserActive: { mutate: vi.fn() },
  changeRole: { mutate: vi.fn() },
  createUser: { mutate: vi.fn() },
  updateUser: { mutate: vi.fn() },
  resetPassword: { mutate: vi.fn() },
}));
vi.mock("../../src/lib/trpc", () => ({ useTRPCClient: () => ({ admin: api }) }));
let client: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const row = (id = 42) =>
  adminUserSummary
    .strict()
    .parse({
      id,
      studentId: `S${id}`,
      firstName: "Ada",
      lastName: "Tester",
      email: `ada${id}@ku.th`,
      role: "borrower",
      status: "active",
      creditScore: 88,
      createdAt: null,
      lastActiveAt: null,
      managementGroup: null,
    });
beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => client.clear());

describe("FR-ADM-01/02/03/04/06: account queries and mutation cache updates", () => {
  it("fetches all account pages before applying the UI adapter", async () => {
    const first = Array.from({ length: 100 }, (_, n) => row(n + 1));
    api.listUsers.query.mockImplementation(async ({ page }) => ({
      items: page === 1 ? first : [row(101)],
      total: 101,
      page,
      pageSize: 100,
    }));
    const { result } = renderHook(useAdminUsers, { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(101));
    expect(api.listUsers.query.mock.calls).toEqual([
      [{ page: 1, pageSize: 100 }],
      [{ page: 2, pageSize: 100 }],
    ]);
    expect(result.current.data?.at(-1)).toMatchObject({
      id: "101",
      name: "Ada Tester",
      auth: "ku",
      createdAt: "-",
      lastActiveAt: "-",
    });
  });

  it("keeps detail and loan history idle when no account is selected", () => {
    const detail = renderHook(() => useUserDetail(null), { wrapper });
    const loans = renderHook(() => useUserLoans(null), { wrapper });
    expect(detail.result.current.fetchStatus).toBe("idle");
    expect(loans.result.current.fetchStatus).toBe("idle");
    expect(api.getUserById.query).not.toHaveBeenCalled();
    expect(api.getUserLoans.query).not.toHaveBeenCalled();
  });

  it("loads full detail including every authority and active penalty", async () => {
    const authorities = [
      {
        manageGroupKey: 7,
        groupName: "Engineering",
        groupType: "Faculty",
        authorityName: "Staff",
        authorityLevel: 1,
      },
      {
        manageGroupKey: 8,
        groupName: "Robotics",
        groupType: "Club",
        authorityName: "Staff",
        authorityLevel: null,
      },
    ];
    const activePenalties = [
      {
        id: 3,
        usageKey: 4,
        reason: "ReturnLate",
        creditDeducted: 12,
        issuedAt: null,
        expiresAt: "2031-10-01T00:00:00.000Z",
        appealed: false,
      },
    ];
    api.getUserById.query.mockResolvedValue(
      adminUserDetail
        .strict()
        .parse({
          ...row(),
          creditTier: "D0",
          maxBorrowDays: 14,
          maxExtendTimes: 3,
          authorities,
          activePenalties,
        })
    );
    const { result } = renderHook(() => useUserDetail("42"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.getUserById.query).toHaveBeenCalledWith({ id: 42 });
    expect(result.current.data).toMatchObject({
      id: "42",
      firstName: "Ada",
      lastName: "Tester",
      creditScore: 88,
      creditTier: "D0",
      authorities,
      activePenalties,
    });
  });

  it("switches account history without showing the previous account's loans", async () => {
    const history = userLoanHistory.parse([
      {
        id: 1,
        itemName: "Meter",
        status: "Lended",
        checkoutTime: "2031-09-26T00:00:00.000Z",
        dueTime: "2031-09-27T00:00:00.000Z",
        checkInTime: null,
      },
    ]);
    api.getUserLoans.query.mockImplementation(async ({ id }) =>
      id === 42 ? history : []
    );
    const { result, rerender } = renderHook(({ id }) => useUserLoans(id), {
      initialProps: { id: "42" },
      wrapper,
    });
    await waitFor(() => expect(result.current.data).toEqual(history));
    rerender({ id: "43" });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(api.getUserLoans.query.mock.calls).toEqual([[{ id: 42 }], [{ id: 43 }]]);
  });

  it("sends deactivate and refreshes cached list, detail and history only after success", async () => {
    for (const suffix of [[], ["detail", "42"], ["loans", "42"]])
      client.setQueryData(["admin", "users", ...suffix], []);
    api.setUserActive.mutate.mockResolvedValue({ ok: true });
    const { result } = renderHook(useSetUserActive, { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "42", active: false });
    });
    expect(api.setUserActive.mutate).toHaveBeenCalledWith({ id: 42, active: false });
    for (const suffix of [[], ["detail", "42"], ["loans", "42"]])
      expect(client.getQueryState(["admin", "users", ...suffix])?.isInvalidated).toBe(
        true
      );
  });

  it("forwards a role change and invalidates account queries", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    api.changeRole.mutate.mockResolvedValue({ ok: true });
    const { result } = renderHook(useChangeRole, { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "42", role: "staff" });
    });
    expect(api.changeRole.mutate).toHaveBeenCalledWith({ id: 42, role: "staff" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "users"] });
  });

  it("forwards only edited profile fields with a numeric account ID", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    api.updateUser.mutate.mockResolvedValue({ ok: true });
    const { result } = renderHook(useUpdateUser, { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "42", firstName: "Grace" });
    });
    expect(api.updateUser.mutate).toHaveBeenCalledWith({ id: 42, firstName: "Grace" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "users"] });
  });

  it("creates an account without generating a password in the frontend", async () => {
    const input = {
      email: "new@ku.th",
      studentId: "S44",
      firstName: "New",
      lastName: "Tester",
      role: "borrower" as const,
    };
    const output = createUserOutput
      .strict()
      .parse({
        user: {
          ...row(44),
          creditTier: "D0",
          maxBorrowDays: 14,
          maxExtendTimes: 3,
          authorities: [],
          activePenalties: [],
        },
        temporaryPassword: "server-generated-value",
      });
    api.createUser.mutate.mockResolvedValue(output);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(useCreateUser, { wrapper });
    let returned;
    await act(async () => {
      returned = await result.current.mutateAsync(input);
    });
    expect(returned).toEqual(output);
    expect(api.createUser.mutate).toHaveBeenCalledWith(input);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "users"] });
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it("returns a reset password without putting it into account query caches", async () => {
    client.setQueryData(["admin", "users"], [row()]);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const output = resetPasswordOutput
      .strict()
      .parse({ ok: true, temporaryPassword: "server-reset-value" });
    api.resetPassword.mutate.mockResolvedValue(output);
    const { result } = renderHook(useResetPassword, { wrapper });
    let returned;
    await act(async () => {
      returned = await result.current.mutateAsync({ id: "42" });
    });
    expect(returned).toEqual(output);
    expect(api.resetPassword.mutate).toHaveBeenCalledWith({ id: 42 });
    expect(invalidate).not.toHaveBeenCalled();
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data)
      )
    ).not.toContain(output.temporaryPassword);
  });

  it("propagates a refused update without claiming success or invalidating cached data", async () => {
    const error = new Error("EMAIL_ALREADY_IN_USE");
    api.updateUser.mutate.mockRejectedValue(error);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(useUpdateUser, { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: "42", email: "used@ku.th" })
      ).rejects.toBe(error);
    });
    expect(invalidate).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
