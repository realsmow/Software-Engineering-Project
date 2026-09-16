import { adminUserDetail, adminUserSummary } from '../../admin/admin.schema';
import type { BorrowLimits } from '../credit/credit-tier.service';
import {
  toAdminUserDetail,
  toAdminUserSummary,
  type AdminAccountRow,
} from './admin-user.mapper';

const LIMITS: BorrowLimits = {
  creditTier: 'D1',
  maxBorrowDays: 7,
  maxExtendTimes: 1,
};

function accountRow(overrides: Partial<AdminAccountRow> = {}): AdminAccountRow {
  return {
    AccountKey: 42,
    UserID: '6410501234',
    UserFName: 'ณัฐวุฒิ',
    UserLName: 'ศรีสุวรรณ',
    Email: 'natthawut.s@ku.th',
    UserCredit: 65,
    IsActive: true,
    Role: { RoleName: 'Student' },
    Authorities: [],
    Penalties: [],
    ...overrides,
  };
}

const branchAuthority = {
  ManageGroupKey: 7,
  ManageGroup: {
    GroupType: 'Faculty' as const,
    Branch: { BranchName: 'วิศวกรรมคอมพิวเตอร์' },
    Club: null,
  },
  AuthorityRole: { AuthorityName: 'Lab staff', AuthorityLevel: 2 },
};

const clubAuthority = {
  ManageGroupKey: 9,
  ManageGroup: {
    GroupType: 'Club' as const,
    Branch: null,
    Club: { ClubName: 'ชมรมหุ่นยนต์' },
  },
  AuthorityRole: { AuthorityName: 'Club officer', AuthorityLevel: null },
};

const activePenalty = {
  PenaltyKey: 100,
  Reason: 'คืนของช้า',
  CreditDeducted: 10,
  ActionTime: new Date('2026-08-01T03:00:00.000Z'),
  ExpirationTime: new Date('2026-09-01T03:00:00.000Z'),
  Appealed: false,
};

describe('toAdminUserSummary', () => {
  it('produces a schema-valid summary', () => {
    expect(
      adminUserSummary.safeParse(toAdminUserSummary(accountRow())).success,
    ).toBe(true);
  });

  it('renames the Prisma columns to the contract field names', () => {
    expect(toAdminUserSummary(accountRow())).toMatchObject({
      id: 42,
      studentId: '6410501234',
      firstName: 'ณัฐวุฒิ',
      lastName: 'ศรีสุวรรณ',
      email: 'natthawut.s@ku.th',
      creditScore: 65,
    });
  });

  it('maps RoleInfo.RoleName through the shared role mapping', () => {
    // 'Student' is what the seed data uses; 'borrower' is what the contract says.
    expect(toAdminUserSummary(accountRow()).role).toBe('borrower');
    expect(
      toAdminUserSummary(accountRow({ Role: { RoleName: 'Professor' } })).role,
    ).toBe('supervisor');
  });

  it('throws on a RoleName nobody mapped, rather than inventing a role', () => {
    expect(() =>
      toAdminUserSummary(accountRow({ Role: { RoleName: 'Librarian' } })),
    ).toThrow(/Librarian/);
  });

  describe('status', () => {
    it('is active when no penalty is in force', () => {
      expect(toAdminUserSummary(accountRow()).status).toBe('active');
    });

    it('is suspended when one is', () => {
      expect(
        toAdminUserSummary(accountRow({ Penalties: [activePenalty] })).status,
      ).toBe('suspended');
    });
  });

  describe('managementGroup', () => {
    it('is null for an account with no authority', () => {
      expect(toAdminUserSummary(accountRow()).managementGroup).toBeNull();
    });

    it('takes the name from BranchInfo for a faculty group', () => {
      expect(
        toAdminUserSummary(accountRow({ Authorities: [branchAuthority] }))
          .managementGroup,
      ).toEqual({ id: 7, name: 'วิศวกรรมคอมพิวเตอร์', type: 'Faculty' });
    });

    it('takes it from ClubInfo for a club group', () => {
      expect(
        toAdminUserSummary(accountRow({ Authorities: [clubAuthority] }))
          .managementGroup,
      ).toEqual({ id: 9, name: 'ชมรมหุ่นยนต์', type: 'Club' });
    });

    it('is null-named when neither side has a name, instead of throwing', () => {
      const nameless = {
        ...branchAuthority,
        ManageGroup: {
          GroupType: 'Faculty' as const,
          Branch: null,
          Club: null,
        },
      };
      expect(
        toAdminUserSummary(accountRow({ Authorities: [nameless] }))
          .managementGroup?.name,
      ).toBeNull();
    });
  });
});

describe('toAdminUserDetail', () => {
  it('produces a schema-valid detail', () => {
    const detail = toAdminUserDetail(
      accountRow({
        Authorities: [branchAuthority, clubAuthority],
        Penalties: [activePenalty],
      }),
      LIMITS,
    );

    expect(adminUserDetail.safeParse(detail).success).toBe(true);
  });

  it('carries the borrow limits the caller resolved', () => {
    expect(toAdminUserDetail(accountRow(), LIMITS)).toMatchObject({
      creditTier: 'D1',
      maxBorrowDays: 7,
      maxExtendTimes: 1,
    });
  });

  it('lists every authority, not just the first', () => {
    const detail = toAdminUserDetail(
      accountRow({ Authorities: [branchAuthority, clubAuthority] }),
      LIMITS,
    );

    expect(detail.authorities).toHaveLength(2);
    expect(detail.authorities[0]).toEqual({
      manageGroupKey: 7,
      groupName: 'วิศวกรรมคอมพิวเตอร์',
      groupType: 'Faculty',
      authorityName: 'Lab staff',
      authorityLevel: 2,
    });
  });

  it('sends dates as ISO 8601 UTC strings (ว-08), never Date objects', () => {
    const [penalty] = toAdminUserDetail(
      accountRow({ Penalties: [activePenalty] }),
      LIMITS,
    ).activePenalties;

    expect(penalty.expiresAt).toBe('2026-09-01T03:00:00.000Z');
    expect(penalty.issuedAt).toBe('2026-08-01T03:00:00.000Z');
  });

  it('treats a null ActionTime and a null Appealed as absent, not as an error', () => {
    const [penalty] = toAdminUserDetail(
      accountRow({
        Penalties: [{ ...activePenalty, ActionTime: null, Appealed: null }],
      }),
      LIMITS,
    ).activePenalties;

    expect(penalty.issuedAt).toBeNull();
    expect(penalty.appealed).toBe(false);
  });
});
