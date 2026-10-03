import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useRequestDraft,
  type DraftLine,
} from "../../src/features/borrower/request/request-draft.store";
import { toClientUser } from "../../src/features/auth/user.adapter";
import { userResponse } from "../fixtures/api-responses";

// TC-03: the cart used to vanish on reload.
describe("request draft survives a reload", () => {
  beforeEach(() => {
    useRequestDraft.getState().clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    useRequestDraft.getState().clear();
    sessionStorage.clear();
  });

  it("keeps the lines in sessionStorage and restores them", async () => {
    useRequestDraft.getState().addItem("item-7", 3);
    useRequestDraft.getState().addItem("item-7", 3);

    const saved = JSON.parse(sessionStorage.getItem("ulms-request-draft") ?? "{}");
    expect(saved.state).toEqual({
      lines: [{ itemId: "item-7", qty: 2, serials: [] }],
      owner: null,
    });

    // What a reload does: memory is gone, storage is read back. Clearing
    // memory also writes storage, so put the saved copy back first.
    const raw = sessionStorage.getItem("ulms-request-draft")!;
    useRequestDraft.setState({ lines: [] });
    sessionStorage.setItem("ulms-request-draft", raw);
    await useRequestDraft.persist.rehydrate();
    expect(useRequestDraft.getState().lines).toEqual([
      { itemId: "item-7", qty: 2, serials: [] },
    ]);
  });

  it("does not keep dates, which may be in the past by the next visit", () => {
    useRequestDraft.getState().setStartDate("2020-01-01");
    useRequestDraft.getState().setEndDate("2020-01-02");
    useRequestDraft.getState().setPickupTime("13:00");
    useRequestDraft.getState().setReturnTime("08:00");
    const saved = JSON.parse(sessionStorage.getItem("ulms-request-draft") ?? "{}");
    expect(saved.state).toEqual({ lines: [], owner: null });
  });

  async function reloadDraft() {
    // A new module instance models loss of in-memory state on page reload.
    vi.resetModules();
    const { useRequestDraft: restored } =
      await import("../../src/features/borrower/request/request-draft.store");
    await restored.persist.rehydrate();
    return restored;
  }

  it("restores the T2 serial selection as well as quantity", async () => {
    useRequestDraft.getState().addItem("t2-camera", 2);
    useRequestDraft.getState().setQty("t2-camera", 2, 2);
    useRequestDraft.getState().toggleSerial("t2-camera", "CAM-001");
    useRequestDraft.getState().toggleSerial("t2-camera", "CAM-002");
    const restored = await reloadDraft();
    expect(restored.getState().lines).toEqual([
      { itemId: "t2-camera", qty: 2, serials: ["CAM-001", "CAM-002"] },
    ]);
  });

  it("restores only the remaining basket after partial acceptance", async () => {
    useRequestDraft.getState().addItem("accepted-item", 1);
    useRequestDraft.getState().addItem("refused-item", 1);
    useRequestDraft
      .getState()
      .replaceLines([{ itemId: "refused-item", qty: 1, serials: [] }]);
    expect((await reloadDraft()).getState().lines).toEqual([
      { itemId: "refused-item", qty: 1, serials: [] },
    ]);
  });

  it.each(["remove", "clear"] as const)(
    "does not resurrect an item after %s and reload",
    async (action) => {
      useRequestDraft.getState().addItem("removed-item", 1);
      if (action === "remove") useRequestDraft.getState().removeItem("removed-item");
      else useRequestDraft.getState().clear();
      expect((await reloadDraft()).getState().lines).toEqual([]);
    }
  );

  it("explicit logout prevents the next account from inheriting the basket", async () => {
    const draft = await reloadDraft();
    const { useAuthStore: auth } = await import("../../src/features/auth/auth.store");
    auth.getState().setUser(toClientUser(userResponse({ id: 101 })));
    draft.getState().addItem("private-selection", 1);
    expect(draft.getState().lines).toHaveLength(1);
    auth.getState().logout();
    const restored = await reloadDraft();
    const { useAuthStore: nextAuth } = await import("../../src/features/auth/auth.store");
    nextAuth.getState().setUser(toClientUser(userResponse({ id: 202 })));
    expect(restored.getState().lines).toEqual([]);
  });

  describe("account isolation after reload and expired session", () => {
    let inheritedLines: DraftLine[];
    beforeEach(async () => {
      const draft = await reloadDraft();
      const { useAuthStore: auth } = await import("../../src/features/auth/auth.store");
      auth.getState().setUser(toClientUser(userResponse({ id: 101 })));
      draft.getState().addItem("account-a-camera", 1);
      draft.getState().toggleSerial("account-a-camera", "PRIVATE-CAM-001");
      const restored = await reloadDraft();
      expect(restored.getState().lines).toEqual([
        { itemId: "account-a-camera", qty: 1, serials: ["PRIVATE-CAM-001"] },
      ]);
      const { useAuthStore: nextAuth } =
        await import("../../src/features/auth/auth.store");
      // auth.me failure in App calls setUser(null); login calls setUser(newUser).
      nextAuth.getState().setUser(null);
      expect(nextAuth.getState().user).toBeNull();
      const nextUser = toClientUser(userResponse({ id: 202 }));
      nextAuth.getState().setUser(nextUser);
      expect(nextAuth.getState().user).toEqual(nextUser);
      inheritedLines = restored.getState().lines;
    });
    it("does not show account A's restored selection to account B", () => {
      expect(inheritedLines).toEqual([]);
    });
  });
});
