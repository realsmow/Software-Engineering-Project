import { describe, expect, it } from "vitest";
import { requestTimes } from "../../src/features/borrower/request/use-request-times";

describe("#224: request times follow the admin's work hours", () => {
  it("keeps the usual choices for 08:00-17:00", () => {
    expect(requestTimes({ start: 8, end: 17 })).toEqual(["08:00", "13:00", "16:00", "17:00"]);
  });

  it("never offers a time outside a shorter day", () => {
    expect(requestTimes({ start: 9, end: 12 })).toEqual(["09:00", "11:00", "12:00"]);
  });

  it("drops duplicates when the day is short", () => {
    expect(requestTimes({ start: 13, end: 14 })).toEqual(["13:00", "14:00"]);
  });
});
