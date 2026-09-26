import type { Tier } from "@/types/domain";

/**
 * Field rules for the "Add units" form (FR-EQP-02).
 *
 * Lifted from a teammate's draft (commit 14ae029,
 * frontend/src/features/staff/For_ItemManagement, commented out): the serial
 * field is disabled until a tier is picked, required only for T2 (T0/T1 get a
 * numbered tag generated for them), and T2 registers one unit at a time since
 * each T2 unit carries its own real serial rather than a suffixed tag.
 */
export interface UnitSerialRules {
  serialDisabled: boolean;
  serialRequired: boolean;
  quantityLocked: boolean;
}

export function unitSerialRules(tier: Tier | ""): UnitSerialRules {
  const isT2 = tier === "T2";
  return {
    serialDisabled: tier === "",
    serialRequired: isT2,
    quantityLocked: isT2,
  };
}

/** Whether the form may be submitted, given the current serial text. */
export function canSubmitSerial(rules: UnitSerialRules, serialNo: string): boolean {
  return !rules.serialRequired || serialNo.trim() !== "";
}
