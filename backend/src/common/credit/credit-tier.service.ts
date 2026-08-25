import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { BusinessError } from '../errors/business-error';
import type { CreditTier } from '../schemas/status.schema';

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

  async resolveBorrowLimits(creditScore: number): Promise<BorrowLimits> {
    const tier = await this.prisma.creditTier.findFirst({
      where: {
        CreditMin: { lte: creditScore },
        CreditMax: { gte: creditScore },
      },
      select: {
        CreditTierName: true,
        BorrowConstraints: {
          // Borrow rules differ per item type, so this is a general value for
          // profile/admin display only - the actual borrow flow must look up
          // BorrowConstraints by the item's own BorrowRuleKey.
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
