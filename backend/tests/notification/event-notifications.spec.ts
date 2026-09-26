import { NotificationService } from '../../src/notification/notification.service';
import {
  listNotificationsInput,
  paginatedNotifications,
  unreadCountOutput,
} from '../../src/notification/notification.schema';

type Tx = Parameters<NotificationService['pickupReady']>[0];
describe('notification event recipients and navigation', () => {
  const base = { accountKey: 42, itemName: 'Meter' };
  const dueAt = new Date('2031-09-28T10:00:00Z');
  const cases: {
    name: string;
    type: string;
    key: string;
    link: string;
    emit: (service: NotificationService, tx: Tx) => Promise<unknown>;
  }[] = [
    {
      name: 'manual extension approval',
      type: 'RequestApproved',
      key: 'extension:5',
      link: '/my/loans',
      emit: (s, t) =>
        s.extensionApproved(t, {
          ...base,
          extensionKey: 5,
          dueAt,
          automatic: false,
        }),
    },
    {
      name: 'automatic extension approval',
      type: 'RequestApproved',
      key: 'extension:5',
      link: '/my/loans',
      emit: (s, t) =>
        s.extensionApproved(t, {
          ...base,
          extensionKey: 5,
          dueAt,
          automatic: true,
        }),
    },
    {
      name: 'extension rejection',
      type: 'RequestRejected',
      key: 'extension:5',
      link: '/my/loans',
      emit: (s, t) =>
        s.extensionRejected(t, {
          ...base,
          extensionKey: 5,
          dueAt,
          reason: 'conflict',
        }),
    },
    {
      name: 'pickup preparation',
      type: 'PickupReminder',
      key: 'usage:5',
      link: '/pickup',
      emit: (s, t) =>
        s.pickupReady(t, { ...base, usageKey: 5, collectFrom: dueAt }),
    },
    {
      name: 'credit deduction',
      type: 'CreditDeducted',
      key: 'penalty:5',
      link: '/profile',
      emit: (s, t) =>
        s.creditDeducted(t, {
          ...base,
          penaltyKey: 5,
          amount: 8,
          newScore: 92,
          expiresAt: dueAt,
          reason: 'ReturnLate',
        }),
    },
    {
      name: 'appeal approval',
      type: 'AppealResult',
      key: 'appeal:5',
      link: '/profile',
      emit: (s, t) =>
        s.appealApproved(t, {
          ...base,
          appealKey: 5,
          creditRestored: 8,
          note: 'accepted',
        }),
    },
    {
      name: 'appeal rejection',
      type: 'AppealResult',
      key: 'appeal:5',
      link: '/profile',
      emit: (s, t) =>
        s.appealRejected(t, {
          ...base,
          appealKey: 5,
          reason: 'evidence insufficient',
        }),
    },
    {
      name: 'retirement request',
      type: 'RetirementRequested',
      key: 'retirement:5',
      link: '/supervisor/approvals',
      emit: (s, t) =>
        s.retirementRequested(t, {
          accountKey: 42,
          requestKey: 5,
          resourceName: 'Meter',
          requestedBy: 'Staff',
          reason: 'broken',
        }),
    },
    {
      name: 'retirement approval',
      type: 'RetirementDecided',
      key: 'retirement:5',
      link: '/staff/inventory',
      emit: (s, t) =>
        s.retirementDecided(t, {
          accountKey: 42,
          requestKey: 5,
          resourceName: 'Meter',
          decision: 'approve',
        }),
    },
    {
      name: 'retirement rejection',
      type: 'RetirementDecided',
      key: 'retirement:5',
      link: '/staff/inventory',
      emit: (s, t) =>
        s.retirementDecided(t, {
          accountKey: 42,
          requestKey: 5,
          resourceName: 'Meter',
          decision: 'reject',
          note: 'repair first',
        }),
    },
    {
      name: 'supervisor request queue',
      type: 'SupervisorApprovalNeeded',
      key: 'reservation:5',
      link: '/supervisor/approvals',
      emit: (s, t) =>
        s.requestNeedsSupervisor(t, { ...base, reservationKey: 5 }),
    },
    {
      name: 'supervisor extension queue',
      type: 'SupervisorApprovalNeeded',
      key: 'extension:5',
      link: '/supervisor/approvals',
      emit: (s, t) =>
        s.extensionNeedsSupervisor(t, { ...base, extensionKey: 5 }),
    },
  ];
  it.each(cases)(
    'persists $name for the intended account with a stable dedupe key',
    async ({ emit, type, key, link }) => {
      const upsert = jest.fn().mockResolvedValue({});
      const tx = { notification: { upsert } };
      const service = new NotificationService(tx as never);
      await emit(service, tx as never);
      await emit(service, tx as never);
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(upsert).toHaveBeenLastCalledWith({
        where: {
          AccountKey_NotificationType_DedupeKey: {
            AccountKey: 42,
            NotificationType: type,
            DedupeKey: key,
          },
        },
        create: expect.objectContaining({
          AccountKey: 42,
          NotificationType: type,
          DedupeKey: key,
          LinkTo: link,
          Body: expect.stringContaining('Meter'),
        }),
        update: {},
      });
    },
  );

  it.each([false, true])(
    'lists only the current account with unreadOnly=%s and maps database dates to the wire contract',
    async (unreadOnly) => {
      const prisma = {
        usageLog: { findMany: jest.fn().mockResolvedValue([]) },
        notification: {
          findMany: jest.fn().mockResolvedValue([
            {
              NotificationKey: 7,
              AccountKey: 42,
              NotificationType: 'PickupReminder',
              Title: 'Ready',
              Body: 'Meter',
              LinkTo: '/pickup',
              CreatedAt: dueAt,
              ReadAt: unreadOnly ? null : dueAt,
            },
          ]),
          count: jest.fn().mockResolvedValue(1),
        },
        $transaction: jest.fn((operations: Promise<unknown>[]) =>
          Promise.all(operations),
        ),
      };
      const result = paginatedNotifications.parse(
        await new NotificationService(prisma as never).list(
          42,
          listNotificationsInput.parse({ page: 2, pageSize: 10, unreadOnly }),
        ),
      );
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { AccountKey: 42, ...(unreadOnly ? { ReadAt: null } : {}) },
        orderBy: { CreatedAt: 'desc' },
        skip: 10,
        take: 10,
      });
      expect(result.items[0]).toMatchObject({
        id: '7',
        userId: '42',
        linkTo: '/pickup',
        createdAt: dueAt.toISOString(),
      });
      if (unreadOnly) expect(result.items[0]).not.toHaveProperty('readAt');
      else expect(result.items[0].readAt).toBe(dueAt.toISOString());
    },
  );

  it('counts only unread notifications owned by the signed-in account', async () => {
    const prisma = {
      usageLog: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { count: jest.fn().mockResolvedValue(3) },
    };
    expect(
      unreadCountOutput.parse(
        await new NotificationService(prisma as never).unreadCount(42),
      ),
    ).toEqual({ unread: 3 });
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { AccountKey: 42, ReadAt: null },
    });
  });
});
