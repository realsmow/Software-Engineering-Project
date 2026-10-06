import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PrismaService } from '../../src/prisma.service';
import {
  createIsolatedDatabase,
  type IsolatedTestDatabase,
} from '../fixtures/isolated-database';
import { StaffScopeService } from '../../src/common/authority/staff-scope.service';
import { AuditService } from '../../src/common/audit/audit.service';
import { BusinessError } from '../../src/common/errors/business-error';
import { ItemManagementService } from '../../src/item/item.management.service';
import {
  createItemUnitInput,
  itemUnitOutput,
  type CreateItemUnitInput,
} from '../../src/item/item.schema';
import type { ImageService } from '../../src/image/image.service';
import type { NotificationService } from '../../src/notification/notification.service';
import type { TrpcUser } from '../../src/trpc/context';

/**
 * P2: serial uniqueness within a type, with two staff and two real DB clients.
 * The barrier delays real duplicate-check results; it never invents a result
 * or mocks an insert. Both SELECTs finish before either request can write.
 * These transactions must be independent, not nested in a rollback fixture.
 * Expected-defect assertions run only after setup, writes and DB readback
 * succeed in beforeEach, so a broken database/setup cannot count as proof.
 */
function readBarrier() {
  let arrivals = 0;
  let release!: () => void;
  let abort!: (error: Error) => void;
  const opened = new Promise<void>((resolve, reject) => {
    release = resolve;
    abort = reject;
  });
  // Attach a handler even if both real queries fail before reaching wait().
  void opened.catch(() => undefined);
  const timeout = setTimeout(
    () =>
      abort(new Error('Both real duplicate checks did not reach the barrier')),
    5_000,
  );
  return {
    async wait() {
      arrivals += 1;
      if (arrivals === 2) {
        clearTimeout(timeout);
        release();
      }
      await opened;
    },
    dispose: () => clearTimeout(timeout),
  };
}

type Observation = {
  scenario: string;
  staffAccountKeys: number[];
  duplicateChecks?: { client: number; found: boolean }[];
  fulfilled: number;
  rejected: number;
  rejectionCodes: string[];
  units: {
    IndivKey: number;
    ItemKey: number;
    ItemID: string;
    ResourceKey: number;
  }[];
  duplicateSerials: {
    itemKey: number;
    serialNo: string;
    resourceKeys: number[];
  }[];
  resourceCount: number;
  orphanResources: number;
  auditCount: number;
};

describe('FR-EQP-02 / P2: serial uniqueness with concurrent staff registration', () => {
  let prisma: PrismaService;
  let database: IsolatedTestDatabase | undefined;
  let clients: PrismaService[] = [];
  let services: ItemManagementService[];
  let fixture:
    | {
        groupKey: number;
        itemKeys: number[];
        ruleKeys: number[];
        roleKey: number;
        authorityRoleKey: number;
        users: TrpcUser[];
      }
    | undefined;
  let databaseVersion: string;
  let indexes: { indexname: string; indexdef: string }[];
  const evidence: Observation[] = [];

  beforeAll(async () => {
    database = await createIsolatedDatabase('serial');
    prisma = database.client;
    clients = [database.createClient(), database.createClient()];
    await Promise.all([prisma, ...clients].map((client) => client.$connect()));
    const versions = await prisma.$queryRaw<
      { version: string }[]
    >`SELECT version()`;
    databaseVersion = versions[0].version;
    indexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename = 'ItemIndiv'
      ORDER BY indexname
    `;
    services = clients.map(
      (client) =>
        new ItemManagementService(
          client,
          new StaffScopeService(client),
          {
            toStoredUrl: (value?: string) => value ?? null,
            toPublicUrl: (value: string | null) => value,
          } as ImageService,
          new AuditService(client),
          {} as NotificationService,
        ),
    );
  }, 60_000);

  beforeEach(async () => {
    fixture = await prisma.$transaction(async (tx) => {
      const token = `serial-race-${randomUUID()}`;
      const group = await tx.managementGroup.create({
        data: { GroupType: 'Faculty' },
      });
      const role = await tx.roleInfo.create({ data: { RoleName: 'staff' } });
      const authorityRole = await tx.authorityRole.create({
        data: { AuthorityName: token, AuthorityLevel: 1 },
      });
      const accounts = await Promise.all(
        ['a', 'b'].map((name) =>
          tx.accountInfo.create({
            data: {
              Email: `${name}.${token}@example.test`,
              UserID: `${name}.${token}`,
              HashedPassword: 'unused-integration-test-hash',
              UserFName: name,
              UserLName: 'Serial test',
              RoleKey: role.RoleKey,
              UserCredit: 100,
            },
          }),
        ),
      );
      await tx.authority.createMany({
        data: accounts.map((account) => ({
          AccountKey: account.AccountKey,
          ManageGroupKey: group.ManageGroupKey,
          AuthorityRoleKey: authorityRole.AuthorityRoleKey,
        })),
      });
      const rules = await Promise.all(
        ['T0', 'T1', 'T2'].map((RuleName) =>
          tx.borrowRule.create({ data: { RuleName } }),
        ),
      );
      const items = await Promise.all(
        ['a', 'b'].map((name) =>
          tx.itemInfo.create({
            data: { ItemName: `${token}-${name}`, CreditWeight: 10 },
          }),
        ),
      );
      return {
        groupKey: group.ManageGroupKey,
        itemKeys: items.map((item) => item.ItemKey),
        ruleKeys: rules.map((rule) => rule.BorrowRuleKey),
        roleKey: role.RoleKey,
        authorityRoleKey: authorityRole.AuthorityRoleKey,
        users: accounts.map((account): TrpcUser => ({
          accountKey: account.AccountKey,
          role: 'staff',
          facultyKey: null,
          creditScore: 100,
        })),
      };
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (!fixture) return;
    const f = fixture;
    fixture = undefined;
    // Only this fixture's committed rows; teardown runs after failed assertions too.
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({
        where: { ActorKey: { in: f.users.map((u) => u.accountKey) } },
      });
      await tx.eligibility.deleteMany({
        where: { Resource: { ManagedBy: f.groupKey } },
      });
      await tx.itemIndiv.deleteMany({ where: { ItemKey: { in: f.itemKeys } } });
      await tx.resourceInfo.deleteMany({ where: { ManagedBy: f.groupKey } });
      await tx.itemInfo.deleteMany({ where: { ItemKey: { in: f.itemKeys } } });
      await tx.authority.deleteMany({ where: { ManageGroupKey: f.groupKey } });
      await tx.accountInfo.deleteMany({
        where: { AccountKey: { in: f.users.map((u) => u.accountKey) } },
      });
      await tx.authorityRole.delete({
        where: { AuthorityRoleKey: f.authorityRoleKey },
      });
      await tx.roleInfo.delete({ where: { RoleKey: f.roleKey } });
      await tx.managementGroup.delete({
        where: { ManageGroupKey: f.groupKey },
      });
      await tx.borrowRule.deleteMany({
        where: { BorrowRuleKey: { in: f.ruleKeys } },
      });
    });
  });

  afterAll(async () => {
    await database?.dispose();
    const reportPath = process.env.SERIAL_TEST_REPORT;
    if (reportPath) {
      mkdirSync(dirname(reportPath), { recursive: true });
      writeFileSync(
        reportPath,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            environment:
              'Local isolated PostgreSQL / backend service integration',
            build: process.env.SERIAL_TEST_BUILD ?? 'not specified',
            browser: 'N/A (not a browser test)',
            node: process.version,
            databaseVersion,
            itemIndivIndexes: indexes,
            limitation:
              'Real services and independent DB transactions; duplicate-check reads are synchronized by a test barrier. No production/staging or UI execution.',
            observations: evidence,
            completedCases: evidence.length,
            confirmedDuplicateCases: evidence.filter(
              (row) => row.duplicateSerials.length > 0,
            ).length,
          },
          null,
          2,
        ) + '\n',
      );
    }
  }, 15_000);

  function input(overrides: Partial<CreateItemUnitInput> = {}) {
    return createItemUnitInput.parse({
      itemKey: fixture!.itemKeys[0],
      manageGroupKey: fixture!.groupKey,
      tier: 'T2',
      serialNo: 'SERIAL-SAME-001',
      quantity: 1,
      ...overrides,
    });
  }

  async function snapshot(
    scenario: string,
    results: PromiseSettledResult<unknown>[],
  ) {
    const units = await prisma.itemIndiv.findMany({
      where: { ItemKey: { in: fixture!.itemKeys } },
      select: {
        IndivKey: true,
        ItemKey: true,
        ItemID: true,
        ResourceKey: true,
      },
      orderBy: { IndivKey: 'asc' },
    });
    const resourceCount = await prisma.resourceInfo.count({
      where: { ManagedBy: fixture!.groupKey },
    });
    const auditCount = await prisma.auditLog.count({
      where: {
        ActorKey: { in: fixture!.users.map((user) => user.accountKey) },
        Action: 'create',
      },
    });
    const rejected = results.filter((result) => result.status === 'rejected');
    const serialGroups = new Map<
      string,
      Observation['duplicateSerials'][number]
    >();
    for (const unit of units) {
      const key = JSON.stringify([unit.ItemKey, unit.ItemID]);
      const group = serialGroups.get(key) ?? {
        itemKey: unit.ItemKey,
        serialNo: unit.ItemID,
        resourceKeys: [],
      };
      group.resourceKeys.push(unit.ResourceKey);
      serialGroups.set(key, group);
    }
    const observation: Observation = {
      scenario,
      staffAccountKeys: fixture!.users.map((user) => user.accountKey),
      fulfilled: results.length - rejected.length,
      rejected: rejected.length,
      rejectionCodes: rejected.map((result) =>
        result.reason instanceof BusinessError
          ? result.reason.businessCode
          : String(result.reason),
      ),
      units,
      duplicateSerials: [...serialGroups.values()].filter(
        (group) => group.resourceKeys.length > 1,
      ),
      resourceCount,
      orphanResources: resourceCount - units.length,
      auditCount,
    };
    evidence.push(observation);
    return observation;
  }

  async function concurrent(scenario: string, inputs: CreateItemUnitInput[]) {
    const gate = readBarrier();
    const reads: { client: number; found: boolean }[] = [];
    const spies = clients.map((client, index) => {
      const read = client.itemIndiv.findFirst.bind(client.itemIndiv);
      return jest
        .spyOn(client.itemIndiv, 'findFirst')
        .mockImplementationOnce((async (args) => {
          const row = await read(args);
          reads.push({ client: index, found: row !== null });
          await gate.wait();
          return row;
        }) as typeof client.itemIndiv.findFirst);
    });
    try {
      const results = await Promise.allSettled(
        inputs.map((request, index) =>
          services[index].createItemUnits(fixture!.users[index], request),
        ),
      );
      // Infrastructure and unexpected service errors must fail normally, outside it.failing.
      for (const result of results) {
        if (result.status === 'fulfilled')
          itemUnitOutput.strict().array().parse(result.value);
        else if (
          !(result.reason instanceof BusinessError) ||
          result.reason.businessCode !== 'SERIAL_ALREADY_IN_USE'
        )
          throw result.reason;
      }
      expect(reads).toHaveLength(2);
      expect(reads.every((read) => !read.found)).toBe(true);
      const actual = await snapshot(scenario, results);
      actual.duplicateChecks = reads;
      const returnedKeys = results.flatMap((result) =>
        result.status === 'fulfilled'
          ? itemUnitOutput
              .array()
              .parse(result.value)
              .map((unit) => unit.resourceKey)
          : [],
      );
      expect(
        actual.units.map((unit) => unit.ResourceKey).sort((a, b) => a - b),
      ).toEqual(returnedKeys.sort((a, b) => a - b));
      expect(actual.auditCount).toBe(actual.fulfilled);
      return actual;
    } finally {
      gate.dispose();
      spies.forEach((spy) => spy.mockRestore());
    }
  }

  it('rejects a sequential duplicate with SERIAL_ALREADY_IN_USE and no orphan resource', async () => {
    const first = itemUnitOutput
      .array()
      .parse(await services[0].createItemUnits(fixture!.users[0], input()));
    const second = await Promise.allSettled([
      services[1].createItemUnits(fixture!.users[1], input()),
    ]);
    expect(second[0]).toMatchObject({
      status: 'rejected',
      reason: {
        businessCode: 'SERIAL_ALREADY_IN_USE',
        code: 'CONFLICT',
        details: { itemKey: fixture!.itemKeys[0], serialNo: 'SERIAL-SAME-001' },
      },
    });
    const actual = await snapshot('sequential duplicate / T2', [
      { status: 'fulfilled', value: first },
      ...second,
    ]);
    expect(actual).toMatchObject({
      fulfilled: 1,
      rejected: 1,
      resourceCount: 1,
      orphanResources: 0,
      auditCount: 1,
    });
    expect(actual.units).toHaveLength(1);
  });

  it('allows two different serials in the same type concurrently', async () => {
    const actual = await concurrent('different serials / same type / T2', [
      input(),
      input({ serialNo: 'SERIAL-OTHER-002' }),
    ]);
    expect(actual).toMatchObject({
      fulfilled: 2,
      rejected: 0,
      resourceCount: 2,
      orphanResources: 0,
    });
    expect(new Set(actual.units.map((unit) => unit.ItemID)).size).toBe(2);
  });

  it('allows the same serial in different types concurrently', async () => {
    const actual = await concurrent('same serial / different types / T2', [
      input(),
      input({ itemKey: fixture!.itemKeys[1] }),
    ]);
    expect(actual).toMatchObject({
      fulfilled: 2,
      rejected: 0,
      resourceCount: 2,
      orphanResources: 0,
    });
    expect(new Set(actual.units.map((unit) => unit.ItemKey)).size).toBe(2);
    expect(new Set(actual.units.map((unit) => unit.ItemID)).size).toBe(1);
  });

  describe.each(['T2', 'T0', 'T1'] as const)('concurrent save / %s', (tier) => {
    let actual: Observation;
    beforeEach(async () => {
      const request = input({
        tier,
        serialNo: tier === 'T2' ? 'SERIAL-SAME-001' : undefined,
      });
      actual = await concurrent(
        `same type / ${tier} / ${tier === 'T2' ? 'typed serial' : 'generated tag'}`,
        [request, request],
      );
    });

    // Fixed by the unique index on (ItemKey, ItemID) (#136).
    it('never persists duplicate serials and reports any refused write as a serial conflict', () => {
      expect(actual.duplicateSerials).toEqual([]);
      expect(actual.orphanResources).toBe(0);
      expect(actual.resourceCount).toBe(actual.fulfilled);
      expect(actual.fulfilled).toBeGreaterThanOrEqual(1);
      expect(actual.rejectionCodes).toEqual(
        Array(actual.rejected).fill('SERIAL_ALREADY_IN_USE'),
      );
      if (tier === 'T2') {
        expect(actual).toMatchObject({
          fulfilled: 1,
          rejected: 1,
          resourceCount: 1,
        });
      }
      // For generated tags either retrying with fresh unique numbers, or
      // refusing a conflicting write with the business error, is acceptable.
    });
  });
});
