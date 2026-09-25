import { NotificationService } from '../../src/notification/notification.service';

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
    const service = new NotificationService(prisma as never);

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
    const service = new NotificationService(prisma as never);

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
    const service = new NotificationService(prisma as never);

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
});
