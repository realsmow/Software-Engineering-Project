import { NotificationService } from './notification.service';
import type { PrismaService } from '../prisma.service';

/** FR-NTF-03: every staff member over the department gets the task, once. */
it('tells each staff member of the department about an item to prepare', async () => {
  const prisma = {
    accountInfo: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ AccountKey: 4 }, { AccountKey: 5 }]),
    },
    notification: { upsert: jest.fn().mockResolvedValue({}) },
  };
  const service = new NotificationService(prisma as unknown as PrismaService);

  await service.itemToPrepare(prisma as never, {
    manageGroupKey: 2,
    reservationKey: 11,
    itemName: 'Oscilloscope',
  });

  expect(prisma.accountInfo.findMany.mock.calls[0][0].where).toEqual({
    Role: { RoleName: 'Staff' },
    Authorities: { some: { ManageGroupKey: 2 } },
  });
  const rows = prisma.notification.upsert.mock.calls.map(([arg]) => arg.create);
  expect(rows.map((r) => r.AccountKey)).toEqual([4, 5]);
  expect(rows[0]).toMatchObject({
    NotificationType: 'StaffTask',
    DedupeKey: 'reservation:11',
    LinkTo: '/staff',
  });
});
