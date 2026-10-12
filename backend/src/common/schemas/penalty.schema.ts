import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';

/**
 * A penalty currently in force against an account.
 *
 * Shared rather than declared per domain: `admin.getUserById` shows a staff
 * member someone else's penalties and `credit.me` shows a borrower their own,
 * and the two must not drift into slightly different shapes for the same row.
 *
 * "In force" always means whatever `activePenaltyWhere` says: PenaltyInfo
 * .InEffect is true and either ExpirationTime has not passed or the row is
 * the late penalty held open for an item still out (LATE_PENALTY_HELD_OPEN).
 * A query that selects penalties by a looser filter must not be mapped
 * through this.
 */
export const activePenalty = z.object({
  id: z.number().int(),
  /**
   * PenaltyInfo.Reason - free text, not an enum. The DB has a PenaltyReason
   * enum, but it lives on PenaltyRule (the rule), not PenaltyInfo (the
   * incident), so there is no reliable code to return here.
   */
  reason: z.string().nullable(),
  /** The loan it came from, so a page can show it beside that loan. Null for a ban. */
  usageKey: z.number().int().nullable(),
  creditDeducted: z.number().int().nullable(),
  /** What the loan was for; null for a ban or when the caller did not load it. */
  itemName: z.string().nullable().default(null),
  issuedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime(),
  appealed: z.boolean(),
});

export type ActivePenalty = z.infer<typeof activePenalty>;

/** Row shape the mapper needs - see the note above about filtering. */
export interface PenaltyRow {
  PenaltyKey: number;
  Reason: string | null;
  /** Null for a ban, which came from no particular loan. */
  UsageKey: number | null;
  CreditDeducted: number | null;
  ActionTime: Date | null;
  ExpirationTime: Date;
  Appealed: boolean | null;
  Usage?: {
    Resource: {
      Item: { Item: { ItemName: string | null } } | null;
      Room: { RoomName: string | null } | null;
    };
  } | null;
}

/** Usage select that gives toActivePenalty the item name. */
export const PENALTY_ITEM_SELECT = {
  select: {
    Resource: {
      select: {
        Item: { select: { Item: { select: { ItemName: true } } } },
        Room: { select: { RoomName: true } },
      },
    },
  },
} as const;

export function toActivePenalty(row: PenaltyRow): ActivePenalty {
  return {
    id: row.PenaltyKey,
    reason: row.Reason,
    usageKey: row.UsageKey,
    creditDeducted: row.CreditDeducted,
    itemName:
      row.Usage?.Resource.Item?.Item.ItemName ??
      row.Usage?.Resource.Room?.RoomName ??
      null,
    issuedAt: row.ActionTime?.toISOString() ?? null,
    expiresAt: row.ExpirationTime.toISOString(),
    // Appealed is nullable; "never appealed" and "explicitly false" are the
    // same thing to a client.
    appealed: row.Appealed ?? false,
  };
}

/** Note on a late penalty closed by an extension; later lateness is a new row (#192). */
export const LATE_BEFORE_EXTENSION = 'before extension';

/**
 * The late penalty still counting for a loan's current due date. One closed
 * by an extension is excluded, so lateness after the new due is charged again.
 */
export const OPEN_LATE_PENALTY = {
  AND: [
    { Reason: { startsWith: 'ReturnLate' } },
    { NOT: { Reason: { contains: LATE_BEFORE_EXTENSION } } },
  ],
} satisfies Prisma.PenaltyInfoWhereInput;

/**
 * The one row whose ExpirationTime is allowed to be in the past while the
 * penalty is still in force.
 *
 * #196: lateness goes on accruing until the item is back, so the overnight
 * expiry job deliberately leaves this row open and `settleLate` restarts its
 * clock at the return. Written here, beside `activePenaltyWhere`, because the
 * job and the definition of "in force" have to name the same row - when only
 * the job knew about it, the expiry of some *other* penalty recomputed the
 * score without this one and handed the borrower their points back while they
 * still had the equipment (#199).
 */
export const LATE_PENALTY_HELD_OPEN = {
  AND: [OPEN_LATE_PENALTY, { Usage: { CurrentStatus: 'Lended' } }],
} satisfies Prisma.PenaltyInfoWhereInput;

/** The one definition of "in force", so no caller invents a looser one. */
export function activePenaltyWhere(): Prisma.PenaltyInfoWhereInput {
  return {
    InEffect: true,
    OR: [{ ExpirationTime: { gt: new Date() } }, LATE_PENALTY_HELD_OPEN],
  };
}
