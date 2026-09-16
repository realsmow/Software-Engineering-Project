import type { UsageStatus } from '../schemas/status.schema';

/**
 * The two ways a UsageLog can tie up a unit. Shared, because `item`, `loan` and
 * `inspection` each ask one of these questions and a disagreement between them
 * shows up as a unit that is lendable on one screen and not on another.
 *
 * The lifecycle is Pending -> Prepared -> Lended -> Returned -> Inspected
 * (UsageLog.CurrentStatus). Only the last state ends the loan's claim on the
 * unit.
 */

/**
 * A borrower physically has it, or is about to.
 *
 * Blocks withdrawing the unit for maintenance: the return flow needs the unit
 * to still exist and still be reachable, so the switch has to wait until it is
 * back on the shelf.
 */
export const HELD_USAGE_STATES: UsageStatus[] = [
  'Pending',
  'Prepared',
  'Lended',
];

/**
 * The unit cannot be offered to anybody else.
 *
 * Wider than HELD by one state: a unit that is back but not yet graded is not
 * available, because inspection may still send it to repair. Handing it
 * straight to the next borrower is how one person's damage becomes the next
 * person's penalty.
 */
export const UNAVAILABLE_USAGE_STATES: UsageStatus[] = [
  'Pending',
  'Prepared',
  'Lended',
  'Returned',
];
