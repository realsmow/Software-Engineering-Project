import { withOutputContracts } from '../fixtures/output-contracts';
import { okOutput } from '../../src/common/schemas/ok.schema';
import {
  paginatedNotifications,
  unreadCountOutput,
} from '../../src/notification/notification.schema';
import { NotificationService } from '../../src/notification/notification.service';

function notificationService(prisma: unknown) {
  return withOutputContracts(new NotificationService(prisma as never), {
    list: paginatedNotifications,
    unreadCount: unreadCountOutput,
    markRead: okOutput,
    markAllRead: okOutput,
  });
}

function objectContaining(value: Record<string, unknown>): unknown {
  return expect.objectContaining(value);
}

function stringMatching(pattern: RegExp): unknown {
  return expect.stringMatching(pattern);
}

function stringContaining(value: string): unknown {
  return expect.stringContaining(value);
}

describe('status notifications', () => {
  it('persists an approval notification for its borrower', async () => {
    const upsert = jest.fn((_args: unknown): Promise<void> =>
      Promise.resolve(),
    );
    const prisma = { notification: { upsert } };
    const service = notificationService(prisma);

    await service.requestApproved(prisma as never, {
      accountKey: 42,
      reservationKey: 77,
      itemName: 'Laptop',
      collectBy: new Date('2026-09-25T03:00:00Z'),
    });

    expect(upsert).toHaveBeenCalledWith({
      where: {
        AccountKey_NotificationType_DedupeKey: {
          AccountKey: 42,
          NotificationType: 'RequestApproved',
          DedupeKey: 'reservation:77',
        },
      },
      create: objectContaining({
        AccountKey: 42,
        NotificationType: 'RequestApproved',
        Title: stringMatching(/ได้รับการอนุมัติ/),
        Body: stringContaining('Laptop'),
        LinkTo: '/pickup',
        DedupeKey: 'reservation:77',
      }),
      update: {},
    });
  });

  it('persists a rejection notification when no reason was provided', async () => {
    const upsert = jest.fn((_args: unknown): Promise<void> =>
      Promise.resolve(),
    );
    const prisma = { notification: { upsert } };
    const service = notificationService(prisma);

    await service.requestRejected(prisma as never, {
      accountKey: 42,
      reservationKey: 77,
      itemName: 'Laptop',
    });

    expect(upsert).toHaveBeenCalledWith({
      where: {
        AccountKey_NotificationType_DedupeKey: {
          AccountKey: 42,
          NotificationType: 'RequestRejected',
          DedupeKey: 'reservation:77',
        },
      },
      create: objectContaining({
        AccountKey: 42,
        NotificationType: 'RequestRejected',
        Title: 'คำขอยืมไม่ได้รับอนุมัติ',
        Body: 'Laptop · คำขอนี้ถูกปฏิเสธ',
        LinkTo: '/my/loans',
        DedupeKey: 'reservation:77',
      }),
      update: {},
    });
  });

  it('includes the supplied reason in a rejection notification', async () => {
    const upsert = jest.fn((_args: unknown): Promise<void> =>
      Promise.resolve(),
    );
    const prisma = { notification: { upsert } };
    const service = notificationService(prisma);

    await service.requestRejected(prisma as never, {
      accountKey: 42,
      reservationKey: 78,
      itemName: 'Laptop',
      reason: 'The item is unavailable',
    });

    expect(upsert).toHaveBeenCalledWith({
      where: {
        AccountKey_NotificationType_DedupeKey: {
          AccountKey: 42,
          NotificationType: 'RequestRejected',
          DedupeKey: 'reservation:78',
        },
      },
      create: objectContaining({
        AccountKey: 42,
        NotificationType: 'RequestRejected',
        Body: 'Laptop · The item is unavailable',
        LinkTo: '/my/loans',
        DedupeKey: 'reservation:78',
      }),
      update: {},
    });
  });

  it("marks only the caller's unread notification and treats a second click as idempotent", async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const count = jest.fn().mockResolvedValue(1);
    const service = notificationService({
      notification: { updateMany, count },
    });

    await expect(service.markRead(42, '77')).resolves.toEqual({ ok: true });
    await expect(service.markRead(42, '77')).resolves.toEqual({ ok: true });

    expect(updateMany).toHaveBeenCalledWith({
      where: { NotificationKey: 77, AccountKey: 42, ReadAt: null },
      data: { ReadAt: expect.any(Date) as unknown },
    });
    expect(count).toHaveBeenCalledWith({
      where: { NotificationKey: 77, AccountKey: 42 },
    });
  });

  it("does not reveal another borrower's notification when marking it read", async () => {
    const service = notificationService({
      notification: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
    });

    await expect(service.markRead(42, '77')).rejects.toMatchObject({
      message: 'NOTIFICATION_NOT_FOUND',
    });
  });

  it("marks every unread notification only within the caller's account", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const service = notificationService({
      notification: { updateMany },
    });

    await expect(service.markAllRead(42)).resolves.toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { AccountKey: 42, ReadAt: null },
      data: { ReadAt: expect.any(Date) as unknown },
    });
  });
});
