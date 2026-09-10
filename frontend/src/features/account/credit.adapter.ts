import type { CreditBand } from "@/types/domain";

/**
 * The borrower's standing, as `creditOutput` in
 * backend/src/credit/credit.schema.ts.
 *
 * Same reasoning as the other adapters: the server names things after the
 * tables they come from, the UI names them after what it shows. The one that
 * matters here is `tier` -> `band` - the backend calls D0-D3 a credit tier,
 * every screen in this app calls it a band.
 */
export interface ServerCredit {
  accountId: number;
  score: number;
  tier: CreditBand;
  /** BorrowConstraints.MaxBorrowDate for this tier. */
  maxBorrowDays: number;
  maxExtendTimes: number;
  activePenalties: ServerActivePenalty[];
  totalDeducted: number;
}

export interface ServerActivePenalty {
  id: number;
  /** PenaltyInfo.Reason - free text, not an enum. */
  reason: string | null;
  creditDeducted: number | null;
  issuedAt: string | null;
  expiresAt: string;
  appealed: boolean;
}

/** Credit standing in the terms the UI uses. */
export interface MyCredit {
  accountId: number;
  score: number;
  band: CreditBand;
  maxBorrowDays: number;
  maxExtendTimes: number;
  penalties: Penalty[];
  totalDeducted: number;
}

export interface Penalty {
  id: string;
  reason: string | null;
  creditDeducted: number;
  issuedAt: string | null;
  expiresAt: string;
  appealed: boolean;
}

export function toMyCredit(s: ServerCredit): MyCredit {
  return {
    accountId: s.accountId,
    score: s.score,
    band: s.tier,
    maxBorrowDays: s.maxBorrowDays,
    maxExtendTimes: s.maxExtendTimes,
    // Newest expiry first, so the penalty a borrower is waiting out sits on
    // top. The server documents this order; sorting again keeps the page
    // right if that ever changes.
    penalties: [...s.activePenalties]
      .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))
      .map(toPenalty),
    totalDeducted: s.totalDeducted,
  };
}

function toPenalty(p: ServerActivePenalty): Penalty {
  return {
    id: String(p.id),
    reason: p.reason,
    // Nullable in the DB; a penalty that deducted nothing reads as 0, not blank.
    creditDeducted: p.creditDeducted ?? 0,
    issuedAt: p.issuedAt,
    expiresAt: p.expiresAt,
    appealed: p.appealed,
  };
}
