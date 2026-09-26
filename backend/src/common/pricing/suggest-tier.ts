import type { ResourceTier } from '../schemas/status.schema';

/**
 * Advisory tier from a baht price (FR-EQP-01), using the bands the proposal
 * gives each tier (docs/sections/05_scope.tex §5.4, TIER_CONFIG in
 * frontend/src/constants/index.ts):
 *
 *   T0 "ยืมง่าย"  - below 100 baht
 *   T1 "ยืมได้"   - up to 1,000 baht
 *   T2 "ยืมยาก"   - over 1,000 baht
 *   T3 "ของติดที่" - rooms, which have no price and are never suggested here
 *
 * Advisory only: staff still pick the tier by hand on each unit
 * (item.createUnit/updateUnit). This never runs automatically against a
 * BorrowRule - it only rides beside `price` in the managed item output as a
 * hint for the form.
 */
export function suggestTierFromPrice(
  price: number | null | undefined,
): ResourceTier | null {
  if (price === null || price === undefined) return null;
  if (price < 100) return 'T0';
  if (price <= 1000) return 'T1';
  return 'T2';
}
