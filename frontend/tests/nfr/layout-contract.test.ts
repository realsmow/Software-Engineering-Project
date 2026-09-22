import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalStyles = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("frontend layout and typography contracts", () => {
  it("defines one shared Thai-capable UI font token", () => {
    expect(globalStyles).toMatch(/--font-ui:\s*["']?(Prompt|Sarabun)/);
    expect(globalStyles).toContain("font-family: var(--font-ui)");
  });

  it("contains responsive layout rules for compact and wider screens", () => {
    expect(globalStyles).toContain("@media (max-width: 900px)");
    expect(globalStyles).toContain("@media (max-width: 1080px)");
  });
});
