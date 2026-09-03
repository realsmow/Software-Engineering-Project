import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { BusinessError } from '../errors/business-error';
import type { TrpcUser } from '../../trpc/context';

/** What the borrow rules allow this person, for this one thing. */
export interface BorrowAllowance {
  /** BorrowConstraints.MaxBorrowDate for (this unit's rule x the borrower's band). */
  maxBorrowDays: number;
  /** BorrowConstraints.MaxExtendTime for the same pair. */
  maxExtendTimes: number;
  /** BorrowConstraints.MinimumAuthorityLevel, or null when the rule sets no floor. */
  minimumAuthorityLevel: number | null;
  /** The highest AuthorityLevel the borrower holds in a group that may borrow it. */
  authorityLevel: number | null;
}

/**
 * May this person borrow this thing at all?
 *
 * This is the mechanism CONTRACT.md names as the real gate: "สิ่งที่กันไม่ให้ยืม
 * เป็นคนละกลไก คือตาราง `Eligibility` (สังกัด x บทบาท x ของ) และ
 * `MinimumAuthorityLevel`". Two separate questions live here because the schema
 * asks them separately:
 *
 *   1. Eligibility - is there a rule saying "members of group G holding role R
 *      may borrow resource X"? The borrower must hold that exact (G, R) pair
 *      via an Authority row.
 *   2. MinimumAuthorityLevel - even inside an eligible group, some rules ask
 *      for seniority. AuthorityRole.AuthorityLevel is compared against the
 *      floor set for (the unit's BorrowRule x the borrower's CreditTier).
 *
 * Neither looks at the credit score. Credit decides how long, and - by the
 * team's own decision - whether a request may be opened at all; that is
 * common/approval/approval-policy.ts, not this file.
 *
 * Separate from StaffScopeService on purpose: that answers "which departments
 * may this staff member act inside", this answers "may this borrower have this
 * item". Both read Authority, and confusing them would let a staff member
 * borrow anything they can administer.
 */
@Injectable()
export class EligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Throws NOT_ELIGIBLE unless the borrower matches an Eligibility rule and
   * clears the authority floor. Returns the limits that applied, so the caller
   * does not have to read BorrowConstraints a second time.
   */
  async assertMayBorrow(
    user: TrpcUser,
    resourceKey: number,
    creditTierKey: number,
  ): Promise<BorrowAllowance> {
    const resource = await this.prisma.resourceInfo.findUnique({
      where: { ResourceKey: resourceKey },
      select: {
        ResourceKey: true,
        BorrowRule: true,
        Eligibilities: { select: { GroupKey: true, RoleKey: true } },
      },
    });
    if (!resource) {
      throw new BusinessError('RESOURCE_NOT_FOUND', { resourceKey });
    }

    // Every group/role pair the borrower personally holds.
    const held = await this.prisma.authority.findMany({
      where: { AccountKey: user.accountKey },
      select: {
        ManageGroupKey: true,
        AuthorityRoleKey: true,
        AuthorityRole: { select: { AuthorityLevel: true } },
      },
    });

    const matches = resource.Eligibilities.filter((rule) =>
      held.some(
        (h) =>
          h.ManageGroupKey === rule.GroupKey &&
          h.AuthorityRoleKey === rule.RoleKey,
      ),
    );

    if (matches.length === 0) {
      // An item with no Eligibility rows at all is closed to everyone, not open
      // to everyone: `item.setEligibility` treats an empty list as "closed to
      // everyone" (docs/staff.md), and the two must agree.
      throw new BusinessError('NOT_ELIGIBLE', {
        resourceKey,
        reason:
          resource.Eligibilities.length === 0
            ? 'NO_RULES_CONFIGURED'
            : 'NOT_IN_AN_ELIGIBLE_GROUP',
      });
    }

    // The best level the borrower brings through a matching rule. Ties and
    // nulls resolve downward, so a role with no level cannot clear a floor.
    const authorityLevel = matches.reduce<number | null>((best, rule) => {
      const level =
        held.find(
          (h) =>
            h.ManageGroupKey === rule.GroupKey &&
            h.AuthorityRoleKey === rule.RoleKey,
        )?.AuthorityRole.AuthorityLevel ?? null;
      if (level === null) return best;
      return best === null || level > best ? level : best;
    }, null);

    const constraint = await this.prisma.borrowConstraints.findUnique({
      where: {
        BorrowRuleKey_CreditTierKey: {
          BorrowRuleKey: resource.BorrowRule,
          CreditTierKey: creditTierKey,
        },
      },
      select: {
        MaxBorrowDate: true,
        MaxExtendTime: true,
        MinimumAuthorityLevel: true,
      },
    });
    if (!constraint) {
      // The pair is missing from BorrowConstraints - a seeding gap, not a user
      // mistake. Guessing a default here would silently hand out a longer loan
      // than anybody agreed to.
      throw new BusinessError('CREDIT_TIER_NOT_CONFIGURED', {
        borrowRuleKey: resource.BorrowRule,
        creditTierKey,
      });
    }

    const floor = constraint.MinimumAuthorityLevel;
    if (floor !== null && (authorityLevel === null || authorityLevel < floor)) {
      throw new BusinessError('NOT_ELIGIBLE', {
        resourceKey,
        reason: 'AUTHORITY_LEVEL_TOO_LOW',
        required: floor,
        actual: authorityLevel,
      });
    }

    return {
      maxBorrowDays: constraint.MaxBorrowDate,
      maxExtendTimes: constraint.MaxExtendTime,
      minimumAuthorityLevel: floor,
      authorityLevel,
    };
  }
}
