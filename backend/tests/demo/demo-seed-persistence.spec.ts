import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import { removeDemo, seedDemo } from '../../src/demo/demo-seed';

/**
 * The presentation seed lands every story, and --remove leaves the database
 * exactly as it found it.
 */
describe('demo seed', () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    requireIsolatedDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function rowCounts(): Promise<Record<string, number>> {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'`;
    const counts: Record<string, number> = {};
    for (const { table_name } of tables) {
      const [row] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "${table_name}"`,
      );
      counts[table_name] = Number(row.n);
    }
    return counts;
  }

  it('seeds every scenario and removes all of it again', async () => {
    const before = await rowCounts();
    const lines: string[] = [];
    await seedDemo(prisma, {
      password: 'demo-password-1',
      openDay: '2099-01-10',
      log: (l) => lines.push(l),
    });

    expect(lines.filter((l) => l.includes('skip'))).toEqual([]);
    const accounts = await prisma.accountInfo.findMany({
      where: { UserID: { startsWith: 'demo.' } },
      select: { AccountKey: true, UserID: true, UserCredit: true },
    });
    expect(accounts).toHaveLength(7);
    const keys = accounts.map((a) => a.AccountKey);
    const loans = await prisma.usageLog.groupBy({
      by: ['CurrentStatus'],
      where: { AccountKey: { in: keys } },
      _count: { _all: true },
    });
    expect(
      Object.fromEntries(loans.map((l) => [l.CurrentStatus, l._count._all])),
    ).toEqual({ Lended: 3, Returned: 1, Inspected: 2, Prepared: 1 });
    expect(
      await prisma.reservations.count({
        where: { ReservedBy: { in: keys }, ApproveStatus: 'Pending' },
      }),
    ).toBe(1);
    expect(
      await prisma.appealInfo.count({
        where: { FiledBy: { in: keys }, ApproveStatus: 'Pending' },
      }),
    ).toBe(1);
    expect(
      await prisma.extensionRequest.count({
        where: { RequestedBy: { in: keys }, ApproveStatus: 'Pending' },
      }),
    ).toBe(1);
    // The late, damaged return cost student3 credit.
    expect(
      accounts.find((a) => a.UserID === 'demo.student3')!.UserCredit,
    ).toBeLessThan(100);

    await expect(
      seedDemo(prisma, { password: 'demo-password-1' }),
    ).rejects.toThrow(/already/);

    await removeDemo(prisma, () => {});
    // The overdue job's own run log stays: it really ran.
    const after = await rowCounts();
    expect(after.CronRunLog).toBe(before.CronRunLog + 1);
    expect({ ...after, CronRunLog: 0 }).toEqual({ ...before, CronRunLog: 0 });
  }, 120_000);
});
