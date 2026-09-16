import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { BusinessError } from '../errors/business-error';
import type { TrpcUser } from '../../trpc/context';

/**
 * Which management groups a staff member may act inside.
 *
 * The proposal is explicit that authority is departmental: "เจ้าหน้าที่ (Staff)
 * และอาจารย์ (Supervisor) มีขอบเขตอำนาจตามภาควิชาหรือหน่วยงานของตนเอง ไม่สามารถ
 * อนุมัติหรือให้ยืมอุปกรณ์ข้ามภาควิชาได้" (§5.1). Without that check a single
 * StaffMiddleware would let any staff member hand out, inspect, or retire every
 * department's equipment.
 *
 * `ctx.user.facultyKey` cannot express this — it is always null, because
 * AccountInfo has no faculty relation (docs/auth-admin.md §3 item 3). The
 * Authority table can: it maps an account to the ManagementGroups it holds a
 * role in, and ResourceInfo.ManagedBy names the group that owns each unit. So
 * the scope is the intersection of those two, resolved per request.
 *
 * Admins are unscoped on purpose. They are the ones who fix a department whose
 * only staff member has left, and every admin procedure that matters is
 * already audited by the admin domain.
 */
@Injectable()
export class StaffScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The ManageGroupKeys the caller may act in, or `null` meaning "all groups".
   *
   * Null rather than "every key in the table": a list would go stale the
   * moment a group is added, and callers turn this into a Prisma filter where
   * "no filter" is exactly what unscoped means.
   */
  async resolveGroupKeys(user: TrpcUser): Promise<number[] | null> {
    if (user.role === 'admin') return null;

    const authorities = await this.prisma.authority.findMany({
      where: { AccountKey: user.accountKey },
      select: { ManageGroupKey: true },
    });

    if (authorities.length === 0) {
      // Passing StaffMiddleware but holding no Authority row means the account
      // was given the staff role and never attached to a department. Silently
      // returning an empty result set would look like "your department has no
      // equipment", which is the wrong thing for that person to believe.
      throw new BusinessError('NO_MANAGEMENT_SCOPE', {
        accountKey: user.accountKey,
      });
    }

    return authorities.map((row) => row.ManageGroupKey);
  }

  /**
   * A `ResourceInfo.ManagedBy` filter for the caller — spread into any where
   * clause that reaches resources, directly or through a relation.
   */
  async resourceScope(
    user: TrpcUser,
  ): Promise<{ ManagedBy?: { in: number[] } }> {
    const groups = await this.resolveGroupKeys(user);
    return groups === null ? {} : { ManagedBy: { in: groups } };
  }

  /**
   * Throws unless the caller may act on this resource.
   *
   * Used by every mutation that addresses one unit by key. A read can get away
   * with filtering the list; a write cannot, because the key came from the
   * client and may name a unit the caller was never shown.
   */
  async assertResourceInScope(
    user: TrpcUser,
    resourceKey: number,
  ): Promise<void> {
    const groups = await this.resolveGroupKeys(user);
    if (groups === null) return;

    const resource = await this.prisma.resourceInfo.findUnique({
      where: { ResourceKey: resourceKey },
      select: { ManagedBy: true },
    });

    if (!resource) {
      throw new BusinessError('RESOURCE_NOT_FOUND', { resourceKey });
    }
    if (!groups.includes(resource.ManagedBy)) {
      throw new BusinessError('OUT_OF_MANAGEMENT_SCOPE', {
        resourceKey,
        managedBy: resource.ManagedBy,
      });
    }
  }

  /** Same check for a group the caller names directly (e.g. when registering a unit). */
  async assertGroupInScope(
    user: TrpcUser,
    manageGroupKey: number,
  ): Promise<void> {
    const groups = await this.resolveGroupKeys(user);
    if (groups === null) return;

    if (!groups.includes(manageGroupKey)) {
      throw new BusinessError('OUT_OF_MANAGEMENT_SCOPE', { manageGroupKey });
    }
  }
}
