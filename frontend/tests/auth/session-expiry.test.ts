import { afterEach, describe, expect, it, vi } from "vitest";
import { createUlmsTrpcClient } from "../../src/lib/trpc";
import { useAuthStore } from "../../src/features/auth/auth.store";

// #138: a 401 while signed in must end the signed-in UI without a reload.
describe("tRPC client on a 401", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({ user: null });
  });

  function stub401() {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                error: {
                  message: "x",
                  code: -32001,
                  data: { code: "UNAUTHORIZED", httpStatus: 401 },
                },
              },
            ]),
            { status: 401, headers: { "content-type": "application/json" } }
          )
      )
    );
  }

  it("clears the signed-in user", async () => {
    stub401();
    useAuthStore.setState({ user: { id: "7" } as never, isLoading: false });
    await createUlmsTrpcClient()
      .item.list.query({ page: 1, pageSize: 1 } as never)
      .catch(() => undefined);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("does nothing when nobody is signed in", async () => {
    stub401();
    const setUser = vi.spyOn(useAuthStore.getState(), "setUser");
    await createUlmsTrpcClient()
      .item.list.query({ page: 1, pageSize: 1 } as never)
      .catch(() => undefined);
    expect(setUser).not.toHaveBeenCalled();
  });
});
