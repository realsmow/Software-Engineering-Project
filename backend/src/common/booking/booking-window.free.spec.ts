import { resourcesFreeInWindow } from './booking-window';

/**
 * The catalogue's batch version of the check loan.create makes one resource
 * at a time. What matters is that the two agree: a unit the catalogue calls
 * free for a period must be one the request would accept, so each resource's
 * own buffer has to widen its own window, never a shared one.
 */
const DAY = 86_400_000;
const start = new Date('2099-03-10T02:00:00Z');
const end = new Date('2099-03-12T09:00:00Z');

function reader(reserved: number[], held: number[]) {
  return {
    reservations: {
      findMany: jest
        .fn()
        .mockResolvedValue(reserved.map((ResourceKey) => ({ ResourceKey }))),
    },
    usageLog: {
      findMany: jest
        .fn()
        .mockResolvedValue(held.map((ResourceKey) => ({ ResourceKey }))),
    },
  };
}

it('returns every resource when nothing clashes', async () => {
  const prisma = reader([], []);
  const free = await resourcesFreeInWindow(
    prisma,
    [
      { ResourceKey: 1, BufferTime: 0 },
      { ResourceKey: 2, BufferTime: 0 },
    ],
    start,
    end,
  );
  expect([...free].sort()).toEqual([1, 2]);
});

it('drops a resource held by a booking or by a loan still out', async () => {
  const prisma = reader([1], [3]);
  const free = await resourcesFreeInWindow(
    prisma,
    [1, 2, 3].map((ResourceKey) => ({ ResourceKey, BufferTime: 0 })),
    start,
    end,
  );
  expect([...free]).toEqual([2]);
});

it("widens each resource's window by its own buffer", async () => {
  const prisma = reader([], []);
  await resourcesFreeInWindow(
    prisma,
    [
      { ResourceKey: 1, BufferTime: 0 },
      { ResourceKey: 2, BufferTime: 2 },
    ],
    start,
    end,
  );

  const [zeroBuffer, twoDays] =
    prisma.reservations.findMany.mock.calls[0][0].where.OR;
  expect(zeroBuffer.StartTime.lt).toEqual(end);
  expect(zeroBuffer.EndTime.gt).toEqual(start);
  expect(twoDays.StartTime.lt).toEqual(new Date(end.getTime() + 2 * DAY));
  expect(twoDays.EndTime.gt).toEqual(new Date(start.getTime() - 2 * DAY));

  const held = prisma.usageLog.findMany.mock.calls[0][0].where.OR;
  expect(held[1].OR[0].DueTime.gt).toEqual(new Date(start.getTime() - 2 * DAY));
  // A unit back and not yet graded holds every window, whatever its due date.
  expect(held[1].OR[1]).toEqual({ CurrentStatus: 'Returned' });
});

it('asks nothing of the database for an empty list', async () => {
  const prisma = reader([], []);
  expect((await resourcesFreeInWindow(prisma, [], start, end)).size).toBe(0);
  expect(prisma.reservations.findMany).not.toHaveBeenCalled();
});
