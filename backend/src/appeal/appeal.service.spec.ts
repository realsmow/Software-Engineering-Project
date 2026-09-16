import { AppealService } from './appeal.service';
import { APPEAL_WINDOW_DAYS } from './appeal.schema';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { NotificationService } from '../notification/notification.service';
import type { PrismaService } from '../prisma.service';
import type { TrpcUser } from '../trpc/context';

/**
 * The appeals desk (§5.8), and above all "คนตรวจสอบต้องไม่ใช่คนเดิม".
 *
 * These are the rules a borrower would take to the department if they were
 * wrong: who may rule on an appeal, whether an overturned penalty actually
 * gives the points back, and whether a penalty can be appealed twice.
 */

/** First argument of a stubbed Prisma write, typed enough to assert against. */
function firstCall(mock: jest.Mock): { data: Record<string, unknown> } {
  const calls = mock.mock.calls as Array<[{ data: Record<string, unknown> }]>;
  return calls[0][0];
}

const BORROWER: TrpcUser = {
  accountKey: 100,
  role: 'borrower',
  creditScore: 60,
} as TrpcUser;

const SUPERVISOR: TrpcUser = {
  accountKey: 200,
  role: 'supervisor',
  creditScore: 100,
} as TrpcUser;

/** The staff member who graded the return the penalty came from. */
const INSPECTOR: TrpcUser = {
  accountKey: 300,
  role: 'supervisor',
  creditScore: 100,
} as TrpcUser;

const account = (key: number) => ({
  AccountKey: key,
  UserID: `b${key}`,
  UserFName: 'ชื่อ',
  UserLName: 'สกุล',
  UserCredit: 60,
});

const PENALTY = {
  PenaltyKey: 55,
  Reason: 'DamagedItem',
  CreditDeducted: 20,
  ActionTime: new Date('2026-09-15T03:00:00Z'),
  ExpirationTime: new Date('2026-10-15T03:00:00Z'),
  InEffect: true,
  AccountKey: BORROWER.accountKey,
  UsageKey: 7,
};

/** An appeal row as APPEAL_SELECT returns it, with the parts tests vary. */
function appealRow(
  overrides: Partial<{
    ApproveStatus: string;
    FiledBy: number;
    inspectorKeys: number[];
    usage: unknown;
  }> = {},
) {
  return {
    AppealKey: 9,
    AppealReason: 'ผมไม่ได้ทำ',
    ApproveStatus: overrides.ApproveStatus ?? 'Pending',
    ActionTime: new Date('2026-09-16T03:00:00Z'),
    ResolvedAt: null,
    FiledBy: overrides.FiledBy ?? BORROWER.accountKey,
    FiledByUser: account(BORROWER.accountKey),
    ResolvedByUser: null,
    OriginalPenaltyInfo: {
      ...PENALTY,
      Usage:
        overrides.usage === undefined
          ? {
              ResourceKey: 42,
              Resource: {
                Item: { Item: { ItemName: 'กล้อง' } },
                Room: null,
              },
            }
          : overrides.usage,
    },
    NewPenaltyInfo: null,
    Inspections: (overrides.inspectorKeys ?? [INSPECTOR.accountKey]).map(
      (key) => ({ InspectorKey: key }),
    ),
  };
}

function build(prisma: Record<string, unknown>) {
  const scope = {
    assertResourceInScope: jest.fn().mockResolvedValue(undefined),
    resolveGroupKeys: jest.fn().mockResolvedValue(null),
  } as unknown as StaffScopeService;

  const notifications = {
    appealApproved: jest.fn().mockResolvedValue(undefined),
    appealRejected: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationService;

  const service = new AppealService(
    prisma as unknown as PrismaService,
    scope,
    notifications,
  );

  return { service, scope, notifications };
}

describe('AppealService.decide — who may rule', () => {
  /** A prisma stub that returns one appeal and records the writes attempted. */
  function prismaWith(row: ReturnType<typeof appealRow>) {
    const tx = {
      appealInfo: { update: jest.fn().mockResolvedValue({}) },
      penaltyInfo: {
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ PenaltyKey: 56 }),
      },
      accountInfo: { update: jest.fn().mockResolvedValue({}) },
    };

    return {
      tx,
      prisma: {
        appealInfo: {
          findUnique: jest.fn().mockResolvedValue(row),
        },
        // Runs the callback against the stub transaction, exactly as Prisma's
        // interactive transaction does, so the writes inside are observable.
        $transaction: jest.fn((work: (t: unknown) => unknown) =>
          Promise.resolve(work(tx)),
        ),
      },
    };
  }

  it('refuses the inspector whose grade is being appealed', async () => {
    // The rule the proposal spells out. Without it the appeal is a request to
    // reconsider addressed to the person who already decided.
    const { prisma, tx } = prismaWith(appealRow());
    const { service } = build(prisma);

    await expect(
      service.decide(INSPECTOR, { appealKey: 9, decision: 'approve' }),
    ).rejects.toThrow(/CANNOT_DECIDE_OWN_INSPECTION/);

    expect(tx.penaltyInfo.update).not.toHaveBeenCalled();
  });

  it('refuses the borrower who filed it', async () => {
    const { prisma } = prismaWith(
      appealRow({ FiledBy: SUPERVISOR.accountKey }),
    );
    const { service } = build(prisma);

    await expect(
      service.decide(SUPERVISOR, { appealKey: 9, decision: 'reject' }),
    ).rejects.toThrow(/CANNOT_DECIDE_OWN_APPEAL/);
  });

  it('lets a different supervisor through', async () => {
    const { prisma, tx } = prismaWith(appealRow());
    const { service } = build(prisma);
    // getById re-reads after the write; the same stub answers it.
    await service.decide(SUPERVISOR, { appealKey: 9, decision: 'reject' });

    expect(firstCall(tx.appealInfo.update).data).toMatchObject({
      ApproveStatus: 'Rejected',
      ResolvedBy: SUPERVISOR.accountKey,
    });
  });

  it('refuses an appeal that has already been ruled on', async () => {
    const { prisma } = prismaWith(appealRow({ ApproveStatus: 'Approved' }));
    const { service } = build(prisma);

    await expect(
      service.decide(SUPERVISOR, { appealKey: 9, decision: 'approve' }),
    ).rejects.toThrow(/APPEAL_ALREADY_RESOLVED/);
  });
});

describe('AppealService.decide — what approving does', () => {
  function prismaWith(row: ReturnType<typeof appealRow>) {
    const tx = {
      appealInfo: { update: jest.fn().mockResolvedValue({}) },
      penaltyInfo: {
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ PenaltyKey: 56 }),
      },
      accountInfo: { update: jest.fn().mockResolvedValue({}) },
    };
    return {
      tx,
      prisma: {
        appealInfo: { findUnique: jest.fn().mockResolvedValue(row) },
        // Runs the callback against the stub transaction, exactly as Prisma's
        // interactive transaction does, so the writes inside are observable.
        $transaction: jest.fn((work: (t: unknown) => unknown) =>
          Promise.resolve(work(tx)),
        ),
      },
    };
  }

  it('lifts the penalty and hands back every point', async () => {
    const { prisma, tx } = prismaWith(appealRow());
    const { service } = build(prisma);

    await service.decide(SUPERVISOR, { appealKey: 9, decision: 'approve' });

    expect(tx.penaltyInfo.update).toHaveBeenCalledWith({
      where: { PenaltyKey: PENALTY.PenaltyKey },
      data: { InEffect: false },
    });
    expect(tx.accountInfo.update).toHaveBeenCalledWith({
      where: { AccountKey: BORROWER.accountKey },
      data: { UserCredit: { increment: 20 } },
    });
    // The original row is never rewritten beyond InEffect: what was charged
    // stays on the record, and the appeal is what says it was overturned.
    expect(tx.penaltyInfo.create).not.toHaveBeenCalled();
  });

  it('refunds only the difference when the penalty is reduced', async () => {
    const { prisma, tx } = prismaWith(appealRow());
    const { service } = build(prisma);

    await service.decide(SUPERVISOR, {
      appealKey: 9,
      decision: 'approve',
      reducedCreditDeducted: 5,
    });

    expect(firstCall(tx.penaltyInfo.create).data).toMatchObject({
      CreditDeducted: 5,
    });
    expect(tx.accountInfo.update).toHaveBeenCalledWith({
      where: { AccountKey: BORROWER.accountKey },
      data: { UserCredit: { increment: 15 } },
    });
  });

  it('refuses a "reduction" that costs the same or more', async () => {
    const { prisma } = prismaWith(appealRow());
    const { service } = build(prisma);

    await expect(
      service.decide(SUPERVISOR, {
        appealKey: 9,
        decision: 'approve',
        reducedCreditDeducted: 20,
      }),
    ).rejects.toThrow(/INVALID_APPEAL_REDUCTION/);
  });

  it('rejecting touches neither the penalty nor the credit', async () => {
    const { prisma, tx } = prismaWith(appealRow());
    const { service } = build(prisma);

    await service.decide(SUPERVISOR, { appealKey: 9, decision: 'reject' });

    expect(tx.penaltyInfo.update).not.toHaveBeenCalled();
    expect(tx.accountInfo.update).not.toHaveBeenCalled();
  });
});

describe('AppealService.create', () => {
  function prismaWith(penalty: unknown) {
    const tx = {
      appealInfo: { create: jest.fn().mockResolvedValue({ AppealKey: 9 }) },
      penaltyInfo: { update: jest.fn().mockResolvedValue({}) },
      inspection: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    return {
      tx,
      prisma: {
        penaltyInfo: { findUnique: jest.fn().mockResolvedValue(penalty) },
        appealInfo: {
          findUnique: jest.fn().mockResolvedValue(appealRow()),
        },
        // Runs the callback against the stub transaction, exactly as Prisma's
        // interactive transaction does, so the writes inside are observable.
        $transaction: jest.fn((work: (t: unknown) => unknown) =>
          Promise.resolve(work(tx)),
        ),
      },
    };
  }

  const filing = { penaltyKey: 55, appealReason: 'ผมไม่ได้ทำ' };

  it('files it, flags the penalty and points the grading back at it', async () => {
    const { prisma, tx } = prismaWith({ ...PENALTY, OriginalAppeal: null });
    const { service } = build(prisma);

    await service.create(BORROWER, filing);

    expect(tx.penaltyInfo.update).toHaveBeenCalledWith({
      where: { PenaltyKey: 55 },
      data: { Appealed: true },
    });
    // Without this link there is no way to know who graded it, and the
    // "different reviewer" rule has nothing to compare against.
    expect(tx.inspection.updateMany).toHaveBeenCalledWith({
      where: { PenaltyKey: 55 },
      data: { AppealKey: 9 },
    });
  });

  it('refuses somebody else’s penalty', async () => {
    const { prisma } = prismaWith({
      ...PENALTY,
      AccountKey: 999,
      OriginalAppeal: null,
    });
    const { service } = build(prisma);

    await expect(service.create(BORROWER, filing)).rejects.toThrow(
      /NOT_YOUR_PENALTY/,
    );
  });

  it('refuses a second appeal against the same penalty', async () => {
    const { prisma } = prismaWith({
      ...PENALTY,
      OriginalAppeal: { AppealKey: 3 },
    });
    const { service } = build(prisma);

    await expect(service.create(BORROWER, filing)).rejects.toThrow(
      /ALREADY_APPEALED/,
    );
  });

  it('refuses one that is already lifted', async () => {
    const { prisma } = prismaWith({
      ...PENALTY,
      InEffect: false,
      OriginalAppeal: null,
    });
    const { service } = build(prisma);

    await expect(service.create(BORROWER, filing)).rejects.toThrow(
      /PENALTY_NOT_IN_EFFECT/,
    );
  });

  it('refuses one older than the appeal window', async () => {
    const longAgo = new Date(
      Date.now() - (APPEAL_WINDOW_DAYS + 1) * 86_400_000,
    );
    const { prisma } = prismaWith({
      ...PENALTY,
      ActionTime: longAgo,
      OriginalAppeal: null,
    });
    const { service } = build(prisma);

    await expect(service.create(BORROWER, filing)).rejects.toThrow(
      /APPEAL_WINDOW_CLOSED/,
    );
  });
});

describe('AppealService — reaching the evidence', () => {
  /**
   * FR-APL-03 puts the before/after photos, the staff report and the
   * borrower's account on one screen. Every procedure that can supply the
   * first two (`image.usagePhotos`, `inspection.getById`) is keyed by
   * `usageKey`, and nothing else maps an appeal to one — so an appeal that
   * does not carry it is a dead end, and the supervisor rules on the
   * borrower's text alone.
   */
  it('carries the loan key the evidence procedures are keyed by', async () => {
    const prisma = {
      appealInfo: {
        findUnique: jest.fn().mockResolvedValue(appealRow()),
      },
    };
    const { service } = build(prisma);

    const appeal = await service.getById(SUPERVISOR, 9);

    expect(appeal.penalty.usageKey).toBe(PENALTY.UsageKey);
  });

  it('reports no loan for a penalty that has none', async () => {
    // An administrative borrowing ban is issued against the account, not
    // against something borrowed, so there is nothing to show photos of.
    const row = appealRow();
    const prisma = {
      appealInfo: {
        findUnique: jest.fn().mockResolvedValue({
          ...row,
          OriginalPenaltyInfo: {
            ...row.OriginalPenaltyInfo,
            UsageKey: null,
            Usage: null,
          },
        }),
      },
    };
    const { service } = build(prisma);

    const appeal = await service.getById(SUPERVISOR, 9);

    expect(appeal.penalty.usageKey).toBeNull();
  });
});
