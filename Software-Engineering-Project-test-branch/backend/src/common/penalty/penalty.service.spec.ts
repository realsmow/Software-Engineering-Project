import { PenaltyService } from './penalty.service';
import type { PrismaService } from '../../prisma.service';

/**
 * Pure-arithmetic tests: no database, only the one lookup stubbed.
 *
 * The numbers here are the proposal's own worked rules (§5.7), because these
 * are the figures a borrower will dispute and the ones an appeal is argued
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

  it('prefers a configured PenaltyRule over the formula', async () => {
    // What admin.updateLendingSettings writes has to win, or tuning the rules
    // in the admin screen would appear to do nothing.
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

    expect(quote).toMatchObject({ reason: 'ReturnLate', amount: 5 });
  });

  it('multiplies a configured per-day rule by the days late', async () => {
    const quote = await serviceWithRule({
      PenaltyAmount: 2,
      PenaltyLength: 14,
    }).quoteLate(1, 10, 4);

    expect(quote).toMatchObject({ amount: 8, lengthDays: 14 });
  });
});

describe('PenaltyService.quoteLost', () => {
  it('charges the late days plus a full B3 write-off', async () => {
    // 7 days at 10/7 = 10, plus 10 x 5 = 50.
    const quote = await serviceWithRule(null).quoteLost(1, 10, 7);

    expect(quote).toMatchObject({ reason: 'LostItem', amount: 60 });
  });

  it('still charges the write-off when the loss is reported before the due date', async () => {
    const quote = await serviceWithRule(null).quoteLost(1, 10, -3);

    expect(quote.amount).toBe(50);
  });
});

describe('PenaltyService.apply', () => {
  const quote = {
    reason: 'DamagedItem' as const,
    amount: 12,
    lengthDays: 24,
    source: 'proposal-formula' as const,
  };

  function transactionStub() {
    return {
      penaltyInfo: { create: jest.fn().mockResolvedValue({ PenaltyKey: 99 }) },
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

  it('decrements the score instead of overwriting it', async () => {
    // Two penalties landing in the same moment must both bite; a read-then-write
    // would let the second one erase the first.
    const tx = transactionStub();

    await serviceWithRule(null).apply(tx as never, quote, {
      accountKey: 1,
      usageKey: 2,
      effectiveFrom: new Date('2569-08-20T10:00:00Z'),
    });

    expect(tx.accountInfo.update).toHaveBeenCalledWith({
      where: { AccountKey: 1 },
      data: { UserCredit: { decrement: 12 } },
    });
  });

  it('expires the penalty lengthDays after it takes effect', async () => {
    const tx = transactionStub();

    await serviceWithRule(null).apply(tx as never, quote, {
      accountKey: 1,
      usageKey: 2,
      effectiveFrom: new Date('2026-08-01T00:00:00Z'),
    });

    expect(tx.penaltyInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // 12 points -> 24 days, counted from the moment it took effect.
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
