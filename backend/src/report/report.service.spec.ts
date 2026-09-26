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
});
