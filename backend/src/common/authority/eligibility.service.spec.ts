import {
  EligibilityService,
  matchingRules,
  heldPairs,
} from './eligibility.service';
import type { PrismaService } from '../../prisma.service';
import type { TrpcUser } from '../../trpc/context';

const user = { accountKey: 3 } as TrpcUser;

function service(options: {
  resource?: {
    ResourceKey: number;
    BorrowRule: number;
    Eligibilities: { GroupKey: number; RoleKey: number }[];
  } | null;
  held?: {
    ManageGroupKey: number;
    AuthorityRoleKey: number;
    AuthorityRole: { AuthorityLevel: number | null };
  }[];
  constraint?: {
    MaxBorrowDate: number;
    MaxExtendTime: number;
    MinimumAuthorityLevel: number | null;
  } | null;
}) {
  const resource =
    'resource' in options
      ? options.resource
      : {
          ResourceKey: 26,
          BorrowRule: 3,
          Eligibilities: [{ GroupKey: 1, RoleKey: 1 }],
        };
  const held = options.held ?? [
    {
      ManageGroupKey: 1,
      AuthorityRoleKey: 1,
      AuthorityRole: { AuthorityLevel: 5 },
    },
  ];
  const constraint =
    'constraint' in options
      ? options.constraint
      : { MaxBorrowDate: 7, MaxExtendTime: 2, MinimumAuthorityLevel: null };

  const prisma = {
    resourceInfo: { findUnique: jest.fn().mockResolvedValue(resource) },
    authority: { findMany: jest.fn().mockResolvedValue(held) },
    borrowConstraints: { findUnique: jest.fn().mockResolvedValue(constraint) },
  } as unknown as PrismaService;

  return { svc: new EligibilityService(prisma), prisma };
}

describe('assertMayBorrow', () => {
  it('refuses a resource that does not exist', async () => {
    const t = service({ resource: null });
    await expect(t.svc.assertMayBorrow(user, 26, 1)).rejects.toMatchObject({
      businessCode: 'RESOURCE_NOT_FOUND',
    });
  });

  it('refuses a borrower who holds no matching (group, role) pair', async () => {
    const t = service({ held: [] });
    await expect(t.svc.assertMayBorrow(user, 26, 1)).rejects.toMatchObject({
      businessCode: 'NOT_ELIGIBLE',
    });
  });

  it('distinguishes an unconfigured item from an ineligible borrower', async () => {
    const t = service({
      resource: { ResourceKey: 26, BorrowRule: 3, Eligibilities: [] },
    });
    await expect(t.svc.assertMayBorrow(user, 26, 1)).rejects.toMatchObject({
      businessCode: 'NOT_ELIGIBLE',
      details: expect.objectContaining({ reason: 'NO_RULES_CONFIGURED' }),
    });
  });

  it('refuses when the borrow-rule x credit-tier pair is not configured', async () => {
    const t = service({ constraint: null });
    await expect(t.svc.assertMayBorrow(user, 26, 1)).rejects.toMatchObject({
      businessCode: 'CREDIT_TIER_NOT_CONFIGURED',
    });
  });

  it('refuses a borrower below the authority floor', async () => {
    const t = service({
      constraint: {
        MaxBorrowDate: 7,
        MaxExtendTime: 2,
        MinimumAuthorityLevel: 10,
      },
    });
    await expect(t.svc.assertMayBorrow(user, 26, 1)).rejects.toMatchObject({
      businessCode: 'NOT_ELIGIBLE',
      details: expect.objectContaining({ reason: 'AUTHORITY_LEVEL_TOO_LOW' }),
    });
  });

  it('clears a floor met exactly and returns the constraint limits', async () => {
    const t = service({
      constraint: {
        MaxBorrowDate: 7,
        MaxExtendTime: 2,
        MinimumAuthorityLevel: 5,
      },
    });
    const result = await t.svc.assertMayBorrow(user, 26, 1);
    expect(result).toEqual({
      maxBorrowDays: 7,
      maxExtendTimes: 2,
      minimumAuthorityLevel: 5,
      authorityLevel: 5,
    });
  });

  it('picks the highest level across several matching rules', async () => {
    const t = service({
      resource: {
        ResourceKey: 26,
        BorrowRule: 3,
        Eligibilities: [
          { GroupKey: 1, RoleKey: 1 },
          { GroupKey: 2, RoleKey: 2 },
        ],
      },
      held: [
        {
          ManageGroupKey: 1,
          AuthorityRoleKey: 1,
          AuthorityRole: { AuthorityLevel: 3 },
        },
        {
          ManageGroupKey: 2,
          AuthorityRoleKey: 2,
          AuthorityRole: { AuthorityLevel: 9 },
        },
      ],
    });
    const result = await t.svc.assertMayBorrow(user, 26, 1);
    expect(result.authorityLevel).toBe(9);
  });

  it('does not let a null-level match count toward a floor', async () => {
    const t = service({
      held: [
        {
          ManageGroupKey: 1,
          AuthorityRoleKey: 1,
          AuthorityRole: { AuthorityLevel: null },
        },
      ],
      constraint: {
        MaxBorrowDate: 7,
        MaxExtendTime: 2,
        MinimumAuthorityLevel: 1,
      },
    });
    await expect(t.svc.assertMayBorrow(user, 26, 1)).rejects.toMatchObject({
      businessCode: 'NOT_ELIGIBLE',
    });
  });
});

describe('matchingRules', () => {
  it('keeps only rules the borrower actually holds', () => {
    const rules = [
      { GroupKey: 1, RoleKey: 1 },
      { GroupKey: 2, RoleKey: 2 },
    ];
    const held = [{ GroupKey: 1, RoleKey: 1 }];
    expect(matchingRules(rules, held)).toEqual([{ GroupKey: 1, RoleKey: 1 }]);
  });
});

describe('heldPairs', () => {
  it('maps Authority rows to (group, role) pairs', async () => {
    const prisma = {
      authority: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ ManageGroupKey: 1, AuthorityRoleKey: 2 }]),
      },
    };
    const result = await heldPairs(prisma as any, 3);
    expect(result).toEqual([{ GroupKey: 1, RoleKey: 2 }]);
  });
});
