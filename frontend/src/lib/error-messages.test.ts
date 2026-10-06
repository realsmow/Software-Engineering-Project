import i18n from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { getErrorMessage } from "./error-messages";

describe("getErrorMessage language", () => {
  const original = i18n.language;
  afterEach(() => {
    i18n.language = original;
  });

  it("returns Thai by default and English in English mode", () => {
    i18n.language = "th";
    expect(getErrorMessage("SLOT_UNAVAILABLE")).toBe("ช่วงเวลานี้ไม่ว่างแล้ว");
    i18n.language = "en";
    expect(getErrorMessage("SLOT_UNAVAILABLE")).toBe("This time slot is no longer available.");
  });
});
