import {
  historyFixture,
  inHistoryFixture,
  requireIsolatedDatabase,
  transactionClient,
} from '../../tests/fixtures/borrower-history';
import { pickupFixture } from '../../tests/fixtures/pickup';
import { freezeBusinessDate } from '../../tests/fixtures/business-clock';
import { NotificationService } from './notification.service';
import { PrismaService } from '../prisma.service';

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

// Real service/adapter assertions share this module's suite; setup is scoped.
describe('Persisted business records', () => {
  const NOW = new Date('2031-09-26T03:00:00Z');

  describe('FR-NTF-03/04: actual staff return tasks and appeal notifications', () => {
    let prisma: PrismaService;
    beforeAll(async () => {
      requireIsolatedDatabase();
      prisma = new PrismaService();
      await prisma.$connect();
    });
    afterAll(async () => prisma?.$disconnect());
    beforeEach(() => freezeBusinessDate(NOW));
    afterEach(() => jest.useRealTimers());

    it('notifies only staff responsible for the returning unit, once per task', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const own = await pickupFixture(tx),
          foreign = await pickupFixture(tx);
        const service = new NotificationService(transactionClient(tx));
        const input = {
          manageGroupKey: own.group.ManageGroupKey,
          usageKey: 42,
          itemName: 'Queue meter',
          due: NOW,
        };
        await service.returnToReceive(tx, input);
        await service.returnToReceive(tx, input);
        const rows = await tx.notification.findMany({
          where: {
            AccountKey: {
              in: [
                own.staff.accountKey,
                foreign.staff.accountKey,
                own.users[0].accountKey,
              ],
            },
          },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          AccountKey: own.staff.accountKey,
          NotificationType: 'StaffTask',
          DedupeKey: 'usage:42',
          LinkTo: '/staff',
          ReadAt: null,
        });
        expect(rows[0].Body).toContain('Queue meter');
      });
    });

    it('keeps a dismissed task read when the same due reminder is emitted again', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await pickupFixture(tx);
        const service = new NotificationService(transactionClient(tx));
        const input = {
          manageGroupKey: f.group.ManageGroupKey,
          usageKey: 42,
          itemName: 'Queue meter',
          due: NOW,
        };
        await service.returnToReceive(tx, input);
        await tx.notification.updateMany({
          where: { AccountKey: f.staff.accountKey, DedupeKey: 'usage:42' },
          data: { ReadAt: NOW },
        });
        await service.returnToReceive(tx, input);
        const rows = await tx.notification.findMany({
          where: { AccountKey: f.staff.accountKey, DedupeKey: 'usage:42' },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].ReadAt).toEqual(NOW);
      });
    });

    it('filing an eligible damage appeal writes the in-app alert for its own department supervisor', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const own = await historyFixture(tx),
          foreign = await historyFixture(tx);
        const role = await tx.roleInfo.findFirstOrThrow({
          where: { RoleName: 'Supervisor' },
        });
        await tx.accountInfo.updateMany({
          where: {
            AccountKey: {
              in: [own.decider.accountKey, foreign.decider.accountKey],
            },
          },
          data: { RoleKey: role.RoleKey },
        });
        await tx.accountInfo.update({
          where: { AccountKey: own.borrower.AccountKey },
          data: { UserCredit: 84 },
        });
        const penalty = await tx.penaltyInfo.create({
          data: {
            AccountKey: own.borrower.AccountKey,
            UsageKey: own.usage.UsageKey,
            Reason: 'DamagedItem',
            CreditDeducted: 4,
            InEffect: true,
            Appealed: false,
            ActionTime: NOW,
            ExpirationTime: new Date(NOW.getTime() + 86_400_000),
          },
        });
        const appeal = await own.appeals.create(
          {
            ...own.decider,
            role: 'borrower',
            accountKey: own.borrower.AccountKey,
            creditScore: 84,
          },
          {
            penaltyKey: penalty.PenaltyKey,
            appealReason: 'Please review this deduction',
          },
        );
        const rows = await tx.notification.findMany({
          where: {
            NotificationType: 'AppealFiled',
            DedupeKey: `appeal:${appeal.appealKey}`,
          },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          AccountKey: own.decider.accountKey,
          LinkTo: '/supervisor/appeals',
          ReadAt: null,
        });
        expect(rows[0].Body).toContain('Please review this deduction');
      });
    });
  });
});
