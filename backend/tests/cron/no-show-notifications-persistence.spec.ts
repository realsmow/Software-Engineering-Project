import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import type { Prisma } from '../../src/generated/prisma/client';
import { CronService } from '../../src/cron/cron.service';
import { PenaltyService } from '../../src/common/penalty/penalty.service';
import { allocateLoanInput, loanOutput } from '../../src/loan/loan.schema';
import {
  listNotificationsInput,
  paginatedNotifications,
  type NotificationOutput,
} from '../../src/notification/notification.schema';
import { inHistoryFixture } from '../fixtures/borrower-history';
import { freezeBusinessDate } from '../fixtures/business-clock';
import { pickupFixture, pickupRequest, PICKUP_NOW } from '../fixtures/pickup';

function scopedCron(f: Awaited<ReturnType<typeof pickupFixture>>) {
  const accounts = f.users.map((user) => user.accountKey);
  // Use the production predicates and real SQL, restricting only the sweep's
  // population so this test cannot cancel seeded or another suite's requests.
  const reservations = new Proxy(f.client.reservations, {
    get(target, property) {
      if (property === 'findMany')
        return (args: Prisma.ReservationsFindManyArgs) =>
          target.findMany({
            ...args,
            where: {
              AND: [args.where ?? {}, { ReservedBy: { in: accounts } }],
            },
          });
      return Reflect.get(target, property) as unknown;
    },
  });
  const usageLog = new Proxy(f.client.usageLog, {
    get(target, property) {
      if (property === 'findMany')
        return (args: Prisma.UsageLogFindManyArgs) =>
          target.findMany({
            ...args,
            where: {
              AND: [args.where ?? {}, { AccountKey: { in: accounts } }],
            },
          });
      return Reflect.get(target, property) as unknown;
    },
  });
  const client = new Proxy(f.client, {
    get(target, property) {
      if (property === 'reservations') return reservations;
      if (property === 'usageLog') return usageLog;
      return Reflect.get(target, property) as unknown;
    },
  });
  return new CronService(client, new PenaltyService(client), f.notifications);
}

describe('FR-APV-06 / FR-NTF-01: no-show cancellation notifications', () => {
  let prisma: PrismaService;
  let termEnd: string | undefined;
  beforeAll(async () => {
    requireIsolatedDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
    termEnd = process.env.TERM_END_DATE;
    delete process.env.TERM_END_DATE;
  });
  afterAll(async () => {
    if (termEnd === undefined) delete process.env.TERM_END_DATE;
    else process.env.TERM_END_DATE = termEnd;
    await prisma?.$disconnect();
  });
  beforeEach(() => freezeBusinessDate(PICKUP_NOW));
  afterEach(() => jest.useRealTimers());

  describe.each([false, true])('prepared = %s', (prepared) => {
    let notices: NotificationOutput[];
    beforeEach(async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await pickupFixture(tx);
        const request = await pickupRequest(f);
        if (prepared)
          loanOutput.strict().parse(
            await f.loan.allocate(
              f.staff,
              allocateLoanInput.parse({
                reservationKey: request.reservationKey,
              }),
            ),
          );
        const before = await tx.notification.findMany({
          where: { AccountKey: f.users[0].accountKey },
        });
        const reservation = await tx.reservations.findUniqueOrThrow({
          where: { ReservationKey: request.reservationKey },
        });
        // The current pickup deadline is one calendar day, distinct from the
        // due-date policy: a Friday 09:00 pickup expires Saturday 09:00.
        expect(reservation.ReservationExpiration.toISOString()).toBe(
          '2031-09-27T02:00:00.000Z',
        );
        const cron = scopedCron(f);
        jest.setSystemTime(reservation.ReservationExpiration);
        expect(await cron.run('expireStaleRequests')).toMatchObject({
          affected: 0,
        });
        expect(
          await tx.reservations.findUniqueOrThrow({
            where: { ReservationKey: request.reservationKey },
          }),
        ).toMatchObject({ ApproveStatus: 'Approved' });
        jest.setSystemTime(
          new Date(reservation.ReservationExpiration.getTime() + 1),
        );
        expect(await cron.run('expireStaleRequests')).toMatchObject({
          affected: 1,
        });
        expect(
          await tx.reservations.findUniqueOrThrow({
            where: { ReservationKey: request.reservationKey },
          }),
        ).toMatchObject({ ApproveStatus: 'Canceled' });
        expect(
          await tx.usageLog.count({
            where: { ReservationKey: request.reservationKey },
          }),
        ).toBe(0);
        expect(
          await tx.resourceInfo.findUniqueOrThrow({
            where: { ResourceKey: f.units[0].ResourceKey },
          }),
        ).toMatchObject({ ResourceStatus: 'InStorage', AllowBorrow: true });
        const input = listNotificationsInput.parse({ page: 1, pageSize: 100 });
        const list = paginatedNotifications
          .strict()
          .parse(await f.notifications.list(f.users[0].accountKey, input));
        const known = new Set(before.map((row) => String(row.NotificationKey)));
        notices = list.items.filter((row) => !known.has(row.id));
        expect(await cron.run('expireStaleRequests')).toMatchObject({
          affected: 0,
        });
        // FR-NTF-06: rerunning must not add duplicate notices.
        expect(
          paginatedNotifications
            .strict()
            .parse(await f.notifications.list(f.users[0].accountKey, input)),
        ).toEqual(list);
        expect(
          paginatedNotifications
            .strict()
            .parse(await f.notifications.list(f.users[1].accountKey, input))
            .items,
        ).toEqual([]);
      });
    });

    // Both specifications require notification on a request status change.
    // expireStaleRequests currently updates Approved -> Canceled without one.
    // No notification enum or exact message is invented by this assertion.
    it('notifies the affected borrower once after automatic cancellation', () => {
      expect(notices).toHaveLength(1);
      expect(notices[0].readAt).toBeUndefined();
    });
  });
});
