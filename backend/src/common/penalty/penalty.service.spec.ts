import { PenaltyService } from './penalty.service';
import type { PrismaService } from '../../prisma.service';

/**
 * Pure-arithmetic tests: no database, only the one lookup stubbed.
 *
 * Formula cases use the proposal's worked rules (§5.7). A matching PenaltyRule
 * supplies both the deduction rate and its separately configured duration.
 * These are the figures a borrower will dispute and the ones an appeal is argued
 * against — a silent change to any of them is a change to the regulations.
 */

/** Prisma stub whose only job is to answer "is there a PenaltyRule row?". */
function serviceWithRule(
  rule: { PenaltyAmount: number; PenaltyLength: number } | null,
) {
  const prisma = {
    penaltyRule: { findUnique: jest.fn().mockResolvedValue(rule) },
  } as unknown as PrismaService;

  return new PenaltyService(prisma);
}

describe('PenaltyService.quoteDamage', () => {
  it('charges nothing for fair wear (B0)', async () => {
    const quote = await serviceWithRule(null).quoteDamage(1, 10, 'B0');

    expect(quote.amount).toBe(0);
    expect(quote.lengthDays).toBe(0);
  });

  it('scales the deduction by the item credit weight (B1 = weight x 1)', async () => {
    const quote = await serviceWithRule(null).quoteDamage(1, 5, 'B1');

    expect(quote).toMatchObject({
      reason: 'DamagedItem',
      amount: 5,
      lengthDays: 10,
    });
  });

  it('uses the B2 multiplier of 3 and a penalty lasting twice the points', async () => {
    const quote = await serviceWithRule(null).quoteDamage(1, 10, 'B2');

    expect(quote.amount).toBe(30);
    expect(quote.lengthDays).toBe(60);
  });

  it('files B3 as a broken item rather than ordinary damage', async () => {
    const quote = await serviceWithRule(null).quoteDamage(1, 10, 'B3');

    expect(quote).toMatchObject({
      reason: 'BrokenItem',
      amount: 50,
      lengthDays: 100,
    });
  });

  it('uses the configured deduction amount', async () => {
    const quote = await serviceWithRule({
      PenaltyAmount: 7,
      PenaltyLength: 3,
    }).quoteDamage(1, 10, 'B2');

    expect(quote).toMatchObject({
      amount: 7,
      lengthDays: 3,
      source: 'PenaltyRule',
    });
  });

  it('ignores a configured rule for B0 — fair wear is never charged', async () => {
    const quote = await serviceWithRule({
      PenaltyAmount: 7,
      PenaltyLength: 3,
    }).quoteDamage(1, 10, 'B0');

    expect(quote.amount).toBe(0);
  });
});

describe('PenaltyService.quoteLate', () => {
  it('charges nothing when the item came back on time', async () => {
    const quote = await serviceWithRule(null).quoteLate(1, 10, 0);

    expect(quote.amount).toBe(0);
  });

  it('charges (credit weight / 7) per overdue day, rounded up', async () => {
    // 10/7 = 1.43 per day, three days late -> 4.28 -> 5 points.
    const quote = await serviceWithRule(null).quoteLate(1, 10, 3);

    expect(quote).toMatchObject({
      reason: 'ReturnLate',
      amount: 5,
      lengthDays: 10,
    });
  });

  it('multiplies a configured per-day rule by the days late', async () => {
    const quote = await serviceWithRule({
      PenaltyAmount: 2,
      PenaltyLength: 14,
    }).quoteLate(1, 10, 4);

    expect(quote).toMatchObject({
      amount: 8,
      lengthDays: 14,
      source: 'PenaltyRule',
    });
  });
});

describe('PenaltyService.quoteLost', () => {
  it('charges the late days plus a full B3 write-off', async () => {
    // 7 days at 10/7 = 10, plus 10 x 5 = 50.
    const quote = await serviceWithRule(null).quoteLost(1, 10, 7);

    expect(quote).toMatchObject({
      reason: 'LostItem',
      amount: 60,
      lengthDays: 120,
    });
  });

  it('still charges the write-off when the loss is reported before the due date', async () => {
    const quote = await serviceWithRule(null).quoteLost(1, 10, -3);

    expect(quote).toMatchObject({ amount: 50, lengthDays: 100 });
  });
});

// QA acceptance: use PenaltyLength only when the borrowing rule AND reason
// match; otherwise use the formula's deducted points * 2 days.
describe.each([
  {
    kind: 'late',
    reason: 'ReturnLate',
    amount: 8,
    formulaAmount: 6,
    configuredLength: 14,
  },
  {
    kind: 'lost',
    reason: 'LostItem',
    amount: 12,
    formulaAmount: 60,
    configuredLength: 3,
  },
  {
    kind: 'damage',
    reason: 'DamagedItem',
    amount: 7,
    formulaAmount: 30,
    configuredLength: 3,
  },
  {
    kind: 'broken',
    reason: 'BrokenItem',
    amount: 7,
    formulaAmount: 50,
    configuredLength: 3,
  },
])(
  '$kind penalty duration: configured rule or formula',
  ({ kind, reason, amount, formulaAmount, configuredLength }) => {
    it.each([
      {
        label: 'matching rule',
        storedBorrowRule: 1,
        storedReason: reason,
        matches: true,
      },
      {
        label: 'rule for a different borrowing rule',
        storedBorrowRule: 2,
        storedReason: reason,
        matches: false,
      },
      {
        label: 'rule for a different penalty reason',
        storedBorrowRule: 1,
        storedReason: 'MissAppointment',
        matches: false,
      },
    ])(
      'uses the correct duration with $label',
      async ({ storedBorrowRule, storedReason, matches }) => {
        const rule = {
          PenaltyAmount: kind === 'late' ? 2 : amount,
          PenaltyLength: configuredLength,
        };
        // Model only the compound-key lookup. Actual amount/duration arithmetic
        // and selection of the requested reason stay in the real service.
        const findUnique = jest.fn(
          async (args: {
            where: {
              BorrowRuleKey_PenaltyReason: {
                BorrowRuleKey: number;
                PenaltyReason: string;
              };
            };
          }) => {
            const key = args.where.BorrowRuleKey_PenaltyReason;
            return key.BorrowRuleKey === storedBorrowRule &&
              key.PenaltyReason === storedReason
              ? rule
              : null;
          },
        );
        const svc = new PenaltyService({
          penaltyRule: { findUnique },
        } as unknown as PrismaService);
        const quote =
          kind === 'late'
            ? await svc.quoteLate(1, 10, 4)
            : kind === 'lost'
              ? await svc.quoteLost(1, 10, 7)
              : await svc.quoteDamage(1, 10, kind === 'broken' ? 'B3' : 'B2');
        expect(findUnique).toHaveBeenCalledWith({
          where: {
            BorrowRuleKey_PenaltyReason: {
              BorrowRuleKey: 1,
              PenaltyReason: reason,
            },
          },
          select: { PenaltyAmount: true, PenaltyLength: true },
        });
        expect(quote).toEqual({
          reason,
          amount: matches ? amount : formulaAmount,
          lengthDays: matches ? configuredLength : formulaAmount * 2,
          source: matches ? 'PenaltyRule' : 'proposal-formula',
        });
      },
    );
  },
);

describe('PenaltyService.apply', () => {
  const quote = {
    reason: 'DamagedItem' as const,
    amount: 12,
    lengthDays: 24,
    source: 'proposal-formula' as const,
  };

  function transactionStub() {
    return {
      $queryRaw: jest.fn().mockResolvedValue([]),
      penaltyInfo: {
        create: jest.fn().mockResolvedValue({ PenaltyKey: 99 }),
        // The new 12-point penalty is the only one in force.
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { CreditDeducted: 12 } }),
      },
      accountInfo: { update: jest.fn().mockResolvedValue({}) },
    };
  }

  it('writes nothing at all for a zero-point quote', async () => {
    const tx = transactionStub();

    const result = await serviceWithRule(null).apply(
      tx as never,
      { ...quote, amount: 0, lengthDays: 0 },
      { accountKey: 1, usageKey: 2, effectiveFrom: new Date() },
    );

    expect(result).toBeNull();
    expect(tx.penaltyInfo.create).not.toHaveBeenCalled();
    expect(tx.accountInfo.update).not.toHaveBeenCalled();
  });

  it('recomputes the score from the penalties in force (FR-CRD-06)', async () => {
    // The account row is locked before summing, so two penalties landing in
    // the same moment both count.
    const tx = transactionStub();

    await serviceWithRule(null).apply(tx as never, quote, {
      accountKey: 1,
      usageKey: 2,
      effectiveFrom: new Date('2569-08-20T10:00:00Z'),
    });

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.accountInfo.update).toHaveBeenCalledWith({
      where: { AccountKey: 1 },
      data: { UserCredit: 88 },
    });
  });

  it('expires a resolved penalty lengthDays after the supplied term start', async () => {
    const tx = transactionStub();

    await serviceWithRule(null).apply(tx as never, quote, {
      accountKey: 1,
      usageKey: 2,
      effectiveFrom: new Date('2026-08-01T00:00:00Z'),
    });

    expect(tx.penaltyInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // This primitive receives a resolved term start. Whether a loan has
        // actually been returned/reported is covered by persistence tests.
        data: expect.objectContaining({
          ExpirationTime: new Date('2026-08-25T00:00:00Z'),
          InEffect: true,
        }) as unknown,
      }),
    );
  });
});

describe('PenaltyService.overdueDays', () => {
  const service = serviceWithRule(null);

  it('is zero for a return before the deadline', () => {
    expect(
      service.overdueDays(
        new Date('2026-08-20T10:00:00Z'),
        new Date('2026-08-19T09:00:00Z'),
      ),
    ).toBe(0);
  });

  it('rounds a part-day late up to a whole day', () => {
    // The due instant is the counter's closing time, so an hour past it is
    // already a day late at the desk.
    expect(
      service.overdueDays(
        new Date('2026-08-20T10:00:00Z'),
        new Date('2026-08-20T11:00:00Z'),
      ),
    ).toBe(1);
  });

  it('counts whole days exactly', () => {
    expect(
      service.overdueDays(
        new Date('2026-08-20T10:00:00Z'),
        new Date('2026-08-23T10:00:00Z'),
      ),
    ).toBe(3);
  });
});
