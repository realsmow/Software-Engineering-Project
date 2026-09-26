import { Logger } from '@nestjs/common';
import { CronService } from '../../src/cron/cron.service';

describe('scheduled loan and credit operations', () => {
  const now = new Date('2031-09-26T00:00:00Z');
  function harness() {
    const tx = {
      usageLog: { update: jest.fn().mockResolvedValue({}) },
      resourceInfo: { update: jest.fn().mockResolvedValue({}) },
      penaltyInfo: {
        update: jest.fn().mockResolvedValue({}),
        aggregate: jest.fn().mockResolvedValue({ _sum: { CreditDeducted: 7 } }),
      },
      accountInfo: { update: jest.fn().mockResolvedValue({}) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      usageLog: { findMany: jest.fn().mockResolvedValue([]) },
      penaltyInfo: { findMany: jest.fn().mockResolvedValue([]) },
      cronRunLog: {
        create: jest.fn().mockResolvedValue({ RunKey: 19 }),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (work: (client: typeof tx) => unknown) =>
        work(tx),
      ),
    };
    const penalties = {
      overdueDays: jest.fn().mockReturnValue(15),
      quoteLate: jest.fn().mockResolvedValue({ amount: 5 }),
      quoteLost: jest.fn().mockResolvedValue({ amount: 30 }),
      apply: jest.fn().mockResolvedValue({}),
    };
    const notifications = {
      syncDueReminders: jest.fn().mockResolvedValue(undefined),
      returnToReceive: jest.fn().mockResolvedValue(undefined),
    };
    return {
      prisma,
      tx,
      penalties,
      notifications,
      service: new CronService(
        prisma as never,
        penalties as never,
        notifications as never,
      ),
    };
  }
  const loan = {
    UsageKey: 41,
    AccountKey: 7,
    DueTime: new Date('2031-09-10T10:00:00Z'),
    Resource: {
      ResourceKey: 9,
      BorrowRule: 2,
      ManagedBy: 3,
      Item: { Item: { CreditWeight: 4, ItemName: 'Meter' } },
      Room: null,
    },
  };
  beforeEach(() => jest.useFakeTimers({ now }));
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('charges only unbilled overdue loans and records a successful run', async () => {
    const h = harness();
    h.prisma.usageLog.findMany.mockResolvedValue([loan]);
    expect(await h.service.run('markOverdue')).toMatchObject({ affected: 1 });
    expect(h.prisma.usageLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          CurrentStatus: 'Lended',
          DueTime: { lt: now },
          Penalties: { none: { Reason: { startsWith: 'ReturnLate' } } },
        },
      }),
    );
    expect(h.penalties.quoteLate).toHaveBeenCalledWith(2, 4, 15);
    expect(h.penalties.apply).toHaveBeenCalledWith(
      h.tx,
      { amount: 5 },
      expect.objectContaining({
        accountKey: 7,
        usageKey: 41,
        effectiveFrom: now,
      }),
    );
    expect(h.prisma.cronRunLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ Result: 'success', Affected: 1 }),
      }),
    );
  });

  it('does not charge a zero penalty or an empty overdue queue', async () => {
    const h = harness();
    h.prisma.usageLog.findMany.mockResolvedValueOnce([
      {
        ...loan,
        Resource: { ...loan.Resource, Item: null, Room: { CreditWeight: 2 } },
      },
    ]);
    h.penalties.quoteLate.mockResolvedValue({ amount: 0 });
    expect(await h.service.run('markOverdue')).toMatchObject({ affected: 0 });
    expect(h.penalties.quoteLate).toHaveBeenCalledWith(2, 2, 15);
    expect(h.penalties.apply).not.toHaveBeenCalled();
    expect(await h.service.run('markOverdue')).toMatchObject({ affected: 0 });
  });

  it('writes off only loans beyond the 14-day boundary and marks their resources missing in one transaction', async () => {
    const h = harness();
    h.prisma.usageLog.findMany.mockResolvedValue([loan]);
    expect(await h.service.run('markLost')).toMatchObject({ affected: 1 });
    expect(h.prisma.usageLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          CurrentStatus: 'Lended',
          DueTime: { lt: new Date('2031-09-12T00:00:00Z') },
        },
      }),
    );
    expect(h.tx.usageLog.update).toHaveBeenCalledWith({
      where: { UsageKey: 41 },
      data: { CurrentStatus: 'Returned' },
    });
    expect(h.tx.resourceInfo.update).toHaveBeenCalledWith({
      where: { ResourceKey: 9 },
      data: { ResourceStatus: 'Missing' },
    });
    expect(h.penalties.quoteLost).toHaveBeenCalledWith(2, 4, 15);
    expect(h.penalties.apply).toHaveBeenCalledWith(
      h.tx,
      { amount: 30 },
      expect.objectContaining({ usageKey: 41 }),
    );
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('expires penalties at the boundary and recomputes credit from remaining active deductions', async () => {
    const h = harness();
    h.prisma.penaltyInfo.findMany.mockResolvedValue([
      { PenaltyKey: 5, AccountKey: 7, CreditDeducted: 12 },
    ]);
    expect(await h.service.run('expireDemerits')).toMatchObject({
      affected: 1,
    });
    expect(h.prisma.penaltyInfo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { InEffect: true, ExpirationTime: { lte: now } },
      }),
    );
    expect(h.tx.penaltyInfo.update).toHaveBeenCalledWith({
      where: { PenaltyKey: 5 },
      data: { InEffect: false },
    });
    expect(h.tx.$queryRaw).toHaveBeenCalled();
    expect(h.tx.accountInfo.update).toHaveBeenCalledWith({
      where: { AccountKey: 7 },
      data: { UserCredit: 93 },
    });
    expect(h.tx.penaltyInfo.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ AccountKey: 7, InEffect: true }),
      }),
    );
  });

  it('reminds each borrower once and routes upcoming returns to the owning department', async () => {
    const h = harness();
    h.prisma.usageLog.findMany
      .mockResolvedValueOnce([{ AccountKey: 7 }, { AccountKey: 8 }])
      .mockResolvedValueOnce([loan]);
    expect(await h.service.run('dueSoonReminder')).toMatchObject({
      affected: 2,
    });
    expect(h.prisma.usageLog.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ distinct: ['AccountKey'] }),
    );
    expect(h.notifications.syncDueReminders.mock.calls).toEqual([[7], [8]]);
    expect(h.notifications.returnToReceive).toHaveBeenCalledWith(h.prisma, {
      manageGroupKey: 3,
      usageKey: 41,
      itemName: 'Meter',
      due: loan.DueTime,
    });
  });

  it('records a manual job failure and reports it to the caller', async () => {
    const h = harness();
    h.prisma.usageLog.findMany.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(h.service.run('markLost')).rejects.toThrow(
      'database unavailable',
    );
    expect(h.prisma.cronRunLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          Result: 'failed',
          Detail: 'database unavailable',
        }),
      }),
    );
  });

  it('logs a scheduled failure without rejecting the scheduler', async () => {
    const h = harness();
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    h.prisma.usageLog.findMany.mockRejectedValue(new Error('offline'));
    await expect(h.service.runScheduled('markLost')).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('markLost failed: offline');
  });

  it('reports only the newest result per job and leaves an unfinished duration null', async () => {
    const h = harness();
    h.prisma.cronRunLog.findMany.mockResolvedValue([
      {
        Job: 'markLost',
        StartedAt: now,
        FinishedAt: new Date(now.getTime() + 25),
        Result: 'success',
      },
      {
        Job: 'markLost',
        StartedAt: new Date('2031-09-25'),
        FinishedAt: null,
        Result: 'failed',
      },
      {
        Job: 'markOverdue',
        StartedAt: now,
        FinishedAt: null,
        Result: 'pending',
      },
    ]);
    const runs = await h.service.lastRuns();
    expect(runs.size).toBe(2);
    expect(runs.get('markLost')).toEqual({
      at: now,
      result: 'success',
      durationMs: 25,
    });
    expect(runs.get('markOverdue')).toEqual({
      at: now,
      result: 'pending',
      durationMs: null,
    });
  });
});
