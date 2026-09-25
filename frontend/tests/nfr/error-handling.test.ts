import { describe, expect, it } from "vitest";
import { ApiClientError } from "../../src/lib/api-client";
import {
  extractErrorCode,
  getErrorMessage,
  getErrorPayload,
} from "../../src/lib/error-messages";

describe("frontend error handling and localization boundary", () => {
  it("maps an API business error to a user-facing message without exposing internals", () => {
    const error = new ApiClientError(409, {
      code: "NOT_IMPLEMENTED",
      message: "internal table is missing",
      details: { missing: ["DailyStats"] },
    });

    expect(extractErrorCode(error)).toBe("NOT_IMPLEMENTED");
    expect(getErrorPayload(error)).toEqual({ missing: ["DailyStats"] });
    expect(getErrorMessage(error)).not.toContain("internal table is missing");
    expect(getErrorMessage(error)).not.toContain("at ");
  });

  it("returns Thai dictionary text for a known business error", () => {
    expect(getErrorMessage({ data: { code: "NOT_IMPLEMENTED" } })).toMatch(
      /[\u0e00-\u0e7f]/
    );
  });

  it("supports tRPC businessCode, code, and shape.data error envelopes", () => {
    expect(extractErrorCode({ data: { businessCode: "ROOM_NOT_FOUND" } })).toBe(
      "ROOM_NOT_FOUND"
    );
    expect(extractErrorCode({ data: { code: "NOT_IMPLEMENTED" } })).toBe(
      "NOT_IMPLEMENTED"
    );
    expect(extractErrorCode({ shape: { data: { code: "AUDIT_EVENT_NOT_FOUND" } } })).toBe(
      "AUDIT_EVENT_NOT_FOUND"
    );
    expect(getErrorPayload({ data: { cause: { roomId: 4 } } })).toEqual({ roomId: 4 });
  });

  it("falls back safely for unknown errors and never renders a raw stack", () => {
    const knownRuntimeError = new Error("database unavailable");

    expect(getErrorMessage(knownRuntimeError)).toBe("database unavailable");
    expect(getErrorMessage(knownRuntimeError)).not.toContain("\n");
    expect(getErrorMessage({ unexpected: true })).toBeTruthy();
  });
});
