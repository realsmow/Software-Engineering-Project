import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import { ReportService } from '../../src/report/report.service';
import { reportSummaryOutput } from '../../src/report/report.schema';
import { StaffScopeService } from '../../src/common/authority/staff-scope.service';
import { workHours } from '../../src/common/schemas/datetime.schema';
import { historyFixture, inHistoryFixture } from '../fixtures/borrower-history';
import { freezeBusinessDate } from '../fixtures/business-clock';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = new Date('2031-09-26T03:00:00.000Z'); // 10:00 Bangkok, inside room opening hours.

describe('FR-ADM-06: reports aggregated from persisted rows', () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    requireIsolatedDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(() => freezeBusinessDate(NOW));
  afterEach(() => jest.useRealTimers());

  it('ranks equipment types by usage across their units and limits totals to the caller scope', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await historyFixture(tx);
      const foreign = await historyFixture(tx);
      const original = await tx.itemIndiv.findUniqueOrThrow({
        where: { ResourceKey: f.resource.ResourceKey },
      });
      const sibling = await tx.resourceInfo.create({
        data: {
          ManagedBy: f.group.ManageGroupKey,
          BorrowRule: f.rule.BorrowRuleKey,
          BufferTime: 0,
          ResourceType: 'Item',
          ResourceStatus: 'Lended',
          AllowBorrow: true,
          Item: {
            create: { ItemKey: original.ItemKey, ItemID: 'report-sibling' },
          },
        },
      });
      const other = await tx.resourceInfo.create({
        data: {
          ManagedBy: f.group.ManageGroupKey,
          BorrowRule: f.rule.BorrowRuleKey,
          BufferTime: 0,
          ResourceType: 'Item',
          ResourceStatus: 'Lended',
          AllowBorrow: true,
          Item: {
            create: {
              ItemID: 'report-other',
              Item: { create: { ItemName: 'Less borrowed', CreditWeight: 1 } },
            },
          },
        },
      });
      for (const [resourceKey, status, due] of [
        [sibling.ResourceKey, 'Lended', NOW.getTime() - 1],
        [sibling.ResourceKey, 'Inspected', NOW.getTime() - DAY],
        [other.ResourceKey, 'Lended', NOW.getTime()],
      ] as const) {
        const checkoutAt = new Date(
          NOW.getTime() - (status === 'Inspected' ? 2 * DAY : DAY / 2),
        );
        const condition = await tx.conditionLog.create({
          data: {
            ResourceKey: resourceKey,
            LoggedBy: f.inspector.AccountKey,
            Condition: 'Normal',
            LoggedAt: checkoutAt,
          },
        });
        await tx.usageLog.create({
          data: {
            ResourceKey: resourceKey,
            AccountKey: f.borrower.AccountKey,
            CheckoutCondition: condition.ConditionKey,
            CurrentStatus: status,
            CheckoutTime: checkoutAt,
            DueTime: new Date(due),
            ...(status === 'Inspected'
              ? {
                  CheckInTime: new Date(due),
                  CheckInCondition: condition.ConditionKey,
                }
              : {}),
          },
        });
      }
      const service = new ReportService(
        f.client,
        new StaffScopeService(f.client),
      );
      const report = reportSummaryOutput
        .strict()
        .parse(await service.summary(f.decider, { topLimit: 1 }));
      expect(report).toMatchObject({
        generatedAt: NOW.toISOString(),
        unscoped: false,
        totals: { loans: 4, overdue: 1, unitsHeld: 3, unitsOut: 2 },
        departments: [
          {
            manageGroupKey: f.group.ManageGroupKey,
            loans: 4,
            overdue: 1,
            unitsHeld: 3,
            unitsOut: 2,
            utilization: 67,
          },
        ],
        topEquipment: [{ itemKey: original.ItemKey, tier: 'T2', count: 3 }],
      });
      expect(report.departments).toHaveLength(1);
      expect(report.topEquipment).toHaveLength(1);
      expect(
        report.departments.some(
          (row) => row.manageGroupKey === foreign.group.ManageGroupKey,
        ),
      ).toBe(false);
    });
  });

  it('includes damage at the 30-day cutoff but excludes older and out-of-scope inspections', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await historyFixture(tx);
      await historyFixture(tx); // A different department's recent damage must not count.
      const item = await tx.itemIndiv.findUniqueOrThrow({
        where: { ResourceKey: f.resource.ResourceKey },
      });
      for (const [condition, offset] of [
        ['Normal', 30 * DAY],
        ['MinorDamage', 30 * DAY - 1],
        ['Broken', 30 * DAY + 1],
        ['Missing', DAY],
      ] as const) {
        const at = new Date(NOW.getTime() - offset);
        const resource = await tx.resourceInfo.create({
          data: {
            ManagedBy: f.group.ManageGroupKey,
            BorrowRule: f.rule.BorrowRuleKey,
            BufferTime: 0,
            ResourceType: 'Item',
            ResourceStatus: condition === 'Missing' ? 'Missing' : 'InStorage',
            AllowBorrow: condition === 'Normal' || condition === 'MinorDamage',
            Item: {
              create: {
                ItemKey: item.ItemKey,
                ItemID: `${f.borrower.UserID}-${condition}`,
              },
            },
          },
        });
        const log = await tx.conditionLog.create({
          data: {
            ResourceKey: resource.ResourceKey,
            LoggedBy: f.inspector.AccountKey,
            Condition: condition,
            LoggedAt: at,
          },
        });
        const checkoutAt = new Date(at.getTime() - DAY / 2);
        const before = await tx.conditionLog.create({
          data: {
            ResourceKey: resource.ResourceKey,
            LoggedBy: f.inspector.AccountKey,
            Condition: 'Normal',
            LoggedAt: checkoutAt,
          },
        });
        const usage = await tx.usageLog.create({
          data: {
            ResourceKey: resource.ResourceKey,
            AccountKey: f.borrower.AccountKey,
            CurrentStatus: 'Inspected',
            CheckoutTime: checkoutAt,
            DueTime: at,
            CheckInTime: at,
            CheckoutCondition: before.ConditionKey,
            CheckInCondition: log.ConditionKey,
          },
        });
        await tx.resourceInfo.update({
          where: { ResourceKey: resource.ResourceKey },
          data: { ConditionKey: log.ConditionKey },
        });
        await tx.inspection.create({
          data: {
            UsageKey: usage.UsageKey,
            ResourceKey: resource.ResourceKey,
            InspectorKey: f.inspector.AccountKey,
            ConditionKey: log.ConditionKey,
            ActionTime: at,
          },
        });
      }
      const service = new ReportService(
        f.client,
        new StaffScopeService(f.client),
      );
      const report = reportSummaryOutput
        .strict()
        .parse(await service.summary(f.decider, { topLimit: 10 }));
      expect(report.damage).toEqual([
        { condition: 'Normal', count: 1 },
        { condition: 'MinorDamage', count: 1 },
        { condition: 'MajorDamage', count: 1 },
        { condition: 'Broken', count: 0 },
        { condition: 'Missing', count: 1 },
      ]);
    });
  });

  it('clips approved room bookings to the last 30 days and excludes pending, rejected and foreign bookings', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await historyFixture(tx);
      const foreign = await historyFixture(tx);
      const roomRule = await tx.borrowRule.create({ data: { RuleName: 'T3' } });
      const rooms = await Promise.all(
        [f, foreign, f].map((owner) =>
          tx.resourceInfo.create({
            data: {
              ManagedBy: owner.group.ManageGroupKey,
              BorrowRule: roomRule.BorrowRuleKey,
              BufferTime: 0,
              ResourceType: 'Room',
              ResourceStatus: 'InStorage',
              AllowBorrow: true,
              Room: { create: { RoomName: 'Report room', CreditWeight: 1 } },
            },
          }),
        ),
      );
      const since = NOW.getTime() - 30 * DAY;
      for (const [resourceKey, status, start, end] of [
        [rooms[0].ResourceKey, 'Approved', since - HOUR, since + HOUR],
        [
          rooms[0].ResourceKey,
          'Approved',
          NOW.getTime() - 2 * HOUR,
          NOW.getTime() + HOUR,
        ],
        [rooms[0].ResourceKey, 'Pending', since + DAY, since + DAY + HOUR],
        [
          rooms[0].ResourceKey,
          'Rejected',
          since + 3 * DAY,
          since + 3 * DAY + HOUR,
        ],
        [rooms[2].ResourceKey, 'Approved', since - 2 * HOUR, since],
        [rooms[2].ResourceKey, 'Approved', NOW.getTime(), NOW.getTime() + HOUR],
        [rooms[1].ResourceKey, 'Approved', since + DAY, since + DAY + HOUR],
      ] as const) {
        await tx.reservations.create({
          data: {
            ResourceKey: resourceKey,
            ReservedBy:
              resourceKey === rooms[2].ResourceKey
                ? f.inspector.AccountKey
                : f.borrower.AccountKey,
            ApproveStatus: status,
            AutoApproved: status === 'Approved',
            ApprovedAt: status === 'Approved' ? new Date(start - HOUR) : null,
            StartTime: new Date(start),
            EndTime: new Date(end),
            ReservationExpiration: new Date(end),
            ActionTime: new Date(start - HOUR),
          },
        });
      }
      const service = new ReportService(
        f.client,
        new StaffScopeService(f.client),
      );
      const report = reportSummaryOutput
        .strict()
        .parse(await service.summary(f.decider, { topLimit: 10 }));
      const openHours = 2 * 30 * (workHours.end - workHours.start);
      expect(report.roomUtilization).toEqual({
        rooms: 2,
        bookedHours: 3,
        openHours,
        percent: Math.round(300 / openHours),
      });
    });
  });
});
