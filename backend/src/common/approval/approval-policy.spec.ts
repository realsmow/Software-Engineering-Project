import { routeFor } from './approval-policy';

describe('Module 6 approval policy', () => {
  it.each([
    ['T0', 'D0', 'auto'],
    ['T0', 'D1', 'auto'],
    ['T0', 'D2', 'auto'],
    ['T0', 'D3', 'auto'],
    ['T1', 'D0', 'auto'],
    ['T1', 'D1', 'auto'],
    ['T1', 'D2', 'supervisor'],
    ['T1', 'D3', 'supervisor'],
    ['T2', 'D0', 'supervisor'],
    ['T2', 'D1', 'supervisor'],
    ['T2', 'D2', 'supervisor'],
    ['T2', 'D3', 'supervisor'],
    ['T3', 'D0', 'auto'],
    ['T3', 'D1', 'auto'],
    ['T3', 'D2', 'auto'],
    ['T3', 'D3', 'auto'],
  ])('routes %s/%s to %s', (tier, creditTier, expected) => {
    expect(
      routeFor({ tier: tier as never, creditTier: creditTier as never }),
    ).toBe(expected);
  });
});
