import { z } from 'zod';
import { activePenalty } from '../common/schemas/penalty.schema';
import { creditTier } from '../common/schemas/status.schema';

/**
 * A borrower's standing.
 *
 * `auth.me` already carries the score and tier, because every page shows them
 * in the shell. This adds the part a credit page needs and a shell does not:
 * the penalties actually in force, so "why is my limit 5 days" has an answer
 * on screen instead of requiring a trip to the office.
 */
export const creditOutput = z.object({
  accountId: z.number().int(),
  score: z.number().int(),
  tier: creditTier,

  /** Borrow window at this tier (BorrowConstraints.MaxBorrowDate) */
  maxBorrowDays: z.number().int().positive(),
  maxExtendTimes: z.number().int().min(0),

  /**
   * Penalties in force right now, newest expiry first. Empty for an account in
   * good standing — an empty list is the normal case, not an error.
   */
  activePenalties: z.array(activePenalty),
  /** Sum of CreditDeducted across the list above, for the headline figure. */
  totalDeducted: z.number().int().min(0),
});

export const creditIdInput = z.object({ id: z.number().int().positive() });

export type CreditOutput = z.infer<typeof creditOutput>;
