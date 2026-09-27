import { InspectionService } from '../../src/inspection/inspection.service';
import {
  inspectionHistoryEntry,
  listInspectionQueueInput,
  listRepairsInput,
  listRoomRoundsInput,
  paginatedInspectionQueue,
  paginatedRepairs,
  paginatedRoomCheckRounds,
} from '../../src/inspection/inspection.schema';
import type { TrpcUser } from '../../src/trpc/context';

const STAFF: TrpcUser = {
  accountKey: 20,
  role: 'staff',
  facultyKey: null,
  creditScore: 100,
};
const NOW = new Date('2031-09-26T00:00:00.000Z');
const RESOURCE = {
  ResourceKey: 7,
  BorrowRule: 3,
  BorrowRuleInfo: { RuleName: 'T2' },
  Item: {
    ItemID: 'OSC-001',
    Item: { ItemName: 'Oscilloscope', CreditWeight: 3 },
  },
  Room: null,
};
function setup() {
  const prisma = {
    usageLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    roomCheckRound: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    repairLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    inspection: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    ),
  };
  const scope = {
    resourceScope: jest.fn().mockResolvedValue({ ManagedBy: { in: [4] } }),
    assertResourceInScope: jest.fn().mockResolvedValue(undefined),
  };
  return {
    prisma,
    scope,
    service: new InspectionService(
      prisma as never,
      scope as never,
      {} as never,
      {} as never,
      {} as never,
    ),
  };
}

describe('InspectionService scoped worklists and unit history', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('keeps department scope when filtering the returned queue by tier and borrower text', async () => {
    const { service, prisma, scope } = setup();
    prisma.usageLog.findMany.mockResolvedValue([
      {
        UsageKey: 42,
        DueTime: new Date('2031-09-24T00:00:00.000Z'),
        CheckInTime: NOW,
        Account: { UserID: 'S123', UserFName: 'Ada', UserLName: 'Lovelace' },
        Resource: RESOURCE,
        CheckoutConditionLog: { Condition: 'Normal' },
        Images: [
          { SubmissionType: 'BeforePicture' },
          { SubmissionType: 'AfterPicture' },
          { SubmissionType: 'InspectionPicture' },
        ],
      },
    ]);
    prisma.usageLog.count.mockResolvedValue(21);
    const result = paginatedInspectionQueue.parse(
      await service.listQueue(
        STAFF,
        listInspectionQueueInput.parse({
          page: 2,
          pageSize: 10,
          tier: 'T2',
          q: 'Ada',
        }),
      ),
    );
    expect(scope.resourceScope).toHaveBeenCalledWith(STAFF);
    const where = expect.objectContaining({
      CurrentStatus: 'Returned',
      Resource: {
        ManagedBy: { in: [4] },
        BorrowRuleInfo: { RuleName: { equals: 'T2', mode: 'insensitive' } },
      },
      OR: expect.any(Array),
    });
    expect(prisma.usageLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: { CheckInTime: 'asc' },
        skip: 10,
        take: 10,
      }),
    );
    expect(prisma.usageLog.count).toHaveBeenCalledWith({ where });
    expect(result).toMatchObject({
      total: 21,
      page: 2,
      pageSize: 10,
      items: [
        {
          borrowerName: 'Ada Lovelace',
          serialNo: 'OSC-001',
          overdueDays: 2,
          beforeImageCount: 1,
          afterImageCount: 1,
        },
      ],
    });
  });

  it('returns a valid empty queue without silently adding a tier or search filter', async () => {
    const { service, prisma } = setup();
    expect(
      paginatedInspectionQueue.parse(
        await service.listQueue(STAFF, listInspectionQueueInput.parse({})),
      ),
    ).toMatchObject({ items: [], total: 0 });
    expect(prisma.usageLog.count).toHaveBeenCalledWith({
      where: {
        CurrentStatus: 'Returned',
        Resource: { ManagedBy: { in: [4] } },
      },
    });
  });

  it.each([true, false])(
    'maps room deadline boundaries and filters openOnly=%s without losing scope',
    async (openOnly) => {
      const { service, prisma } = setup();
      const row = {
        RoundKey: 1,
        ResourceKey: 9,
        OpenedAt: new Date('2031-09-19T00:00:00.000Z'),
        DueAt: NOW,
        ClosedAt: null,
        Condition: null,
        Resource: {
          AllowBorrow: true,
          Room: { RoomName: 'Lab', RoomLocation: 'Building 1' },
        },
      };
      const rows = [
        row,
        { ...row, RoundKey: 2, DueAt: new Date(NOW.getTime() - 1) },
        {
          ...row,
          RoundKey: 3,
          DueAt: new Date(NOW.getTime() - 1),
          ClosedAt: NOW,
          Condition: { Condition: 'Broken', Notes: 'Door' },
          Resource: { AllowBorrow: false, Room: null },
        },
      ];
      prisma.roomCheckRound.findMany.mockResolvedValue(
        openOnly ? rows.slice(0, 2) : rows,
      );
      prisma.roomCheckRound.count.mockResolvedValue(openOnly ? 2 : 3);
      const result = paginatedRoomCheckRounds.parse(
        await service.listRoomRounds(
          STAFF,
          listRoomRoundsInput.parse({ openOnly }),
        ),
      );
      expect(result.items.map((row) => row.overdue)).toEqual(
        openOnly ? [false, true] : [false, true, false],
      );
      if (!openOnly)
        expect(result.items[2]).toMatchObject({
          roomName: null,
          location: null,
          condition: 'Broken',
          note: 'Door',
          stillBookable: false,
        });
      expect(prisma.roomCheckRound.count).toHaveBeenCalledWith({
        where: {
          Resource: { ManagedBy: { in: [4] } },
          ...(openOnly ? { ClosedAt: null } : {}),
        },
      });
      expect(prisma.roomCheckRound.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { DueAt: 'asc' } }),
      );
    },
  );

  it.each([true, false])(
    'maps equipment and room repair history with openOnly=%s',
    async (openOnly) => {
      const { service, prisma } = setup();
      const row = {
        RepairKey: 5,
        ResourceKey: 7,
        BeginRepairDate: NOW,
        EndRepairDate: null,
        RepairedByUser: { UserFName: 'Repair', UserLName: 'Staff' },
        ConditionBefore: { Condition: 'Broken' },
        ConditionAfter: null,
        Resource: RESOURCE,
      };
      const rows = [
        row,
        {
          ...row,
          RepairKey: 6,
          ResourceKey: 9,
          EndRepairDate: NOW,
          ConditionAfter: { Condition: 'Normal' },
          Resource: {
            ...RESOURCE,
            Item: null,
            Room: { RoomName: 'Room A', CreditWeight: 2 },
          },
        },
      ];
      prisma.repairLog.findMany.mockResolvedValue(openOnly ? [row] : rows);
      prisma.repairLog.count.mockResolvedValue(openOnly ? 1 : 2);
      const result = paginatedRepairs.parse(
        await service.listRepairs(STAFF, listRepairsInput.parse({ openOnly })),
      );
      expect(result.items[0]).toMatchObject({
        itemName: 'Oscilloscope',
        serialNo: 'OSC-001',
        conditionAfter: null,
        finishedAt: null,
        repairedByName: 'Repair Staff',
      });
      if (!openOnly)
        expect(result.items[1]).toMatchObject({
          itemName: 'Room A',
          serialNo: null,
          conditionAfter: 'Normal',
          finishedAt: NOW.toISOString(),
        });
      expect(prisma.repairLog.count).toHaveBeenCalledWith({
        where: {
          Resource: { ManagedBy: { in: [4] } },
          ...(openOnly ? { EndRepairDate: null } : {}),
        },
      });
      expect(prisma.repairLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { BeginRepairDate: 'asc' } }),
      );
    },
  );

  it('maps bounded unit damage history including a missing condition with no B0–B3 grade', async () => {
    const { service, prisma, scope } = setup();
    prisma.inspection.findMany.mockResolvedValue([
      {
        InspectionKey: 8,
        UsageKey: 42,
        Notes: null,
        ActionTime: NOW,
        Condition: { Condition: 'Missing' },
        Inspector: { UserFName: 'Other', UserLName: 'Staff' },
        Usage: { Account: { UserID: 'S123' } },
      },
    ]);
    const result = inspectionHistoryEntry
      .array()
      .parse(
        await service.listForResource(STAFF, { resourceKey: 7, limit: 5 }),
      );
    expect(scope.assertResourceInScope).toHaveBeenCalledWith(STAFF, 7);
    expect(prisma.inspection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ResourceKey: 7 },
        take: 5,
        orderBy: { InspectionKey: 'desc' },
      }),
    );
    expect(result[0]).toMatchObject({
      level: null,
      condition: 'Missing',
      inspectedAt: NOW.toISOString(),
      inspectorName: 'Other Staff',
      borrowerStudentId: 'S123',
    });
  });

  it('refuses an out-of-scope history before reading any inspections', async () => {
    const { service, prisma, scope } = setup();
    scope.assertResourceInScope.mockRejectedValue(
      new Error('RESOURCE_OUT_OF_SCOPE'),
    );
    await expect(
      service.listForResource(STAFF, { resourceKey: 99, limit: 20 }),
    ).rejects.toThrow('RESOURCE_OUT_OF_SCOPE');
    expect(prisma.inspection.findMany).not.toHaveBeenCalled();
  });
});
