import { describe, expect, it } from "vitest";
import { onDay } from "../../src/features/borrower/loans/use-extensions";

describe("extension day picker", () => {
  it("moves the server's latest due time back to the picked Bangkok day, same clock time", () => {
    // 14 Nov 17:00 Bangkok is the furthest allowed.
    const max = "2026-11-14T10:00:00.000Z";
    expect(onDay(max, "2026-11-14")).toBe(max);
    expect(onDay(max, "2026-11-09")).toBe("2026-11-09T10:00:00.000Z");
  });

  it("keeps the Bangkok day when the instant is the previous UTC day", () => {
    // 10 Nov 06:00 Bangkok is 9 Nov 23:00 UTC.
    expect(onDay("2026-11-09T23:00:00.000Z", "2026-11-08")).toBe("2026-11-07T23:00:00.000Z");
  });
});
