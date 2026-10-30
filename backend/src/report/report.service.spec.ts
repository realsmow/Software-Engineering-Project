import { ReportService } from './report.service';
import type { PrismaService } from '../prisma.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { TrpcUser } from '../trpc/context';

const user = { accountKey: 1, role: 'admin' } as TrpcUser;

function service(options: {
  groupKeys?: number[] | null;
  groups?: unknown[];
  countsByGroup?: Record<
    number,
    { held: number; out: number; loans: number; overdue: number }
  >;
  units?: unknown[];
  usageCounts?: { ResourceKey: number; _count: { _all: number } }[];
  moves?: {
    CheckoutTime: Date;
    CheckInTime: Date | null;
    CurrentStatus: string;
  }[];
}) {
  const groupKeys = 'groupKeys' in options ? options.groupKeys : null;
  const groups = options.groups ?? [
    {
      ManageGroupKey: 1,
      GroupType: 'Faculty',
      Branch: { BranchName: 'EE' },
      Club: null,
    },
  ];
  const countsByGroup = options.countsByGroup ?? {
    1: { held: 10, out: 5, loans: 20, overdue: 2 },
  };

  const resourceCount = jest.fn().mockImplementation((args: any) => {
    const key = args.where.ManagedBy;
    const c = countsByGroup[key] ?? { held: 0, out: 0 };
    return Promise.resolve(
      args.where.ResourceStatus === 'Lended' ? c.out : c.held,
    );
  });
  const usageCount = jest.fn().mockImplementation((args: any) => {
    const key = args.where.Resource.ManagedBy;
    const c = countsByGroup[key] ?? { loans: 0, overdue: 0 };
    return Promise.resolve(args.where.DueTime ? c.overdue : c.loans);
  });

  const prisma = {
    managementGroup: { findMany: jest.fn().mockResolvedValue(groups) },
    resourceInfo: { count: resourceCount },
    usageLog: {
      count: usageCount,
      groupBy: jest.fn().mockResolvedValue(options.usageCounts ?? []),
      findMany: jest.fn().mockResolvedValue(options.moves ?? []),
    },
    itemIndiv: { findMany: jest.fn().mockResolvedValue(options.units ?? []) },
    inspection: { findMany: jest.fn().mockResolvedValue([]) },
    reservations: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  const staffScope = {
    resolveGroupKeys: jest.fn().mockResolvedValue(groupKeys),
  } as unknown as StaffScopeService;

  return { svc: new ReportService(prisma, staffScope), prisma };
}

describe('summary', () => {
  it('reports unscoped for an admin and totals across departments', async () => {
    const t = service({});
    const result = await t.svc.summary(user, { topLimit: 5 });
    expect(result.unscoped).toBe(true);
    expect(result.totals).toEqual({
      loans: 20,
      overdue: 2,
      unitsHeld: 10,
      unitsOut: 5,
    });
    expect(result.departments[0]).toEqual(
      expect.objectContaining({ name: 'EE', utilization: 50 }),
    );
  });

  it("scopes to the caller's own departments when not admin", async () => {
    const t = service({ groupKeys: [1] });
    const result = await t.svc.summary(user, { topLimit: 5 });
    expect(result.unscoped).toBe(false);
    expect(t.prisma.managementGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ManageGroupKey: { in: [1] } },
      }),
    );
  });

  it('reports zero utilization rather than dividing by zero for an empty shelf', async () => {
    const t = service({
      countsByGroup: { 1: { held: 0, out: 0, loans: 0, overdue: 0 } },
    });
    const result = await t.svc.summary(user, { topLimit: 5 });
    expect(result.departments[0].utilization).toBe(0);
  });

  it('sorts departments by loan volume, busiest first', async () => {
    const t = service({
      groups: [
        {
          ManageGroupKey: 1,
          GroupType: 'Faculty',
          Branch: { BranchName: 'Quiet' },
          Club: null,
        },
        {
          ManageGroupKey: 2,
          GroupType: 'Faculty',
          Branch: { BranchName: 'Busy' },
          Club: null,
        },
      ],
      countsByGroup: {
        1: { held: 10, out: 1, loans: 2, overdue: 0 },
        2: { held: 10, out: 1, loans: 50, overdue: 0 },
      },
    });
    const result = await t.svc.summary(user, { topLimit: 5 });
    expect(result.departments.map((d: any) => d.name)).toEqual([
      'Busy',
      'Quiet',
    ]);
  });

  it('groups top equipment by item type and ranks by borrow count', async () => {
    const t = service({
      units: [
        {
          ItemKey: 1,
          Item: { ItemName: 'Multimeter' },
          Resource: { BorrowRuleInfo: { RuleName: 'T1' } },
          ResourceKey: 100,
        },
        {
          ItemKey: 1,
          Item: { ItemName: 'Multimeter' },
          Resource: { BorrowRuleInfo: { RuleName: 'T1' } },
          ResourceKey: 101,
        },
        {
          ItemKey: 2,
          Item: { ItemName: 'Scope' },
          Resource: { BorrowRuleInfo: { RuleName: 'T2' } },
          ResourceKey: 102,
        },
      ],
      usageCounts: [
        { ResourceKey: 100, _count: { _all: 3 } },
        { ResourceKey: 101, _count: { _all: 2 } },
        { ResourceKey: 102, _count: { _all: 10 } },
      ],
    });
    const result = await t.svc.summary(user, { topLimit: 5 });
    expect(result.topEquipment[0]).toEqual(
      expect.objectContaining({ name: 'Scope', count: 10 }),
    );
    expect(result.topEquipment[1]).toEqual(
      expect.objectContaining({ name: 'Multimeter', count: 5 }),
    );
  });

  it('returns no top equipment when scope holds no units', async () => {
    const t = service({ units: [] });
    const result = await t.svc.summary(user, { topLimit: 5 });
    expect(result.topEquipment).toEqual([]);
  });

  it('caps the top-equipment list at the requested limit', async () => {
    const t = service({
      units: [1, 2, 3].map((k) => ({
        ItemKey: k,
        Item: { ItemName: `Item${k}` },
        Resource: { BorrowRuleInfo: { RuleName: 'T1' } },
        ResourceKey: k,
      })),
      usageCounts: [1, 2, 3].map((k) => ({
        ResourceKey: k,
        _count: { _all: k },
      })),
    });
    const result = await t.svc.summary(user, { topLimit: 2 });
    expect(result.topEquipment).toHaveLength(2);
  });

  it('counts handovers and returns per Bangkok day for the trend chart', async () => {
    jest.useFakeTimers({
      now: new Date('2031-09-30T05:00:00Z'),
      doNotFake: ['nextTick', 'setImmediate'],
    });
    try {
      const t = service({
        moves: [
          // 29 Sep Bangkok: out 09:00, back 30 Sep 10:00.
          {
            CheckoutTime: new Date('2031-09-29T02:00:00Z'),
            CheckInTime: new Date('2031-09-30T03:00:00Z'),
            CurrentStatus: 'Returned',
          },
          // 23:30 UTC on 29 Sep is already 30 Sep in Bangkok.
          {
            CheckoutTime: new Date('2031-09-29T23:30:00Z'),
            CheckInTime: null,
            CurrentStatus: 'Lended',
          },
          // A Prepared loan's time is the planned pickup, not a handover.
          {
            CheckoutTime: new Date('2031-09-30T04:00:00Z'),
            CheckInTime: null,
            CurrentStatus: 'Prepared',
          },
        ],
      });
      const { daily } = await t.svc.summary(user, { topLimit: 5 });
      expect(daily).toHaveLength(30);
      expect(daily.at(-1)).toEqual({
        day: '2031-09-30',
        borrowed: 1,
        returned: 1,
      });
      expect(daily.at(-2)).toEqual({
        day: '2031-09-29',
        borrowed: 1,
        returned: 0,
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ReportService.records', () => {
  it('flattens a returned loan with its penalties, scoped to the staff departments', async () => {
    const t = (s: string) => new Date(s);
    const reservations = {
      findMany: jest.fn().mockResolvedValue([
        {
          ReservationKey: 7,
          ActionTime: t('2026-10-01T02:00:00Z'),
          StartTime: t('2026-10-02T03:00:00Z'),
          EndTime: t('2026-10-04T10:00:00Z'),
          Reason: 'lab',
          ApproveStatus: 'Approved',
          AutoApproved: true,
          DecisionNote: null,
          ReservedByUser: { UserID: 'anan.s', UserFName: 'A', UserLName: 'S' },
          ApprovedByUser: null,
          Resource: {
            ResourceType: 'Item',
            Item: { ItemID: 'EE-DMM-002', Item: { ItemName: 'Meter' } },
            Room: null,
            ManagementGroup: { Branch: { BranchName: 'EE' }, Club: null },
          },
          UsageLogs: [
            {
              CurrentStatus: 'Inspected',
              CheckoutTime: t('2026-10-02T03:00:00Z'),
              DueTime: t('2026-10-04T10:00:00Z'),
              CheckInTime: t('2026-10-06T10:00:00Z'),
              CheckInConditionLog: { Condition: 'MinorDamage' },
              Penalties: [
                { CreditDeducted: 1, Reason: 'ReturnLate: overdue 2d' },
                { CreditDeducted: 2, Reason: 'DamagedItem: scratch' },
              ],
            },
          ],
        },
      ]),
    };
    const resourceInfo = { findMany: jest.fn().mockResolvedValue([]) };
    const svc = new ReportService(
      { reservations, resourceInfo } as unknown as PrismaService,
      {
        resolveGroupKeys: jest.fn().mockResolvedValue([2]),
      } as unknown as StaffScopeService,
    );

    const out = await svc.records(user, { days: 90 });

    expect(out.unscoped).toBe(false);
    expect(reservations.findMany.mock.calls[0][0].where.Resource).toEqual({
      ManagedBy: { in: [2] },
    });
    expect(out.requests[0]).toMatchObject({
      borrowerId: 'anan.s',
      borrowerName: 'A S',
      tag: 'EE-DMM-002',
      department: 'EE',
      decidedBy: 'auto',
      loanStatus: 'Inspected',
      returnCondition: 'MinorDamage',
      penaltyPoints: 3,
      penaltyReasons: 'ReturnLate: overdue 2d; DamagedItem: scratch',
    });
  });
});
