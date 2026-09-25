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
 * Credit bands that may not extend a loan (proposal §5.7: D3 "ต้องส่งคำขอยืมใหม่").
 *
 * They may still open requests: FR-REQ-05 sends a D2/D3 T1 request to a
 * supervisor rather than refusing it.
 */
export const BLOCKED_CREDIT_TIERS: readonly CreditTier[] = ['D3'];

/**
 * Bands that lose the right to auto-approval.
 *
 * `CREDIT_BAND_POLICY` again: D2 and D3 carry `needsSupervisor: true`, meaning
 * "must get supervisor sign-off on T1 items too, not just the usual T2 ones".
 */
const NEEDS_SUPERVISOR_CREDIT_TIERS: readonly CreditTier[] = ['D2', 'D3'];

/** True when this band may not extend a loan. */
export function isBlockedByCredit(creditTier: CreditTier): boolean {
  return BLOCKED_CREDIT_TIERS.includes(creditTier);
}

/**
 * The route a request takes.
 *
 * FR-REQ-04..06: T2 always goes to a supervisor, T1 goes there too when the
 * borrower's record has slipped to D2 or D3, and T0 is approved on the spot
 * whatever the record.
 *
 * T3 (rooms) is approved on the spot. The server already enforces what a
 * person would check: the slot grid, the 3-hour cap, same-day only and one
 * booking at a time (room-slots.ts, loan.request.service.ts).
 */
export function routeFor({ tier, creditTier }: ApprovalContext): ApprovalRoute {
  // A seeding gap must cost a person's look, not an automatic yes.
  if (tier === null) return 'staff';
  if (tier === 'T2') return 'supervisor';
  if (tier === 'T1' && NEEDS_SUPERVISOR_CREDIT_TIERS.includes(creditTier)) {
    return 'supervisor';
  }
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
