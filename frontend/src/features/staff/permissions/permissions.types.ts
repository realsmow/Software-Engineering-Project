/**
 * Server shapes for equipment eligibility, mirroring the "Eligibility ---
 * reference data for the forms" block in backend/src/item/item.schema.ts.
 *
 * Eligibility keys on ResourceKey, so a rule really belongs to a unit rather
 * than a type - `item.setEligibility` fans a rule out across every unit of the
 * type in one transaction, which is what staff mean when they say "third
 * years may borrow the Arduinos".
 */

/**
 * What a rule set belongs to: an item type (fanned out across its units) or
 * one room (RoomInfo.RoomKey). The server refuses a call naming both.
 */
export type EligibilityTarget = { itemKey: number } | { roomKey: number };

/** One "this group, in this role, may borrow this type" rule. */
export interface EligibilityRule {
  groupKey: number;
  groupName: string | null;
  authorityRoleKey: number;
  authorityRoleName: string;
  /** How many of the type's units carry this rule - should equal totalUnits. Always 1 for a room. */
  appliesToUnits: number;
}

/** The department or club a rule can be granted to (ResourceInfo.ManagedBy). */
export interface EligibilityGroupOption {
  id: number;
  name: string | null;
  type: "Club" | "Faculty";
}

/** AuthorityRole rows, for the eligibility editor. */
export interface AuthorityRoleOption {
  authorityRoleKey: number;
  name: string;
  level: number | null;
}
