import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreditTierService } from '../common/credit/credit-tier.service';
import { BusinessError } from '../common/errors/business-error';
import {
  activePenaltyWhere,
  toActivePenalty,
} from '../common/schemas/penalty.schema';
import type { CreditOutput } from './credit.schema';

@Injectable()
export class CreditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditTiers: CreditTierService,
  ) {}

  async getCredit(accountKey: number): Promise<CreditOutput> {
    const account = await this.prisma.accountInfo.findUnique({
      where: { AccountKey: accountKey },
      select: {
        AccountKey: true,
        UserCredit: true,
        Penalties: {
          where: activePenaltyWhere(),
          orderBy: { ExpirationTime: 'desc' },
          select: {
            PenaltyKey: true,
            Reason: true,
            CreditDeducted: true,
            ActionTime: true,
            ExpirationTime: true,
            Appealed: true,
          },
        },
        // HashedPassword deliberately not selected.
      },
    });

    if (!account) throw new BusinessError('USER_NOT_FOUND', { id: accountKey });

    const limits = await this.creditTiers.resolveBorrowLimits(account.UserCredit);
    const activePenalties = account.Penalties.map(toActivePenalty);

    return {
      accountId: account.AccountKey,
      score: account.UserCredit,
      tier: limits.creditTier,
      maxBorrowDays: limits.maxBorrowDays,
      maxExtendTimes: limits.maxExtendTimes,
      activePenalties,
      // CreditDeducted is nullable — an admin-issued borrowing ban deducts
      // nothing — so a null contributes zero rather than breaking the sum.
      totalDeducted: activePenalties.reduce(
        (sum, penalty) => sum + (penalty.creditDeducted ?? 0),
        0,
      ),
    };
  }
}
