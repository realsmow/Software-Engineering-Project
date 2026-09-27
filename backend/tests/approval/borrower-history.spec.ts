import { ApprovalService } from '../../src/approval/approval.service';
import { borrowerHistoryOutput } from '../../src/approval/approval.schema';
import { StaffScopeService } from '../../src/common/authority/staff-scope.service';
import type { TrpcUser } from '../../src/trpc/context';

const NOW = new Date('2031-09-26T00:00:00.000Z');
const DAY = 86_400_000;
const STAFF: TrpcUser = {
  accountKey: 20,
  role: 'staff',
  facultyKey: null,
  creditScore: 100,
};

function loan(usageKey: number, due = NOW, returned: Date | null = NOW) {
  return {
    UsageKey: usageKey,
    CheckoutTime: new Date(NOW.getTime() - usageKey * DAY),
    CheckInTime: returned,
    DueTime: due,
    CurrentStatus: returned ? 'Inspected' : 'Lended',
    Resource: {
      Item: { ItemID: `OSC-${usageKey}`, Item: { ItemName: 'Oscilloscope' } },
      Room: null,
    },
  };
}

function setup() {
  const prisma = {
    authority: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ ManageGroupKey: 8 }, { ManageGroupKey: 9 }]),
    },
    reservations: { count: jest.fn().mockResolvedValue(1) },
    usageLog: { findMany: jest.fn().mockResolvedValue([]) },
    inspection: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new ApprovalService(
    prisma as never,
    new StaffScopeService(prisma as never),
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { prisma, service };
}

describe('FR-APV-01 borrower history boundaries', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('returns an empty, schema-valid history for a borrower with no past loans', async () => {
    const { service } = setup();
    expect(
      borrowerHistoryOutput
        .strict()
        .parse(await service.borrowerHistory(STAFF, 42)),
    ).toEqual({
      totalLoans: 0,
      lateReturns: 0,
      damageIncidents: 0,
      lastDamageDate: null,
      items: [],
    });
  });

  it('limits displayed loans to 50 without truncating totals or late returns', async () => {
    const { service, prisma } = setup();
    prisma.usageLog.findMany.mockResolvedValue(
      Array.from({ length: 55 }, (_, index) =>
        loan(index + 1, index === 54 ? new Date(NOW.getTime() - DAY) : NOW),
      ),
    );
    const history = borrowerHistoryOutput
      .strict()
      .parse(await service.borrowerHistory(STAFF, 42));
    expect(history.totalLoans).toBe(55);
    expect(history.lateReturns).toBe(1);
    expect(history.items).toHaveLength(50);
    expect(history.items.every((item) => item.overdueDays === 0)).toBe(true);
    expect(prisma.usageLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AccountKey: 42 },
        orderBy: { CheckoutTime: 'desc' },
      }),
    );
  });

  it('uses the return time or the current time for active loans and rounds a partial late day upward', async () => {
    const { service, prisma } = setup();
    prisma.usageLog.findMany.mockResolvedValue([
      loan(1, new Date(NOW.getTime() - 1), NOW),
      loan(2, new Date(NOW.getTime() - DAY - 1), null),
      loan(3, new Date(NOW.getTime() + DAY), null),
      {
        ...loan(4, new Date(NOW.getTime() - DAY), null),
        CurrentStatus: 'Prepared',
      },
    ]);
    const history = borrowerHistoryOutput
      .strict()
      .parse(await service.borrowerHistory(STAFF, 42));
    expect(history.items.map((item) => item.overdueDays)).toEqual([1, 2, 0, 0]);
    expect(history.lateReturns).toBe(2);
    expect(history.items[1].returnedAt).toBeNull();
  });

  it.each(['staff', 'supervisor'] as const)(
    'checks every department of a %s before reading history',
    async (role) => {
      const { service, prisma } = setup();
      await service.borrowerHistory({ ...STAFF, role }, 42);
      expect(prisma.reservations.count).toHaveBeenCalledWith({
        where: { ReservedBy: 42, Resource: { ManagedBy: { in: [8, 9] } } },
      });
    },
  );

  it('lets admin read a borrower without a department request', async () => {
    const { service, prisma } = setup();
    prisma.reservations.count.mockResolvedValue(0);
    await service.borrowerHistory({ ...STAFF, role: 'admin' }, 42);
    expect(prisma.authority.findMany).not.toHaveBeenCalled();
    expect(prisma.reservations.count).not.toHaveBeenCalled();
    expect(prisma.usageLog.findMany).toHaveBeenCalled();
  });

  it('refuses an unassigned staff account before reading borrower data', async () => {
    const { service, prisma } = setup();
    prisma.authority.findMany.mockResolvedValue([]);
    await expect(service.borrowerHistory(STAFF, 42)).rejects.toMatchObject({
      businessCode: 'NO_MANAGEMENT_SCOPE',
    });
    expect(prisma.reservations.count).not.toHaveBeenCalled();
    expect(prisma.usageLog.findMany).not.toHaveBeenCalled();
    expect(prisma.inspection.findMany).not.toHaveBeenCalled();
  });
});
