import {
  BLOCKED_CREDIT_TIERS,
  canDecide,
  isBlockedByCredit,
  routeFor,
} from './approval-policy';
import type { CreditTier, ResourceTier } from '../schemas/status.schema';

/**
 * The routing table, tested directly.
 *
 * Worth its own suite because nothing else can catch a mistake here: every
 * value is a legal ApprovalRoute, so a wrong one type-checks, passes review,
 * and shows up as a T2 oscilloscope handed over without a supervisor.
 */

const ALL_TIERS: ResourceTier[] = ['T0', 'T1', 'T2', 'T3'];
const ALL_BANDS: CreditTier[] = ['D0', 'D1', 'D2', 'D3'];

describe('isBlockedByCredit', () => {
  it('blocks D3 and nobody else', () => {
    // frontend CREDIT_BAND_POLICY: only D3 carries `blocked: true`.
    expect(ALL_BANDS.filter(isBlockedByCredit)).toEqual(['D3']);
  });

  it('agrees with the exported list, so the two cannot drift', () => {
    for (const band of BLOCKED_CREDIT_TIERS) {
      expect(isBlockedByCredit(band)).toBe(true);
    }
  });
});

describe('routeFor', () => {
  it('sends every T2 request to a supervisor, whatever the credit band', () => {
    for (const creditTier of ALL_BANDS) {
      expect(routeFor({ tier: 'T2', creditTier })).toBe('supervisor');
    }
  });

  it('sends rooms to the department, not to an academic', () => {
    // T3 is "ของติดที่" - fixed in place, creditWeight 0 - so it is the owning
    // department's call, not a value judgement. See the TODO in the source.
    expect(routeFor({ tier: 'T3', creditTier: 'D0' })).toBe('staff');
  });

  it('clears T0 and T1 automatically for a healthy record', () => {
    for (const tier of ['T0', 'T1'] as const) {
      expect(routeFor({ tier, creditTier: 'D0' })).toBe('auto');
      expect(routeFor({ tier, creditTier: 'D1' })).toBe('auto');
    }
  });

  it('pulls a shaky record up to a supervisor even on easy items', () => {
    // "D2/D3 must get supervisor sign-off on T1 items too, not just the usual
    // T2 ones" - frontend/src/constants/index.ts.
    expect(routeFor({ tier: 'T1', creditTier: 'D2' })).toBe('supervisor');
    expect(routeFor({ tier: 'T0', creditTier: 'D2' })).toBe('supervisor');
  });

  it('never auto-approves anything for a band that cannot borrow at all', () => {
    // D3 is refused before it reaches routing, but if the two rules ever
    // disagree the safe direction is "somebody looks at it".
    for (const tier of ALL_TIERS) {
      expect(routeFor({ tier, creditTier: 'D3' })).not.toBe('auto');
    }
  });

  it('treats an unconfigured tier as an ordinary item rather than throwing', () => {
    // A null tier is refused earlier with TIER_NOT_CONFIGURED; a list that
    // renders the queue must not crash on one that slipped through.
    expect(routeFor({ tier: null, creditTier: 'D0' })).toBe('auto');
    expect(routeFor({ tier: null, creditTier: 'D2' })).toBe('supervisor');
  });
});

describe('canDecide', () => {
  it('lets a supervisor clear both desks', () => {
    expect(canDecide('supervisor', 'supervisor')).toBe(true);
    expect(canDecide('staff', 'supervisor')).toBe(true);
  });

  it('stops staff at the supervisor desk', () => {
    expect(canDecide('staff', 'staff')).toBe(true);
    expect(canDecide('supervisor', 'staff')).toBe(false);
  });

  it('lets an admin decide anything', () => {
    expect(canDecide('supervisor', 'admin')).toBe(true);
  });

  it('does not itself guard auto-approved requests', () => {
    // 'auto' never reaches canDecide: such a request is already Approved, and
    // ApprovalService.decide refuses it with ALREADY_AUTO_APPROVED before
    // asking who may decide. Asserted so nobody moves that guard in here and
    // assumes this function is doing it.
    expect(canDecide('auto', 'staff')).toBe(true);
  });
});
