import { PrismaService } from '../../src/prisma.service';
import {
  listItemsInput,
  paginatedItems,
  availabilityOutput,
  itemDetail,
  itemTypeDetail,
} from '../../src/item/item.schema';
import { requestFixture } from '../fixtures/loan-request';
import {
  inHistoryFixture,
  requireIsolatedDatabase,
  transactionClient,
} from '../fixtures/borrower-history';
import { freezeBusinessDate } from '../fixtures/business-clock';
import { withOutputContracts } from '../fixtures/output-contracts';
import {
  catalogContracts,
  managementContracts,
} from '../fixtures/service-contracts';
import { ItemService } from '../../src/item/item.service';
import { sqlAggregates } from '../../src/item/light-row.testing';
import { ItemManagementService } from '../../src/item/item.management.service';
import type { TrpcUser } from '../../src/trpc/context';
import type { UsageStatus } from '../../src/common/schemas/status.schema';
import type {
  ItemTypeRow,
  ItemUnitRow,
} from '../../src/common/mappers/item.mapper';

const borrower: TrpcUser = {
  accountKey: 11,
  role: 'borrower',
  facultyKey: null,
  creditScore: 100,
};
const staff: TrpcUser = { ...borrower, role: 'staff' };
const due = new Date('2026-09-28T09:00:00.000Z');

type FixtureUnit = ItemUnitRow & {
  ItemKey: number;
  Resource: ItemUnitRow['Resource'] & {
    ResourceKey: number;
    ManagedBy: number;
    Eligibilities: { GroupKey: number; RoleKey: number }[];
  };
};

function unit(resourceKey: number, status?: UsageStatus): FixtureUnit {
  return {
    IndivKey: resourceKey,
    ItemKey: 7,
    ResourceKey: resourceKey,
    ItemID: `MM-${resourceKey}`,
    ImageURL: null,
    Resource: {
      ResourceKey: resourceKey,
      ResourceStatus: status === 'Lended' ? 'Lended' : 'InStorage',
      AllowBorrow: true,
      BufferTime: 2,
      ManagedBy: 8,
      BorrowRuleInfo: { RuleName: 'T1' },
      CurrentCondition: null,
      ManagementGroup: {
        ManageGroupKey: 8,
        GroupType: 'Faculty',
        Branch: { BranchName: 'Engineering' },
        Club: null,
      },
      UsageLogs: status ? [{ CurrentStatus: status, DueTime: due }] : [],
      Eligibilities: [{ GroupKey: 8, RoleKey: 1 }],
    },
  };
}

function harness(items: ReturnType<typeof unit>[]) {
  const row = {
    ItemKey: 7,
    ItemName: 'Multimeter',
    ItemDesc: null,
    ImageURL: null,
    CreditWeight: 1,
    Items: items,
    _count: { Items: items.length },
  } satisfies ItemTypeRow & { _count: { Items: number } };
  const prisma = {
    itemInfo: { findUnique: jest.fn().mockResolvedValue(row) },
    authority: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ ManageGroupKey: 8, AuthorityRoleKey: 1 }]),
    },
    // getAvailability is one SQL query; this is what it returns for the fixture.
    $queryRaw: jest.fn().mockResolvedValue([
      {
        found: true,
        total: items.length,
        available: items.filter(
          (u) =>
            u.Resource.ResourceStatus === 'InStorage' &&
            u.Resource.AllowBorrow &&
            u.Resource.UsageLogs.length === 0,
        ).length,
        readyAt: sqlAggregates(items).readyAt,
      },
    ]),
  };
  const scope = {
    resourceScope: jest.fn().mockResolvedValue({ ManagedBy: { in: [8] } }),
  };
  const images = { toPublicUrl: jest.fn((value: string | null) => value) };
  return {
    prisma,
    catalog: withOutputContracts(
      new ItemService(prisma as never),
      catalogContracts,
    ),
    inventory: withOutputContracts(
      new ItemManagementService(
        prisma as never,
        scope as never,
        images as never,
        { record: jest.fn() } as never,
        {} as never,
      ),
      managementContracts,
    ),
  };
}

describe('PDF pp. 13 and 15: borrower/staff availability parity', () => {
  it.each<UsageStatus>(['Pending', 'Prepared', 'Lended', 'Returned'])(
    'counts a %s unit as held on both sides',
    async (status) => {
      const { catalog, inventory, prisma } = harness([
        unit(1),
        unit(2, status),
      ]);
      const borrowerItem = itemDetail.parse(await catalog.getById(borrower, 7));
      const staffItem = itemTypeDetail.parse(
        await inventory.getManagedItemById(staff, 7),
      );
      const badge = availabilityOutput.parse(await catalog.getAvailability(7));
      expect(borrowerItem).toMatchObject({ availableUnits: 1, totalUnits: 2 });
      expect(staffItem).toMatchObject({ availableUnits: 1, totalUnits: 2 });
      expect(badge).toMatchObject({ availableUnits: 1, totalUnits: 2 });
      const [query] = prisma.$queryRaw.mock.calls[0] as [
        { values: unknown[]; sql: string },
      ];
      expect(query.values).toEqual(
        expect.arrayContaining([
          'Pending',
          'Prepared',
          'Lended',
          'Returned',
          7,
        ]),
      );
      expect(query.sql).toContain('"ResourceStatus"');
      expect(query.sql).toContain('"AllowBorrow"');
      // Check the actual database selects too; a fixture with held loans alone
      // cannot catch a query that accidentally stops selecting Prepared rows.
      for (const [input] of prisma.itemInfo.findUnique.mock.calls as Array<
        [
          {
            select: {
              Items: {
                select: {
                  Resource: {
                    select: {
                      UsageLogs: { where: { CurrentStatus: { in: string[] } } };
                    };
                  };
                };
              };
            };
          },
        ]
      >) {
        expect(
          input.select.Items.select.Resource.select.UsageLogs.where
            .CurrentStatus.in,
        ).toEqual(['Pending', 'Prepared', 'Lended', 'Returned']);
      }
    },
  );

  it('reports a real next-available date when every unit is held, including preparation time', async () => {
    const { catalog } = harness([unit(1, 'Prepared'), unit(2, 'Lended')]);
    const item = await catalog.getById(borrower, 7);
    expect(item).toMatchObject({
      availableUnits: 0,
      totalUnits: 2,
      nextAvailableAt: '2026-09-30T09:00:00.000Z',
    });
    expect(await catalog.getAvailability(7)).toMatchObject({
      nextAvailableAt: item.nextAvailableAt,
    });
  });

  it('does not invent a next-available date for returned units awaiting inspection', async () => {
    const { catalog, inventory } = harness([unit(1, 'Returned')]);
    expect(await catalog.getById(borrower, 7)).toMatchObject({
      availableUnits: 0,
      nextAvailableAt: null,
    });
    expect(await inventory.getManagedItemById(staff, 7)).toMatchObject({
      availableUnits: 0,
    });
  });
});

// Real service/adapter assertions share this module's suite; setup is scoped.
describe('Persisted business records', () => {
  const NOW = new Date('2031-09-26T03:00:00Z');

  const start = '2031-09-27T03:00:00.000Z';

  const end = '2031-09-29T03:00:00.000Z';

  describe('FR-BRW-01/02 / FR-EQP-07: catalogue availability for selected dates', () => {
    let prisma: PrismaService;
    beforeAll(async () => {
      requireIsolatedDatabase();
      prisma = new PrismaService();
      await prisma.$connect();
    });
    afterAll(async () => prisma?.$disconnect());
    beforeEach(() => freezeBusinessDate(NOW));
    afterEach(() => jest.useRealTimers());

    it.each([
      ['Approved', '2031-09-28T03:00:00Z', '2031-09-30T03:00:00Z', 0, 1],
      ['Pending', '2031-09-28T03:00:00Z', '2031-09-30T03:00:00Z', 0, 1],
      ['Rejected', '2031-09-28T03:00:00Z', '2031-09-30T03:00:00Z', 0, 2],
      ['Canceled', '2031-09-28T03:00:00Z', '2031-09-30T03:00:00Z', 0, 2],
      ['Approved', '2031-09-26T03:00:00Z', start, 0, 2],
      ['Approved', end, '2031-09-30T03:00:00Z', 0, 2],
      ['Approved', '2031-09-29T15:00:00Z', '2031-09-30T03:00:00Z', 1, 1],
    ] as const)(
      'shows %s booking %s–%s with prep=%s as %s free units',
      async (status, bookedStart, bookedEnd, prep, available) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await requestFixture(tx, 'T2', 2);
          await tx.resourceInfo.update({
            where: { ResourceKey: f.units[0].ResourceKey },
            data: { BufferTime: prep },
          });
          await tx.reservations.create({
            data: {
              ResourceKey: f.units[0].ResourceKey,
              ReservedBy: f.users[1].accountKey,
              StartTime: new Date(bookedStart),
              EndTime: new Date(bookedEnd),
              ApproveStatus: status,
              ActionTime: NOW,
              ReservationExpiration: new Date(end),
            },
          });
          const result = paginatedItems.parse(
            await new ItemService(transactionClient(tx)).list(
              f.users[0],
              listItemsInput.parse({
                q: f.item.ItemName!,
                startTime: start,
                endTime: end,
                availableOnly: true,
              }),
            ),
          );
          expect(result.total).toBe(1);
          expect(result.items).toHaveLength(1);
          expect(result.items[0]).toMatchObject({
            id: f.item.ItemKey,
            totalUnits: 2,
            availableUnits: available,
            eligible: true,
          });
        });
      },
    );

    it('omits a type when none of its units is free over the requested dates', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await requestFixture(tx);
        await tx.reservations.create({
          data: {
            ResourceKey: f.units[0].ResourceKey,
            ReservedBy: f.users[1].accountKey,
            StartTime: new Date(start),
            EndTime: new Date(end),
            ApproveStatus: 'Approved',
            ActionTime: NOW,
            ReservationExpiration: new Date(end),
          },
        });
        const result = await new ItemService(transactionClient(tx)).list(
          f.users[0],
          listItemsInput.parse({
            q: f.item.ItemName!,
            startTime: start,
            endTime: end,
            availableOnly: true,
          }),
        );
        expect(result).toMatchObject({ total: 0, items: [], nextCursor: null });
      });
    });

    it('does not offer a withdrawn unit even when no reservation overlaps', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await requestFixture(tx, 'T2', 2);
        await tx.resourceInfo.update({
          where: { ResourceKey: f.units[0].ResourceKey },
          data: { AllowBorrow: false },
        });
        const result = await new ItemService(transactionClient(tx)).list(
          f.users[0],
          listItemsInput.parse({
            q: f.item.ItemName!,
            startTime: start,
            endTime: end,
          }),
        );
        expect(result.items[0]).toMatchObject({
          totalUnits: 2,
          availableUnits: 1,
        });
      });
    });

    it('continues a selected-date search with a cursor without duplicating or skipping a type', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await requestFixture(tx);
        const other = await tx.itemInfo.create({
          data: { ItemName: `${f.item.ItemName} second`, CreditWeight: 1 },
        });
        await tx.resourceInfo.create({
          data: {
            ManagedBy: f.group.ManageGroupKey,
            BorrowRule: f.rule.BorrowRuleKey,
            BufferTime: 0,
            ResourceType: 'Item',
            ResourceStatus: 'InStorage',
            AllowBorrow: true,
            Item: {
              create: { ItemKey: other.ItemKey, ItemID: 'CURSOR-SECOND' },
            },
            Eligibilities: {
              create: {
                GroupKey: f.group.ManageGroupKey,
                RoleKey: f.authorityRole.AuthorityRoleKey,
              },
            },
          },
        });
        const service = new ItemService(transactionClient(tx));
        const query = {
          q: f.item.ItemName!,
          startTime: start,
          endTime: end,
          sort: 'name' as const,
          pageSize: 1,
        };
        const first = await service.list(
          f.users[0],
          listItemsInput.parse(query),
        );
        expect(first.total).toBe(2);
        expect(first.items).toHaveLength(1);
        expect(first.nextCursor).not.toBeNull();
        const second = await service.list(
          f.users[0],
          listItemsInput.parse({ ...query, cursor: first.nextCursor }),
        );
        expect(second.items).toHaveLength(1);
        expect(
          new Set([...first.items, ...second.items].map((row) => row.id)),
        ).toEqual(new Set([f.item.ItemKey, other.ItemKey]));
        expect(second.nextCursor).toBeNull();
      });
    });

    it('treats percent and underscore in a search as literal characters', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await requestFixture(tx);
        const name = `${f.item.ItemName}_%`;
        await tx.itemInfo.update({
          where: { ItemKey: f.item.ItemKey },
          data: { ItemName: name },
        });
        await tx.itemInfo.create({
          data: { ItemName: `${f.item.ItemName}XX`, CreditWeight: 1 },
        });
        const result = await new ItemService(transactionClient(tx)).list(
          f.users[0],
          listItemsInput.parse({ q: name }),
        );
        expect(result.items.map((row) => row.id)).toEqual([f.item.ItemKey]);
        expect(result.total).toBe(1);
      });
    });

    it('reports actual historical borrow count for a type without reducing currently available stock', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await requestFixture(tx, 'T2', 2);
        const condition = await tx.conditionLog.create({
          data: {
            ResourceKey: f.units[0].ResourceKey,
            LoggedBy: f.users[0].accountKey,
            Condition: 'Normal',
            LoggedAt: new Date(NOW.getTime() - 6 * 86_400_000),
          },
        });
        for (const days of [5, 3]) {
          await tx.usageLog.create({
            data: {
              ResourceKey: f.units[0].ResourceKey,
              AccountKey: f.users[0].accountKey,
              CurrentStatus: 'Inspected',
              CheckoutCondition: condition.ConditionKey,
              CheckInCondition: condition.ConditionKey,
              CheckoutTime: new Date(NOW.getTime() - days * 86_400_000),
              DueTime: new Date(NOW.getTime() - (days - 1) * 86_400_000),
              CheckInTime: new Date(NOW.getTime() - (days - 1) * 86_400_000),
            },
          });
        }
        const result = await new ItemService(transactionClient(tx)).list(
          f.users[0],
          listItemsInput.parse({ q: f.item.ItemName! }),
        );
        expect(result.items[0]).toMatchObject({
          id: f.item.ItemKey,
          borrowCount: 2,
          totalUnits: 2,
          availableUnits: 2,
        });
      });
    });
  });
});
