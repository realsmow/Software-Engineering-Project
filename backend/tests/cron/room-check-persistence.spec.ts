import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import type { Prisma } from '../../src/generated/prisma/client';
import { CronService } from '../../src/cron/cron.service';
import { PenaltyService } from '../../src/common/penalty/penalty.service';
import { NotificationService } from '../../src/notification/notification.service';
import { historyFixture, inHistoryFixture } from '../fixtures/borrower-history';
import { freezeBusinessDate } from '../fixtures/business-clock';

const DAY = 86_400_000;
const NOW = new Date('2031-09-26T00:00:00.000Z');

async function roomFixture(tx: Prisma.TransactionClient, allowBorrow = true) {
  const f = await historyFixture(tx);
  await tx.itemIndiv.delete({ where: { ResourceKey: f.resource.ResourceKey } });
  await tx.borrowRule.update({
    where: { BorrowRuleKey: f.rule.BorrowRuleKey },
    data: { RuleName: 'T3' },
  });
  await tx.resourceInfo.update({
    where: { ResourceKey: f.resource.ResourceKey },
    data: {
      ResourceType: 'Room',
      AllowBorrow: allowBorrow,
      Room: { create: { RoomName: 'Inspection boundary', CreditWeight: 1 } },
    },
  });
  // Preserve the job's real filters and SQL, limiting its sweep to this
  // fixture so parallel suites do not lock or notify the seeded rooms.
  const resourceInfo = new Proxy(f.client.resourceInfo, {
    get(target, property) {
      if (property === 'findMany')
        return (args: Prisma.ResourceInfoFindManyArgs) =>
          tx.resourceInfo.findMany({
            ...args,
            where: {
              AND: [args.where ?? {}, { ResourceKey: f.resource.ResourceKey }],
            },
          });
      return Reflect.get(target, property) as unknown;
    },
  });
  const client = new Proxy(f.client, {
    get(target, property) {
      return property === 'resourceInfo'
        ? resourceInfo
        : (Reflect.get(target, property) as unknown);
    },
  });
  return { ...f, client };
}

describe('FR-RTN-06: persisted room inspection rounds', () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    requireIsolatedDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(() => freezeBusinessDate(NOW));
  afterEach(() => jest.useRealTimers());

  it('opens an overdue round with exactly seven days to inspect and creates no duplicate on rerun', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await roomFixture(tx);
      const closed = new Date(NOW.getTime() - 30 * DAY - 1);
      await tx.roomCheckRound.create({
        data: {
          ResourceKey: f.resource.ResourceKey,
          OpenedAt: new Date(closed.getTime() - DAY),
          DueAt: closed,
          ClosedAt: closed,
        },
      });
      const service = new CronService(
        f.client,
        new PenaltyService(f.client),
        new NotificationService(f.client),
      );
      await service.run('openT3InspectionRounds');
      const rounds = () =>
        tx.roomCheckRound.findMany({
          where: { ResourceKey: f.resource.ResourceKey, ClosedAt: null },
        });
      const opened = await rounds();
      expect(opened).toHaveLength(1);
      expect(opened[0]).toMatchObject({
        OpenedAt: NOW,
        DueAt: new Date(NOW.getTime() + 7 * DAY),
      });
      await service.run('openT3InspectionRounds');
      expect(await rounds()).toEqual(opened);
    });
  });

  it.each([
    { name: 'not yet 30 days old', age: 30 * DAY - 1, allowBorrow: true },
    { name: 'withdrawn from booking', age: 31 * DAY, allowBorrow: false },
  ])('does not open a round for a room $name', async ({ age, allowBorrow }) => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await roomFixture(tx, allowBorrow);
      const closed = new Date(NOW.getTime() - age);
      await tx.roomCheckRound.create({
        data: {
          ResourceKey: f.resource.ResourceKey,
          OpenedAt: new Date(closed.getTime() - DAY),
          DueAt: closed,
          ClosedAt: closed,
        },
      });
      const service = new CronService(
        f.client,
        new PenaltyService(f.client),
        new NotificationService(f.client),
      );
      await service.run('openT3InspectionRounds');
      expect(
        await tx.roomCheckRound.count({
          where: { ResourceKey: f.resource.ResourceKey, ClosedAt: null },
        }),
      ).toBe(0);
    });
  });
});
