import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { StaffScopeService } from '../common/authority/staff-scope.service';
import { tryMapTier } from '../common/schemas/status.schema';
import { UNAVAILABLE_USAGE_STATES } from '../common/usage/usage-states';
import type { TrpcUser } from '../trpc/context';
import type { ReportSummaryInput } from './report.schema';

/**
 * Lending activity, counted from the rows themselves.
 *
 * Nothing is cached or stored. These are small aggregate queries over tables
 * that already exist, and a stored rollup is a number that can quietly stop
 * matching the data it claims to summarise - which is exactly the failure this
 * page is replacing.
 *
 * Scope comes from StaffScopeService, the same as every other staff-facing
 * read: a department head sees their own departments, an admin sees all of
 * them (SDS §7.3).
 */
@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffScope: StaffScopeService,
  ) {}

  async summary(user: TrpcUser, input: ReportSummaryInput) {
    const groupKeys = await this.staffScope.resolveGroupKeys(user);
    const scope = groupKeys === null ? {} : { ManagedBy: { in: groupKeys } };
    const now = new Date();

    const groups = await this.prisma.managementGroup.findMany({
      where: groupKeys === null ? {} : { ManageGroupKey: { in: groupKeys } },
      select: {
        ManageGroupKey: true,
        GroupType: true,
        Branch: { select: { BranchName: true } },
        Club: { select: { ClubName: true } },
      },
    });

    const departments = await Promise.all(
      groups.map(async (g) => {
        const where = { ManagedBy: g.ManageGroupKey };
        const [unitsHeld, unitsOut, loans, overdue] = await Promise.all([
          this.prisma.resourceInfo.count({ where }),
          this.prisma.resourceInfo.count({
            where: { ...where, ResourceStatus: 'Lended' },
          }),
          this.prisma.usageLog.count({ where: { Resource: where } }),
          this.prisma.usageLog.count({
            where: {
              Resource: where,
              DueTime: { lt: now },
              // "Out and late", not "was ever late": a returned loan is
              // history, and counting it here would make the figure only ever
              // grow.
              CurrentStatus: { in: [...UNAVAILABLE_USAGE_STATES] },
            },
          }),
        ]);

        return {
          manageGroupKey: g.ManageGroupKey,
          name: g.Branch?.BranchName ?? g.Club?.ClubName ?? null,
          loans,
          overdue,
          unitsHeld,
          unitsOut,
          // Percent of the shelf currently out. Zero units held is 0%, not a
          // division by zero.
          utilization:
            unitsHeld === 0 ? 0 : Math.round((unitsOut / unitsHeld) * 100),
        };
      }),
    );

    const top = await this.topEquipment(scope, input.topLimit);

    return {
      generatedAt: now.toISOString(),
      unscoped: groupKeys === null,
      totals: departments.reduce(
        (acc, d) => ({
          loans: acc.loans + d.loans,
          overdue: acc.overdue + d.overdue,
          unitsHeld: acc.unitsHeld + d.unitsHeld,
          unitsOut: acc.unitsOut + d.unitsOut,
        }),
        { loans: 0, overdue: 0, unitsHeld: 0, unitsOut: 0 },
      ),
      departments: departments.sort((a, b) => b.loans - a.loans),
      topEquipment: top,
    };
  }

  /**
   * Most-borrowed equipment types in scope.
   *
   * Grouped by ItemInfo rather than by unit: "the multimeter" is what a report
   * is about, not multimeter #3. The tier is read off any one of the type's
   * units, since a tier belongs to the unit's BorrowRule.
   */
  private async topEquipment(
    scope: { ManagedBy?: { in: number[] } },
    limit: number,
  ) {
    const units = await this.prisma.itemIndiv.findMany({
      where: { Resource: scope },
      select: {
        ItemKey: true,
        Item: { select: { ItemName: true } },
        Resource: {
          select: { BorrowRuleInfo: { select: { RuleName: true } } },
        },
        ResourceKey: true,
      },
    });
    if (units.length === 0) return [];

    const counts = await this.prisma.usageLog.groupBy({
      by: ['ResourceKey'],
      where: { ResourceKey: { in: units.map((u) => u.ResourceKey) } },
      _count: { _all: true },
    });
    const perResource = new Map(
      counts.map((c) => [c.ResourceKey, c._count._all]),
    );

    const byType = new Map<
      number,
      { name: string | null; tier: string | null; count: number }
    >();
    for (const u of units) {
      const entry = byType.get(u.ItemKey) ?? {
        name: u.Item.ItemName,
        tier: u.Resource.BorrowRuleInfo.RuleName,
        count: 0,
      };
      entry.count += perResource.get(u.ResourceKey) ?? 0;
      byType.set(u.ItemKey, entry);
    }

    return [...byType.entries()]
      .map(([itemKey, v]) => ({
        itemKey,
        name: v.name,
        tier: tryMapTier(v.tier),
        count: v.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}
