import { describe, expect, it } from "vitest";
import { openDatesFor } from "../../src/lib/closed-days";

// 0946c26: the admin opens a weekend or holiday for every department, or only
// for chosen ones. A screen that knows which departments it deals with should
// treat the day as open only when all of them are.
describe("openDatesFor (extra open days per department)", () => {
  const days = [
    { date: "2031-10-04", groupKeys: [] },
    { date: "2031-10-05", groupKeys: [3] },
    { date: "2031-10-11", groupKeys: [3, 4] },
  ];

  it("keeps a day opened for every department", () => {
    expect(openDatesFor(days, [9]).has("2031-10-04")).toBe(true);
  });

  it("keeps a day only for the departments it was opened for", () => {
    expect(openDatesFor(days, [3]).has("2031-10-05")).toBe(true);
    expect(openDatesFor(days, [4]).has("2031-10-05")).toBe(false);
  });

  it("needs every department of a mixed cart to be open", () => {
    expect(openDatesFor(days, [3, 4]).has("2031-10-05")).toBe(false);
    expect(openDatesFor(days, [3, 4]).has("2031-10-11")).toBe(true);
  });

  it("falls back to any opened day when no department is known", () => {
    expect([...openDatesFor(days, [])].sort()).toEqual(["2031-10-04", "2031-10-05", "2031-10-11"]);
  });

  it("is empty before the list arrives", () => {
    expect(openDatesFor(undefined, [3]).size).toBe(0);
  });
});
