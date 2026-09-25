import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getErrorMessage } from "@/lib/error-messages";

const globalsCss = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("Module 12.3 — Usability & UI Standards", () => {
  it("12.3.1 maps business error codes to Thai user-facing messages", () => {
    expect(getErrorMessage("INVALID_CREDENTIALS")).toBe("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    expect(getErrorMessage("NOT_AUTHENTICATED")).toBe("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
    expect(getErrorMessage("ITEM_UNAVAILABLE")).toBe("อุปกรณ์ชิ้นนี้ถูกยืมไปแล้ว กรุณาเลือกใหม่");
    expect(getErrorMessage("UNKNOWN_CODE")).toBe("เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
  });

  it("12.3.2 configures Sarabun as the primary UI font", () => {
    expect(globalsCss).toContain('"Sarabun"');
    expect(globalsCss).toMatch(/--font-ui:\s*"Sarabun"/);
    expect(globalsCss).toMatch(/font-family:\s*var\(--font-ui\)/);
  });

  it("12.3.3 defines responsive behavior for mobile and desktop breakpoints", () => {
    expect(globalsCss).toMatch(/@media\s*\([^)]*max-width:\s*\d+px/);
    expect(globalsCss).toMatch(/@media\s*\([^)]*min-width:\s*\d+px/);
    expect(globalsCss).toMatch(/375px/);
    expect(globalsCss).toMatch(/1280px/);
  });
});
