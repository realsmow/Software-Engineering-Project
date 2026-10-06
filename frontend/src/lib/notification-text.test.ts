import i18n from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { notificationText } from "./notification-text";

describe("notificationText", () => {
  const original = i18n.language;
  afterEach(() => {
    i18n.language = original;
  });
  const n = { title: "ไทย", body: "เนื้อหา", titleEn: "English", bodyEn: "Body" };

  it("uses English when the language is English and the text exists", () => {
    i18n.language = "en";
    expect(notificationText(n)).toEqual({ title: "English", body: "Body" });
  });

  it("falls back to Thai for old rows or Thai mode", () => {
    i18n.language = "en";
    expect(notificationText({ title: "ไทย", body: "เนื้อหา" })).toEqual({ title: "ไทย", body: "เนื้อหา" });
    i18n.language = "th";
    expect(notificationText(n)).toEqual({ title: "ไทย", body: "เนื้อหา" });
  });
});
