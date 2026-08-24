import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { toUserOutput, type BorrowLimits } from '../common/mappers/user.mapper';
import type { CreditTier } from '../common/schemas/status.schema';
import type { UserOutput } from '../common/schemas/user.schema';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(accountKey: number): Promise<UserOutput> {
    const row = await this.prisma.accountInfo.findUniqueOrThrow({
      where: { AccountKey: accountKey },
      select: {
        AccountKey: true,
        UserID: true,
        UserFName: true,
        UserLName: true,
        Email: true,
        UserCredit: true,
        Role: { select: { RoleName: true } },
        // HashedPassword intentionally not selected — cannot leak by accident
      },
    });

    return toUserOutput(row, await this.resolveBorrowLimits(row.UserCredit));
  }

  /**
   * Converts a raw credit score into a borrow limit.
   *
   * Low credit doesn't mean "cannot borrow", it means "shorter borrow
   * window" — CreditTier (CreditMin/CreditMax) buckets the score into a
   * tier, and BorrowConstraints maps that tier to MaxBorrowDate /
   * MaxExtendTime. Eligibility to borrow at all is a separate mechanism
   * (Eligibility + MinimumAuthorityLevel).
   */
  private async resolveBorrowLimits(creditScore: number): Promise<BorrowLimits> {
    const tier = await this.prisma.creditTier.findFirstOrThrow({
      where: {
        CreditMin: { lte: creditScore },
        CreditMax: { gte: creditScore },
      },
      select: {
        CreditTierName: true,
        BorrowConstraints: {
          // Borrow rules differ per item type, so this is a general value
          // for the profile page only — the actual borrow flow must look
          // up BorrowConstraints by the item's own BorrowRuleKey.
          take: 1,
          select: { MaxBorrowDate: true, MaxExtendTime: true },
        },
      },
    });

    const constraint = tier.BorrowConstraints[0];
    return {
      creditTier: (tier.CreditTierName ?? 'D0') as CreditTier,
      maxBorrowDays: constraint?.MaxBorrowDate ?? 7,
      maxExtendTimes: constraint?.MaxExtendTime ?? 0,
    };
  }
}
