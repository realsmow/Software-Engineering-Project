import { extensionRouteFor, requiresInspection } from './extension-policy';
import type { CreditTier, ResourceTier } from '../schemas/status.schema';

/**
 * The extension routing table, tested directly — same reasoning as
 * approval-policy.spec.ts: every wrong answer here is still a legal
 * `ExtensionRoute`, so only a test can tell a mistake from a decision.
 */

const ALL_TIERS: ResourceTier[] = ['T0', 'T1', 'T2', 'T3'];
const ALL_BANDS: CreditTier[] = ['D0', 'D1', 'D2', 'D3'];

describe('extensionRouteFor', () => {
  it('keeps every T2 extension with the supervisor, whatever else is true', () => {
    for (const creditTier of ALL_BANDS) {
      for (const extendNo of [1, 2, 3]) {
        expect(extensionRouteFor({ tier: 'T2', creditTier, extendNo })).toBe(
          'supervisor',
        );
      }
    }
  });

  it('alternates T1 between online and a look at the counter (§5.4)', () => {
    const route = (extendNo: number) =>
      extensionRouteFor({ tier: 'T1', creditTier: 'D0', extendNo });

    expect(route(1)).toBe('auto');
    expect(route(2)).toBe('staff');
    expect(route(3)).toBe('auto');
    expect(route(4)).toBe('staff');
  });

  it('never asks anyone to look at a T0 item', () => {
    for (const extendNo of [1, 2, 3, 4]) {
      expect(
        extensionRouteFor({ tier: 'T0', creditTier: 'D0', extendNo }),
      ).toBe('auto');
    }
  });

  it('takes the online option away from a shaky record (§5.7)', () => {
    for (const tier of ALL_TIERS) {
      for (const creditTier of ['D2', 'D3'] as const) {
        expect(extensionRouteFor({ tier, creditTier, extendNo: 1 })).not.toBe(
          'auto',
        );
      }
    }
  });

  it('sends a room to the department rather than clearing it silently', () => {
    // Nobody can carry a room to the counter, but holding one longer takes the
    // next booking's slot, so a person decides.
    expect(
      extensionRouteFor({ tier: 'T3', creditTier: 'D0', extendNo: 1 }),
    ).toBe('staff');
  });

  it('refuses to auto-approve a tier it could not read', () => {
    // A seeding gap must cost a trip to the counter, not a free extension.
    expect(
      extensionRouteFor({ tier: null, creditTier: 'D0', extendNo: 1 }),
    ).toBe('staff');
  });
});

describe('requiresInspection', () => {
  it('is exactly "somebody has to look at it"', () => {
    expect(requiresInspection('auto')).toBe(false);
    expect(requiresInspection('staff')).toBe(true);
    expect(requiresInspection('supervisor')).toBe(true);
  });
});
