import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { BusinessError } from '../errors/business-error';
import type { CreditTier } from '../schemas/status.schema';

/** The CreditTier row a score falls into. */
export interface ResolvedCreditTier {
  /** CreditTier.CreditTierKey - what BorrowConstraints is keyed on. */
  creditTierKey: number;
  /** CreditTier.CreditTierName, as a contract string. */
  creditTier: CreditTier;
}

/** Borrow limits resolved from CreditTier x BorrowConstraints. */
export interface BorrowLimits {
  creditTier: CreditTier;
  /** BorrowConstraints.MaxBorrowDate */
  maxBorrowDays: number;
  /** BorrowConstraints.MaxExtendTime */
  maxExtendTimes: number;
}

/**
 * Turns a raw credit score into a borrow limit.
 *
 * Lives on its own because two domains need the same answer - `auth.me` shows
 * a borrower their own limit, and `admin.getUserById` shows a staff member
 * someone else's. Duplicating the lookup is how the two drift apart.
 *
 * Low credit does not mean "cannot borrow", it means "shorter borrow window":
 * CreditTier (CreditMin/CreditMax) buckets the score, and BorrowConstraints
 * maps that tier to MaxBorrowDate / MaxExtendTime. Whether a user may borrow a
 * given thing at all is a separate mechanism (Eligibility +
 * MinimumAuthorityLevel) that never looks at the score.
 */
@Injectable()
export class CreditTierService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Just the band, with its key.
   *
   * The borrow flow needs the key, not the display limits: which rule applies
   * depends on the item's own BorrowRuleKey, so the (rule x band) row is read
   * later by EligibilityService. Separated from resolveBorrowLimits so that
   * path does not pay for a `take: 1` constraint it is about to ignore.
   */
  async resolveTier(creditScore: number): Promise<ResolvedCreditTier> {
    const tier = await this.prisma.creditTier.findFirst({
      where: {
        CreditMin: { lte: creditScore },
        CreditMax: { gte: creditScore },
      },
      orderBy: { CreditMin: 'desc' },
      select: { CreditTierKey: true, CreditTierName: true },
    });

    if (!tier) {
      throw new BusinessError('CREDIT_TIER_NOT_CONFIGURED', { creditScore });
    }

    return {
      creditTierKey: tier.CreditTierKey,
      creditTier: (tier.CreditTierName ?? 'D0') as CreditTier,
    };
  }

  /**
   * A score -> band function, with the table read once.
   *
   * For lists. Resolving a band per row is one query per row, and the approval
   * queue needs the band of every requester on the page to know which desk each
   * request belongs to.
   */
  async tierMapper(): Promise<(creditScore: number) => CreditTier> {
    const tiers = await this.prisma.creditTier.findMany({
      orderBy: { CreditMin: 'desc' },
      select: { CreditTierName: true, CreditMin: true, CreditMax: true },
    });

    return (creditScore: number) => {
      const hit = tiers.find(
        (t) => creditScore >= t.CreditMin && creditScore <= t.CreditMax,
      );
      // The lowest band rather than a throw: a list must still render when one
      // account's score falls in a gap left by the seed data.
      return (hit?.CreditTierName ?? 'D3') as CreditTier;
    };
  }

  async resolveBorrowLimits(creditScore: number): Promise<BorrowLimits> {
    const tier = await this.prisma.creditTier.findFirst({
      where: {
        CreditMin: { lte: creditScore },
        CreditMax: { gte: creditScore },
      },
      select: {
        CreditTierName: true,
        BorrowConstraints: {
          /*
           * Proposal §5.7 makes the borrow window a property of the credit
           * tier alone (D0 14 days, D1/D2 7, D3 5). The schema is wider than
           * that: BorrowConstraints is unique on (BorrowRuleKey,
           * CreditTierKey), so one credit tier owns up to four rows, one per
           * T-tier. The seed writes them identical, but
           * `admin.updateLendingSettings` edits them one BorrowRuleKey at a
           * time, so the first time somebody tunes T2 the four rows diverge.
           *
           * `take: 1` without an order would then start returning whichever
           * row Postgres felt like — the same profile answering differently
           * between two requests. Ordering makes it deterministic, and
           * ordering *ascending* makes it safe: the number shown is one the
           * borrower is entitled to for every tier of item, never a promise of
           * more days than some item would actually grant. ConstraintsKey
           * breaks the remaining tie so equal rows also pick stably.
           *
           * The actual borrow flow must still look up BorrowConstraints by the
           * item's own BorrowRuleKey — this is the profile-level answer.
           */
          orderBy: [
            { MaxBorrowDate: 'asc' as const },
            { ConstraintsKey: 'asc' as const },
          ],
          take: 1,
          select: { MaxBorrowDate: true, MaxExtendTime: true },
        },
      },
    });

    if (!tier) {
      // A score with no tier is a seeding gap (CreditMin/CreditMax leave a
      // hole), not a user mistake - say so instead of guessing a default.
      throw new BusinessError('CREDIT_TIER_NOT_CONFIGURED', { creditScore });
    }

    const constraint = tier.BorrowConstraints[0];
    return {
      creditTier: (tier.CreditTierName ?? 'D0') as CreditTier,
      maxBorrowDays: constraint?.MaxBorrowDate ?? 7,
      maxExtendTimes: constraint?.MaxExtendTime ?? 0,
    };
  }
}
