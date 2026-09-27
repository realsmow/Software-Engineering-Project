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
import {
  availabilityOutput,
  itemDetail,
  itemTypeDetail,
} from '../../src/item/item.schema';

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
