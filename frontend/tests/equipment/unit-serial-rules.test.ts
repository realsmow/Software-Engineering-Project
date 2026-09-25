import { describe, expect, it } from "vitest";
import {
  canSubmitSerial,
  unitSerialRules,
} from "../../src/features/staff/inventory/unit-serial-rules";

/**
 * FR-EQP-02 "Add units" field rules: serial disabled until a tier is picked,
 * required only for T2 (T0/T1 get a generated tag), and T2 registers one at a
 * time since each T2 unit carries its own real serial.
 */
describe("unit-serial-rules", () => {
  it("disables the serial field until a tier is chosen", () => {
    expect(unitSerialRules("")).toEqual({
      serialDisabled: true,
      serialRequired: false,
      quantityLocked: false,
    });
  });

  it("leaves the serial optional and quantity unlocked for T0/T1", () => {
    expect(unitSerialRules("T0")).toEqual({
      serialDisabled: false,
      serialRequired: false,
      quantityLocked: false,
    });
    expect(unitSerialRules("T1")).toEqual({
      serialDisabled: false,
      serialRequired: false,
      quantityLocked: false,
    });
  });

  it("requires the serial and locks quantity to one for T2", () => {
    expect(unitSerialRules("T2")).toEqual({
      serialDisabled: false,
      serialRequired: true,
      quantityLocked: true,
    });
  });

  it("blocks submission of a T2 unit with no serial, but allows T0/T1 either way", () => {
    expect(canSubmitSerial(unitSerialRules("T2"), "")).toBe(false);
    expect(canSubmitSerial(unitSerialRules("T2"), "  ")).toBe(false);
    expect(canSubmitSerial(unitSerialRules("T2"), "SN-001")).toBe(true);
    expect(canSubmitSerial(unitSerialRules("T0"), "")).toBe(true);
    expect(canSubmitSerial(unitSerialRules("T1"), "")).toBe(true);
  });
});
