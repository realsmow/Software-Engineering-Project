import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import { removeDemo, seedDemo } from '../../src/demo/demo-seed';
import { purge } from '../../src/demo/purge';
import { findTestData } from '../../src/cleanup-test-data';

/** Only names with "test" go; admins, other departments and other loans stay. */
describe('cleanup of test data', () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    requireIsolatedDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  // Leave no demo data behind for the other demo suite, even on failure.
  afterEach(async () => {
    await removeDemo(prisma, () => {}).catch(() => {});
  });

  it('removes what is named test, with its history, and nothing else', async () => {
    await seedDemo(prisma, { password: 'demo-password-1', log: () => {} });
    const account = (userId: string) =>
      prisma.accountInfo.findUniqueOrThrow({ where: { UserID: userId } });

    // The multimeter carries the overdue and damaged loans and their penalties.
    const meter = await prisma.itemInfo.findFirstOrThrow({
      where: { ItemName: { contains: 'Fluke' } },
    });
    await prisma.itemInfo.update({
      where: { ItemKey: meter.ItemKey },
      data: { ItemName: 'Test-Multimeter' },
    });
    const arduino = await prisma.itemInfo.findFirstOrThrow({
      where: { ItemName: { contains: 'Arduino' } },
      select: { Items: { select: { ResourceKey: true } } },
    });
    const arduinoLoans = await prisma.usageLog.count({
      where: { ResourceKey: { in: arduino.Items.map((u) => u.ResourceKey) } },
    });
    await prisma.accountInfo.update({
      where: { UserID: 'demo.admin' },
      data: { UserFName: 'Test admin' },
    });
    await prisma.accountInfo.update({
      where: { UserID: 'demo.student4' },
      data: { UserID: 'tester04' },
    });
    const emptyDept = await prisma.managementGroup.create({
      data: {
        GroupType: 'Faculty',
        Branch: {
          create: {
            BranchName: 'test_dep',
            FacultyKey: (await prisma.facultyInfo.findFirstOrThrow())
              .FacultyKey,
          },
        },
      },
    });
    const busyClub = await prisma.managementGroup.create({
      data: { GroupType: 'Club', Club: { create: { ClubName: 'test_club' } } },
    });
    const clubUnit = await prisma.resourceInfo.findUniqueOrThrow({
      where: { ResourceKey: arduino.Items[4].ResourceKey },
      select: { ResourceKey: true, ManagedBy: true },
    });
    await prisma.resourceInfo.update({
      where: { ResourceKey: clubUnit.ResourceKey },
      data: { ManagedBy: busyClub.ManageGroupKey },
    });
    expect((await account('demo.student3')).UserCredit).toBeLessThan(100);

    const found = await findTestData(prisma);
    expect(found.items.map((i) => i.ItemName)).toEqual(['Test-Multimeter']);
    expect(found.accounts.map((a) => a.UserID)).toEqual(['tester04']);
    expect(found.removableGroups.map((g) => g.ManageGroupKey)).toEqual([
      emptyDept.ManageGroupKey,
    ]);
    expect(found.keptGroups.map((g) => g.ManageGroupKey)).toEqual([
      busyClub.ManageGroupKey,
    ]);

    const result = await prisma.$transaction((tx) => purge(tx, found.target), {
      timeout: 60_000,
    });
    expect(result.creditRecalculated).toBeGreaterThan(0);

    expect(
      await prisma.itemInfo.count({ where: { ItemKey: meter.ItemKey } }),
    ).toBe(0);
    expect(
      await prisma.accountInfo.count({ where: { UserID: 'tester04' } }),
    ).toBe(0);
    expect(
      await prisma.accountInfo.count({ where: { UserID: 'demo.admin' } }),
    ).toBe(1);
    expect(
      await prisma.managementGroup.count({
        where: { ManageGroupKey: emptyDept.ManageGroupKey },
      }),
    ).toBe(0);
    expect(
      await prisma.managementGroup.count({
        where: { ManageGroupKey: busyClub.ManageGroupKey },
      }),
    ).toBe(1);
    // Loans of other equipment are untouched, except the tester's own ones.
    const arduinoAfter = await prisma.usageLog.count({
      where: { ResourceKey: { in: arduino.Items.map((u) => u.ResourceKey) } },
    });
    expect(arduinoAfter).toBeLessThanOrEqual(arduinoLoans);
    expect(arduinoAfter).toBeGreaterThan(0);
    // Their penalties went with the multimeter, so their credit is back.
    expect((await account('demo.student3')).UserCredit).toBe(100);

    // The demo can still be removed after part of it was cleaned up.
    await prisma.resourceInfo.update({
      where: { ResourceKey: clubUnit.ResourceKey },
      data: { ManagedBy: clubUnit.ManagedBy },
    });
    await prisma.clubInfo.delete({
      where: { ManageGroupKey: busyClub.ManageGroupKey },
    });
    await prisma.managementGroup.delete({
      where: { ManageGroupKey: busyClub.ManageGroupKey },
    });
    await removeDemo(prisma, () => {});
  }, 180_000);
});
