import { afterEach, describe, expect, it } from "vitest";
import { useRequestDraft } from "../../src/features/borrower/request/request-draft.store";

// TC-03: the cart used to vanish on reload.
describe("request draft survives a reload", () => {
  afterEach(() => {
    useRequestDraft.getState().clear();
    sessionStorage.clear();
  });

  it("keeps the lines in sessionStorage and restores them", async () => {
    useRequestDraft.getState().addItem("item-7", 3);
    useRequestDraft.getState().addItem("item-7", 3);

    const saved = JSON.parse(sessionStorage.getItem("ulms-request-draft") ?? "{}");
    expect(saved.state).toEqual({ lines: [{ itemId: "item-7", qty: 2, serials: [] }] });

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
    const saved = JSON.parse(sessionStorage.getItem("ulms-request-draft") ?? "{}");
    expect(saved.state).not.toHaveProperty("startDate");
  });
});
