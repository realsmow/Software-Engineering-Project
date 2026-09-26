import { CronService } from './cron.service';
import type { PrismaService } from '../prisma.service';
import type { PenaltyService } from '../common/penalty/penalty.service';
import type { NotificationService } from '../notification/notification.service';

/**
 * Opening the scheduled room checks.
 *
 * The job's whole contract is which rooms it skips. It runs unattended and an
 * administrator can also fire it by hand from the status page, so "ran twice"
 * is ordinary; a second run that opened a second task for the same room would
 * hand staff duplicate work with no way to tell which one to answer.
 */
const DAY = 86_400_000;

function build(
  rooms: { ResourceKey: number; CheckRounds: { ClosedAt: Date | null }[] }[],
) {
  const createMany = jest.fn().mockResolvedValue({ count: 0 });
  const findMany = jest.fn().mockResolvedValue(rooms);

  const prisma = {
    resourceInfo: { findMany },
    roomCheckRound: { createMany },
    cronRunLog: {
      create: jest.fn().mockResolvedValue({ RunKey: 1 }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;

  const service = new CronService(
    prisma,
    {} as unknown as PenaltyService,
    { roomToCheck: jest.fn() } as unknown as NotificationService,
  );

  return { service, prisma, createMany, findMany };
}

/** The job is private; it is reached the way the status page reaches it. */
const run = (s: CronService) => s.run('openT3InspectionRounds');

const room = (key: number, closedDaysAgo: number | null | 'open') => ({
  ResourceKey: key,
  CheckRounds:
    closedDaysAgo === null
      ? []
      : [
          {
            ClosedAt:
              closedDaysAgo === 'open'
                ? null
                : new Date(Date.now() - closedDaysAgo * DAY),
          },
        ],
});

it('opens a round for a room that has never been checked', async () => {
  const t = build([room(1, null)]);
  await run(t.service);

  expect(t.createMany).toHaveBeenCalledTimes(1);
  const rows = t.createMany.mock.calls[0][0].data;
  expect(rows).toHaveLength(1);
  expect(rows[0].ResourceKey).toBe(1);
});

it('skips a room whose round is still open, however old', async () => {
  const t = build([room(1, 'open')]);
  await run(t.service);
  expect(t.createMany).not.toHaveBeenCalled();
});

it('skips a room checked inside the interval', async () => {
  const t = build([room(1, 3)]);
  await run(t.service);
  expect(t.createMany).not.toHaveBeenCalled();
});

it('opens one for a room whose last check has aged out', async () => {
  const t = build([room(1, 45)]);
  await run(t.service);
  expect(t.createMany.mock.calls[0][0].data).toHaveLength(1);
});

it('asks only for rooms that are still bookable', async () => {
  const t = build([]);
  await run(t.service);

  // A room already withdrawn does not need a task telling somebody to go and
  // discover that it is broken.
  expect(t.findMany.mock.calls[0][0].where).toEqual({
    ResourceType: 'Room',
    AllowBorrow: true,
  });
});

it('sets a due date after the opening date', async () => {
  const t = build([room(1, null)]);
  await run(t.service);

  const row = t.createMany.mock.calls[0][0].data[0];
  expect(row.DueAt.getTime()).toBeGreaterThan(row.OpenedAt.getTime() as never);
});

it('lets a concurrent run lose rather than failing the job', async () => {
  const t = build([room(1, null)]);
  await run(t.service);
  expect(t.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
});
