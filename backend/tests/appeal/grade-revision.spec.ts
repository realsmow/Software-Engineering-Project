import { AppealService } from '../../src/appeal/appeal.service';
import {
  appealOutput,
  decideAppealInput,
} from '../../src/appeal/appeal.schema';
import { PenaltyService } from '../../src/common/penalty/penalty.service';
import { activePenaltyWhere } from '../../src/common/schemas/penalty.schema';
import type { TrpcUser } from '../../src/trpc/context';

const NOW = new Date('2031-09-26T00:00:00.000Z');
const SUPERVISOR: TrpcUser = {
  accountKey: 20,
  role: 'supervisor',
  facultyKey: null,
  creditScore: 100,
};
function setup() {
  const row = {
    AppealKey: 9,
    ApproveStatus: 'Pending',
    FiledBy: 42,
    OriginalPenaltyInfo: {
      PenaltyKey: 55,
      AccountKey: 42,
      UsageKey: 7,
      CreditDeducted: 12,
      Reason: 'DamagedItem',
      ActionTime: NOW,
      ExpirationTime: new Date('2031-10-20T00:00:00.000Z'),
      Usage: {
        ResourceKey: 8,
        Resource: { Item: { Item: { ItemName: 'Scope' } }, Room: null },
      },
    },
    Inspections: [
      {
        InspectorKey: 30,
        Condition: { Condition: 'MajorDamage' },
        Resource: { BorrowRule: 3, Item: { Item: { CreditWeight: 4 } } },
      },
    ],
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    penaltyInfo: {
      update: jest.fn(),
      create: jest.fn().mockResolvedValue({ PenaltyKey: 56 }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { CreditDeducted: 7 } }),
    },
    accountInfo: { update: jest.fn() },
    appealInfo: { update: jest.fn() },
  };
  const prisma = {
    appealInfo: { findUnique: jest.fn().mockResolvedValue(row) },
    penaltyRule: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((work: (client: typeof tx) => Promise<void>) =>
      work(tx),
    ),
  };
  const notifications = { appealApproved: jest.fn() };
  const service = new AppealService(
    prisma as never,
    { assertResourceInScope: jest.fn() } as never,
    notifications as never,
    { record: jest.fn() } as never,
    new PenaltyService(prisma as never),
  );
  // Readback and persistence are covered by the database suite, not fabricated here.
  const readback = jest
    .spyOn(service, 'getById')
    .mockImplementation(async () => {
      const data = tx.appealInfo.update.mock.calls[0][0].data as {
        RevisedCondition: string;
      };
      const revisedGrade = data.RevisedCondition === 'Normal' ? 'B0' : 'B1';
      const ref = {
        accountKey: 42,
        studentId: 'S12345',
        firstName: 'Ada',
        lastName: 'Borrower',
        creditScore: 93,
      };
      const penalty = {
        penaltyKey: 55,
        usageKey: 7,
        reason: 'DamagedItem',
        creditDeducted: 12,
        issuedAt: NOW.toISOString(),
        expiresAt: row.OriginalPenaltyInfo.ExpirationTime.toISOString(),
        inEffect: false,
      };
      return appealOutput.strict().parse({
        appealKey: 9,
        status: 'approved',
        appealReason: 'Review damage',
        filedAt: NOW.toISOString(),
        resolvedAt: NOW.toISOString(),
        filedBy: ref,
        resolvedBy: { ...ref, accountKey: 20 },
        penalty,
        replacementPenalty:
          revisedGrade === 'B0'
            ? null
            : { ...penalty, penaltyKey: 56, creditDeducted: 4, inEffect: true },
        creditRestored: revisedGrade === 'B0' ? 12 : 8,
        inspectorKeys: [30],
        revisedGrade,
        inspection: {
          grade: 'B2',
          notes: null,
          inspectorName: 'Independent Inspector',
          inspectedAt: NOW.toISOString(),
        },
      });
    });
  return { service, row, prisma, tx, notifications, readback };
}

describe('FR-APL-06 revised damage grade edge cases', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('revises B2 to B0 without a replacement penalty and retains unrelated deductions', async () => {
    const { service, tx, notifications } = setup();
    await service.decide(
      SUPERVISOR,
      decideAppealInput.parse({
        appealKey: 9,
        decision: 'approve',
        revisedGrade: 'B0',
      }),
    );
    expect(tx.penaltyInfo.create).not.toHaveBeenCalled();
    expect(tx.appealInfo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          RevisedCondition: 'Normal',
          ApproveStatus: 'Approved',
        }),
      }),
    );
    expect(tx.accountInfo.update).toHaveBeenCalledWith({
      where: { AccountKey: 42 },
      data: { UserCredit: 93 },
    });
    expect(notifications.appealApproved).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ creditRestored: 12 }),
    );
  });

  it('preserves the original penalty dates when replacing it with the lower formula amount', async () => {
    const { service, row, tx } = setup();
    await service.decide(SUPERVISOR, {
      appealKey: 9,
      decision: 'approve',
      revisedGrade: 'B1',
    });
    expect(tx.penaltyInfo.create).toHaveBeenCalledWith({
      data: {
        AccountKey: 42,
        UsageKey: 7,
        Reason: 'DamagedItem',
        CreditDeducted: 4,
        ActionTime: row.OriginalPenaltyInfo.ActionTime,
        ExpirationTime: row.OriginalPenaltyInfo.ExpirationTime,
        Appealed: true,
        InEffect: true,
      },
      select: { PenaltyKey: true },
    });
    // The recompute must sum exactly the penalties the rest of the system
    // calls "in force", whatever that definition currently is - asserting a
    // copy of it here only proved that this file and penalty.schema agreed on
    // the day it was written.
    expect(tx.penaltyInfo.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AccountKey: 42, ...activePenaltyWhere() },
      }),
    );
  });

  it.each([
    'higher grade',
    'missing inspection',
    'ungraded inspection',
    'grade and amount',
    'non-reducing configured price',
  ])('refuses %s before writing any penalty or credit', async (scenario) => {
    const { service, row, prisma, tx, notifications, readback } = setup();
    if (scenario === 'missing inspection') row.Inspections = [];
    if (scenario === 'ungraded inspection')
      row.Inspections[0].Condition.Condition = 'Missing';
    if (scenario === 'non-reducing configured price')
      prisma.penaltyRule.findUnique.mockResolvedValue({
        PenaltyAmount: 12,
        PenaltyLength: 24,
      });
    await expect(
      service.decide(
        SUPERVISOR,
        decideAppealInput.parse({
          appealKey: 9,
          decision: 'approve',
          revisedGrade: scenario === 'higher grade' ? 'B3' : 'B1',
          ...(scenario === 'grade and amount'
            ? { reducedCreditDeducted: 2 }
            : {}),
        }),
      ),
    ).rejects.toMatchObject({ businessCode: 'INVALID_APPEAL_REDUCTION' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.penaltyInfo.update).not.toHaveBeenCalled();
    expect(tx.accountInfo.update).not.toHaveBeenCalled();
    expect(notifications.appealApproved).not.toHaveBeenCalled();
    expect(readback).not.toHaveBeenCalled();
  });
});
