import { suggestTierFromPrice } from './suggest-tier';

/**
 * The bands from docs/sections/05_scope.tex §5.4: T0 below 100 baht, T1 up to
 * and including 1,000, T2 above that. T3 is never suggested - rooms have no
 * price at all.
 */
describe('suggestTierFromPrice', () => {
  it('is null with no price', () => {
    expect(suggestTierFromPrice(null)).toBeNull();
    expect(suggestTierFromPrice(undefined)).toBeNull();
  });

  it('suggests T0 under 100 baht', () => {
    expect(suggestTierFromPrice(0)).toBe('T0');
    expect(suggestTierFromPrice(99.99)).toBe('T0');
  });

  it('suggests T1 from 100 up to and including 1000', () => {
    expect(suggestTierFromPrice(100)).toBe('T1');
    expect(suggestTierFromPrice(500)).toBe('T1');
    expect(suggestTierFromPrice(1000)).toBe('T1');
  });

  it('suggests T2 above 1000', () => {
    expect(suggestTierFromPrice(1000.01)).toBe('T2');
    expect(suggestTierFromPrice(50000)).toBe('T2');
  });

  it('never suggests T3 - rooms have no price', () => {
    for (const price of [0, 50, 100, 1000, 100000]) {
      expect(suggestTierFromPrice(price)).not.toBe('T3');
    }
  });
});
