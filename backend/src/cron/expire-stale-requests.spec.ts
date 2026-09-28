import { CronService } from './cron.service';
import type { PrismaService } from '../prisma.service';
import type { PenaltyService } from '../common/penalty/penalty.service';
import type { NotificationService } from '../notification/notification.service';

/**
 * FR-PKP-05: a request not collected by its deadline is cancelled and the unit
 * goes back to the pool, whether or not staff had already set it aside.
 */
function build(unprepared: unknown[], noShows: unknown[]) {
  const prisma = {
    reservations: {
      findMany: jest.fn().mockResolvedValue(unprepared),
      updateMany: jest.fn().mockResolvedValue({ count: unprepared.length }),
      update: jest.fn().mockResolvedValue({}),
    },
    usageLog: {
      findMany: jest.fn().mockResolvedValue(noShows),
      delete: jest.fn().mockResolvedValue({}),
    },
    images: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    cronRunLog: {
      create: jest.fn().mockResolvedValue({ RunKey: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const notifications = { requestExpired: jest.fn() };
  const service = new CronService(
    prisma as unknown as PrismaService,
    {} as PenaltyService,
    notifications as unknown as NotificationService,
  );
  return { service, prisma, notify: notifications.requestExpired };
}

it('releases a prepared no-show along with the unprepared ones', async () => {
  const item = { Item: { Item: { ItemName: 'Multimeter' } }, Room: null };
  const t = build(
    [{ ReservationKey: 1, ReservedBy: 3, Resource: item }],
    [
      {
        UsageKey: 9,
        ReservationKey: 2,
        Reservation: { ReservedBy: 4, Resource: item },
      },
    ],
  );

  const outcome = await t.service.run('expireStaleRequests');

  expect(t.prisma.reservations.updateMany).toHaveBeenCalledWith({
    where: { ReservationKey: { in: [1] } },
    data: { ApproveStatus: 'Canceled' },
  });
  expect(t.prisma.usageLog.delete).toHaveBeenCalledWith({
    where: { UsageKey: 9 },
  });
  expect(t.prisma.reservations.update).toHaveBeenCalledWith({
    where: { ReservationKey: 2 },
    data: { ApproveStatus: 'Canceled' },
  });
  expect(outcome.affected).toBe(2);
  // Both borrowers hear their request was cancelled.
  expect(t.notify).toHaveBeenCalledTimes(2);
});

it('does nothing when nothing is past its hold', async () => {
  const t = build([], []);

  const outcome = await t.service.run('expireStaleRequests');

  expect(t.prisma.reservations.updateMany).not.toHaveBeenCalled();
  expect(t.prisma.usageLog.delete).not.toHaveBeenCalled();
  expect(outcome.affected).toBe(0);
});
