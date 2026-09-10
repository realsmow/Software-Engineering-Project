import type { CreditTier, ResourceTier } from '../schemas/status.schema';

/**
 * Who has to say yes before a request becomes a loan.
 *
 *   auto       - nobody. The system clears it the moment it is opened.
 *   staff      - the department's counter staff.
 *   supervisor - an academic (อาจารย์).
 */
export type ApprovalRoute = 'auto' | 'staff' | 'supervisor';

/**
 * The two inputs that decide the route, in one place.
 *
 * Both `loan.create` (which applies the route the moment a request is opened)
 * and `approval.decide` (which refuses a decision from someone below the
 * route) read it from here. Two copies of this table is how a T2 request ends
 * up auto-approved on one screen and queued on the other.
 */
export interface ApprovalContext {
  /** The unit's tier, from BorrowRule.RuleName. Null = not configured. */
  tier: ResourceTier | null;
  /** The borrower's credit band, from CreditTier.CreditTierName. */
  creditTier: CreditTier;
}

/**
 * Credit bands that may not open a request at all.
 *
 * ── Why this exists even though CONTRACT.md says it should not ────────────
 * CONTRACT.md ส่วนที่ 1 states outright: "ไม่มีรหัส 'เครดิตต่ำจนยืมไม่ได้'
 * เพราะกฎแบบนั้นไม่มีในระบบ" - credit only shortens the borrow window.
 *
 * The frontend was built the other way. `CREDIT_BAND_POLICY` in
 * frontend/src/constants/index.ts marks D3 `blocked: true`, with the comment
 * "D3 cannot open a new request until outstanding items are cleared", and the
 * request screen is written around that.
 *
 * The team settled it in favour of the frontend, so the rule lives here and
 * the contract table has been corrected. If it is ever reversed, this constant
 * and `BLOCKED_CREDIT_TIERS` are the only two places to change.
 */
export const BLOCKED_CREDIT_TIERS: readonly CreditTier[] = ['D3'];

/**
 * Bands that lose the right to auto-approval.
 *
 * `CREDIT_BAND_POLICY` again: D2 and D3 carry `needsSupervisor: true`, meaning
 * "must get supervisor sign-off on T1 items too, not just the usual T2 ones".
 */
const NEEDS_SUPERVISOR_CREDIT_TIERS: readonly CreditTier[] = ['D2', 'D3'];

/** True when this band may not open a request at all. */
export function isBlockedByCredit(creditTier: CreditTier): boolean {
  return BLOCKED_CREDIT_TIERS.includes(creditTier);
}

/**
 * The route a request takes.
 *
 * Tier first, then credit. A T2 item is a supervisor's call whatever the
 * borrower's record looks like, and a shaky record pulls a T1 item up to the
 * same desk rather than pushing a T2 one down.
 *
 * T3 (rooms - "ของติดที่" in TIER_CONFIG) goes to staff rather than a
 * supervisor: what makes it T3 is that it cannot be carried away, not that it
 * is valuable - TIER_CONFIG gives it creditWeight 0 and priceMax 0. The
 * department that owns the room decides who sits in it.
 * TODO: no document states this. Confirm with the team; it is a one-line
 * change here if rooms should need an academic's signature.
 */
export function routeFor({ tier, creditTier }: ApprovalContext): ApprovalRoute {
  if (tier === 'T2') return 'supervisor';
  if (tier === 'T3') return 'staff';

  // T0 and T1. A borrower whose credit has slipped loses the automatic yes.
  if (NEEDS_SUPERVISOR_CREDIT_TIERS.includes(creditTier)) return 'supervisor';
  return 'auto';
}

/** Whether a caller holding `role` may decide a request routed to `route`. */
export function canDecide(
  route: ApprovalRoute,
  role: 'staff' | 'supervisor' | 'admin',
): boolean {
  if (role === 'admin') return true;
  if (route === 'supervisor') return role === 'supervisor';
  // Staff-routed requests: a supervisor standing at the counter can clear one
  // too. The rule is a floor, not a job description.
  return role === 'staff' || role === 'supervisor';
}
