import { z } from 'zod';

/**
 * A penalty currently in force against an account.
 *
 * Shared rather than declared per domain: `admin.getUserById` shows a staff
 * member someone else's penalties and `credit.me` shows a borrower their own,
 * and the two must not drift into slightly different shapes for the same row.
 *
 * "In force" always means the same pair of conditions - PenaltyInfo.InEffect
 * is true AND ExpirationTime has not passed. A query that selects penalties
 * without both filters must not be mapped through this.
 */
export const activePenalty = z.object({
  id: z.number().int(),
  /**
   * PenaltyInfo.Reason - free text, not an enum. The DB has a PenaltyReason
   * enum, but it lives on PenaltyRule (the rule), not PenaltyInfo (the
   * incident), so there is no reliable code to return here.
   */
  reason: z.string().nullable(),
  creditDeducted: z.number().int().nullable(),
  issuedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime(),
  appealed: z.boolean(),
});

export type ActivePenalty = z.infer<typeof activePenalty>;

/** Row shape the mapper needs - see the note above about filtering. */
export interface PenaltyRow {
  PenaltyKey: number;
  Reason: string | null;
  CreditDeducted: number | null;
  ActionTime: Date | null;
  ExpirationTime: Date;
  Appealed: boolean | null;
}

export function toActivePenalty(row: PenaltyRow): ActivePenalty {
  return {
    id: row.PenaltyKey,
    reason: row.Reason,
    creditDeducted: row.CreditDeducted,
    issuedAt: row.ActionTime?.toISOString() ?? null,
    expiresAt: row.ExpirationTime.toISOString(),
    // Appealed is nullable; "never appealed" and "explicitly false" are the
    // same thing to a client.
    appealed: row.Appealed ?? false,
  };
}

/** The one definition of "in force", so no caller invents a looser one. */
export function activePenaltyWhere() {
  return { InEffect: true, ExpirationTime: { gt: new Date() } };
}

/**
 * A borrowing ban in force, as opposed to a damage penalty.
 *
 * The two are both PenaltyInfo rows and must not be treated alike. A damage
 * penalty deducts credit and lets the lower score do the limiting, which is
 * the whole design of the credit system; a ban is an administrative decision
 * that stops new requests outright, and `admin.setUserBan` writes it with no
 * UsageKey (it came from no particular loan) and no CreditDeducted (it takes
 * no points).
 *
 * Blocking on every active penalty instead would stop anyone who has ever
 * damaged anything from borrowing again, which is not what the proposal says
 * and not what the credit tiers are for.
 */
export function activeBanWhere() {
  return { ...activePenaltyWhere(), UsageKey: null, CreditDeducted: null };
}
