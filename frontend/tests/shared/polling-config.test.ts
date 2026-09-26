import { describe, expect, it } from "vitest";
import { POLLING } from "../../src/constants";

describe("shared polling intervals", () => {
  it("uses the 30-second polling interval for the staff queue", () => {
    expect(POLLING.STAFF_QUEUE).toBe(30_000);
  });

  it("uses the 15-second polling interval for equipment availability", () => {
    expect(POLLING.AVAILABILITY).toBe(15_000);
  });
});
