/**
 * Server shapes for the lending rules, mirroring the `lendingSettings*` block
 * in backend/src/admin/admin.schema.ts.
 *
 * This screen edits the table the rest of the system reads: a borrow rule (a
 * tier, T0-T3) crossed with a credit band (D0-D3) gives the borrow window and
 * the extension allowance. It is the same row `credit.me` resolves to answer
 * "how long may I keep this", so a change here is visible on every borrower's
 * request screen.
 */

/** Mirrors the PenaltyReason enum in schema.prisma. */
export type PenaltyReason =
  | "DamagedItem"
  | "BrokenItem"
  | "LostItem"
  | "DidntReturn"
  | "ReturnLate";

export const PENALTY_REASONS: PenaltyReason[] = [
  "DamagedItem",
  "BrokenItem",
  "LostItem",
  "DidntReturn",
  "ReturnLate",
];

export interface CreditTierSetting {
  id: number;
  name: string | null;
  min: number;
  max: number;
}

export interface BorrowConstraintSetting {
  creditTierKey: number;
  creditTierName: string | null;
  minimumAuthorityLevel: number | null;
  maxBorrowDays: number;
  maxExtendTimes: number;
}

export interface PenaltyRuleSetting {
  reason: PenaltyReason;
  /** Credit points deducted. */
  amount: number;
  /** How long the penalty stays in effect, in days. */
  lengthDays: number;
}

export interface BorrowRuleSetting {
  id: number;
  /** T0-T3 for a configured tier; anything else is a rule outside the four. */
  name: string | null;
  constraints: BorrowConstraintSetting[];
  penalties: PenaltyRuleSetting[];
}

export interface LendingSettings {
  creditTiers: CreditTierSetting[];
  borrowRules: BorrowRuleSetting[];
}

/**
 * One rule's worth of edits.
 *
 * Rows listed are upserted and rows left out are untouched, so the page sends
 * only the rule the user was working on rather than the whole table.
 */
export interface UpdateLendingSettingsInput {
  borrowRuleKey: number;
  constraints?: {
    creditTierKey: number;
    maxBorrowDays: number;
    maxExtendTimes: number;
    minimumAuthorityLevel?: number | null;
  }[];
  penalties?: {
    reason: PenaltyReason;
    amount: number;
    lengthDays: number;
  }[];
}
