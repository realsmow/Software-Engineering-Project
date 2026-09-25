import { NotificationService } from '../../src/notification/notification.service';

describe('status notifications', () => {
  it('persists an approval notification for its borrower', async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
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
      create: expect.objectContaining({
        AccountKey: 42,
        NotificationType: 'RequestApproved',
        Title: expect.stringMatching(/ได้รับการอนุมัติ/),
        Body: expect.stringContaining('Laptop'),
        LinkTo: '/pickup',
        DedupeKey: 'reservation:77',
      }),
      update: {},
    });
  });
});
