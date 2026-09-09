import type { CreditTier, ResourceTier } from '../schemas/status.schema';

/**
 * Who has to say yes before a borrowed thing may be kept longer.
 *
 *   auto       - nobody. The system moves the due date the moment it is asked.
 *   staff      - the borrower brings the item to the counter and staff look at
 *                it before agreeing (§5.9 "ต่ออายุแบบตรวจสภาพ").
 *   supervisor - an academic (อาจารย์), same desk that clears T2 requests.
 *
 * Deliberately the same three words as `ApprovalRoute` in approval-policy.ts,
 * and deliberately a *separate* table: a first request and a third extension
 * are not the same question, and folding them into one function would mean
 * every change to one silently changed the other.
 */
export type ExtensionRoute = 'auto' | 'staff' | 'supervisor';

export interface ExtensionContext {
  /** The unit's tier, from BorrowRule.RuleName. Null = not configured. */
  tier: ResourceTier | null;
  /** The borrower's credit band, from CreditTier.CreditTierName. */
  creditTier: CreditTier;
  /**
   * Which extension of this loan this one would be, counting from 1.
   *
   * This is what makes T1's alternation expressible at all. docs/staff.md
   * §"ช่องว่าง" item 9 records the gap it closes: `ExtensionRequest` has no
   * column saying "this one was online" or "this one needed a look", so
   * nothing could tell whose turn it was. Deriving it from the count means the
   * answer is the same however many times it is asked, and no column has to be
   * kept in step with reality.
   */
  extendNo: number;
}

/**
 * Bands that lose the online extension entirely (§5.7).
 *
 * D3 cannot get this far — `isBlockedByCredit` refuses them before the route is
 * ever computed — but it is listed anyway so the table reads as the rule does,
 * rather than relying on a check in another file to stay where it is.
 */
const NEEDS_INSPECTION_CREDIT_TIERS: readonly CreditTier[] = ['D2', 'D3'];

/**
 * The route one extension takes.
 *
 * Tier first, then credit, then whose turn it is:
 *
 *   - **T2** is a supervisor's call whatever else is true. The same signature
 *     that released the serial in the first place releases it for longer.
 *   - **A shaky band** (D2 and below) brings the item in every time. §5.7 takes
 *     the online option away from them rather than shortening it.
 *   - **T1 alternates** (§5.4): the first extension is online, the next needs
 *     the item on the counter, then online again. Odd `extendNo` is the online
 *     one because extensions are counted from 1.
 *   - **T3** (rooms) always goes to a person. Nobody can "bring a room in", but
 *     a room held longer collides with whoever booked the next slot, and that
 *     is a judgement the department owning it makes.
 *   - **T0** is consumable-grade: nobody needs to look at it.
 *
 * An unconfigured tier goes to staff. Guessing `auto` there would hand out
 * extensions on a seeding mistake.
 */
export function extensionRouteFor({
  tier,
  creditTier,
  extendNo,
}: ExtensionContext): ExtensionRoute {
  if (tier === 'T2') return 'supervisor';
  if (NEEDS_INSPECTION_CREDIT_TIERS.includes(creditTier)) return 'staff';
  if (tier === 'T0') return 'auto';
  if (tier === 'T1') return extendNo % 2 === 1 ? 'auto' : 'staff';
  // T3, and a tier that could not be read.
  return 'staff';
}

/**
 * Whether the borrower has to produce the item before this one is granted.
 *
 * The one thing the borrower's screen needs from the route: "ต่อได้เลย" or
 * "ต้องนำอุปกรณ์มาให้ตรวจ". Named separately so screens do not have to know
 * which desks exist.
 */
export function requiresInspection(route: ExtensionRoute): boolean {
  return route !== 'auto';
}
