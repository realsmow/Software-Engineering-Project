import { mapUserRole } from '../schemas/status.schema';
import { toActivePenalty, type PenaltyRow } from '../schemas/penalty.schema';
import type { BorrowLimits } from '../credit/credit-tier.service';
import type {
  AdminUserDetail,
  AdminUserSummary,
} from '../../admin/admin.schema';

/**
 * Row shapes the admin mappers need.
 *
 * Written out by hand rather than derived from Prisma's generated types, for
 * the same reason user.mapper.ts does it: the caller stays in control of which
 * columns are selected, and AccountInfo.HashedPassword must never be fetched
 * just because a type mentioned it.
 */
interface ManagementGroupRow {
  GroupType: 'Club' | 'Faculty';
  Branch: { BranchName: string | null } | null;
  Club: { ClubName: string | null } | null;
}

export interface AuthorityRow {
  ManageGroupKey: number;
  ManageGroup: ManagementGroupRow;
  AuthorityRole: { AuthorityName: string; AuthorityLevel: number | null };
}

export interface AdminAccountRow {
  AccountKey: number;
  UserID: string;
  UserFName: string;
  UserLName: string;
  Email: string;
  UserCredit: number;
  Role: { RoleName: string };
  /**
   * For the list view this is capped at one row - the summary only shows the
   * first group. The detail view selects them all.
   */
  Authorities: AuthorityRow[];
  /**
   * MUST already be filtered to penalties in force (InEffect + not expired).
   * The mapper reads `status` from whether this array is empty, so an
   * unfiltered select would mark everyone who was ever penalised as
   * suspended.
   */
  Penalties: PenaltyRow[];
}

/** A ManagementGroup's name lives on whichever of its two optional sides exists. */
function groupName(group: ManagementGroupRow): string | null {
  return group.Branch?.BranchName ?? group.Club?.ClubName ?? null;
}

export function toAdminUserSummary(row: AdminAccountRow): AdminUserSummary {
  const first = row.Authorities[0];

  return {
    id: row.AccountKey,
    studentId: row.UserID,
    firstName: row.UserFName,
    lastName: row.UserLName,
    email: row.Email,
    role: mapUserRole(row.Role.RoleName),
    status: row.Penalties.length > 0 ? 'suspended' : 'active',
    creditScore: row.UserCredit,
    managementGroup: first
      ? {
          id: first.ManageGroupKey,
          name: groupName(first.ManageGroup),
          type: first.ManageGroup.GroupType,
        }
      : null,
  };
}

export function toAdminUserDetail(
  row: AdminAccountRow,
  limits: BorrowLimits,
): AdminUserDetail {
  return {
    ...toAdminUserSummary(row),

    creditTier: limits.creditTier,
    maxBorrowDays: limits.maxBorrowDays,
    maxExtendTimes: limits.maxExtendTimes,

    authorities: row.Authorities.map((authority) => ({
      manageGroupKey: authority.ManageGroupKey,
      groupName: groupName(authority.ManageGroup),
      groupType: authority.ManageGroup.GroupType,
      authorityName: authority.AuthorityRole.AuthorityName,
      authorityLevel: authority.AuthorityRole.AuthorityLevel,
    })),

    activePenalties: row.Penalties.map(toActivePenalty),
  };
}
