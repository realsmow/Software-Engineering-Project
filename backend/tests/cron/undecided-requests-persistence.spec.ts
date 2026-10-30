import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import type { Prisma } from '../../src/generated/prisma/client';
import { CronService } from '../../src/cron/cron.service';
import { PenaltyService } from '../../src/common/penalty/penalty.service';
import { NotificationService } from '../../src/notification/notification.service';
import {
  createRequestInput,
  createRequestOutput,
} from '../../src/loan/loan.schema';
import {
  inHistoryFixture,
  transactionClient,
} from '../fixtures/borrower-history';
import { freezeBusinessDate } from '../fixtures/business-clock';
import { requestFixture } from '../fixtures/loan-request';

// Friday 09:00 to Monday 17:00 Bangkok, the window the pickup fixtures use.
const START = new Date('2031-09-26T02:00:00.000Z');
const END = new Date('2031-09-29T10:00:00.000Z');
// Sent on Tuesday, so it has waited days by the time the period comes close.
const SENT_EARLY = new Date('2031-09-23T02:00:00.000Z');
// Sent six hours before the start: too new to remind about yet.
const SENT_LATE = new Date('2031-09-25T20:00:00.000Z');
const HOUR = 3_600_000;

async function supervisorOf(tx: Prisma.TransactionClient, group: number) {
  const role = await tx.roleInfo.findFirstOrThrow({
    where: { RoleName: 'Supervisor' },
  });
  const authority = await tx.authorityRole.create({
    data: { AuthorityName: `supervisor-${group}`, AuthorityLevel: 1 },
  });
  return tx.accountInfo.create({
    data: {
      Email: `supervisor.${group}@example.test`,
      UserID: `supervisor.${group}`,
      HashedPassword: 'unused-test-hash',
      UserFName: 'Supervisor',
      UserLName: String(group),
      RoleKey: role.RoleKey,
      UserCredit: 100,
      Authorities: {
        create: {
          ManageGroupKey: group,
          AuthorityRoleKey: authority.AuthorityRoleKey,
        },
      },
    },
  });
}

async function undecidedFixture(tx: Prisma.TransactionClient) {
  const f = await requestFixture(tx, 'T2', 2);
  const supervisor = await supervisorOf(tx, f.group.ManageGroupKey);
  const client = transactionClient(tx);
  const accounts = f.users.map((user) => user.accountKey);
  // The production queries on real SQL, with the sweep's population limited to
  // this fixture's borrowers so it cannot touch seeded or other suites' rows.
  const reservations = new Proxy(client.reservations, {
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
  const usageLog = new Proxy(client.usageLog, {
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
  const scoped = new Proxy(client, {
    get(target, property) {
      if (property === 'reservations') return reservations;
      if (property === 'usageLog') return usageLog;
      return Reflect.get(target, property) as unknown;
    },
  });
  const cron = new CronService(
    scoped,
    new PenaltyService(client),
    new NotificationService(client),
  );

  async function send(borrower: number, unit: number, at: Date) {
    jest.setSystemTime(at);
    const output = createRequestOutput.strict().parse(
      await f.service.create(
        f.users[borrower],
        createRequestInput.parse({
          startTime: START.toISOString(),
          endTime: END.toISOString(),
          lines: [
            { resourceKey: f.units[unit].ResourceKey, reason: 'Thesis rig' },
          ],
        }),
      ),
    );
    expect(output.rejected).toEqual([]);
    expect(output.created[0]).toMatchObject({ status: 'pending' });
    return output.created[0].reservationKey;
  }

  async function run(at: Date) {
    jest.setSystemTime(at);
    return cron.run('expireStaleRequests');
  }

  const notices = (accountKey: number) =>
    tx.notification.findMany({
      where: { AccountKey: accountKey },
      orderBy: { NotificationKey: 'asc' },
    });

  const status = async (reservationKey: number) =>
    (
      await tx.reservations.findUniqueOrThrow({
        where: { ReservationKey: reservationKey },
      })
    ).ApproveStatus;

  return { f, supervisor, send, run, notices, status };
}

describe('approval-wait round (30 Oct 2569): requests nobody decides', () => {
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

  beforeEach(() => freezeBusinessDate(SENT_EARLY));
  afterEach(() => jest.useRealTimers());

  it('reminds the supervisors once when a long-waiting request is about to start', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const t = await undecidedFixture(tx);
      const early = await t.send(0, 0, SENT_EARLY);
      const late = await t.send(1, 1, SENT_LATE);
      const before = (await t.notices(t.supervisor.AccountKey)).length;

      // 28 hours before the start: not yet.
      await t.run(new Date(START.getTime() - 28 * HOUR));
      expect(await t.notices(t.supervisor.AccountKey)).toHaveLength(before);

      // Four hours before: the request sent on Tuesday is raised again; the one
      // sent two hours ago is not, its first notice is still fresh.
      const outcome = await t.run(new Date(START.getTime() - 4 * HOUR));
      expect(outcome.detail).toContain(
        '1 request(s) brought to the supervisors again',
      );
      const after = await t.notices(t.supervisor.AccountKey);
      const reminders = after.slice(before);
      expect(reminders).toHaveLength(1);
      expect(reminders[0]).toMatchObject({
        NotificationType: 'SupervisorApprovalNeeded',
        DedupeKey: `reminder:${early}:before-start`,
        ReadAt: null,
        LinkTo: '/supervisor/approvals',
      });
      expect(reminders.some((n) => n.DedupeKey?.includes(String(late)))).toBe(
        false,
      );

      // The next hourly run sends nothing new for either.
      await t.run(new Date(START.getTime() - 3 * HOUR));
      expect(await t.notices(t.supervisor.AccountKey)).toHaveLength(
        after.length,
      );

      // Reminding changes no request.
      expect(await t.status(early)).toBe('Pending');
      expect(await t.status(late)).toBe('Pending');
    });
  });

  it('cancels a request still undecided when its period ends, and tells the borrower once', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const t = await undecidedFixture(tx);
      const key = await t.send(0, 0, SENT_EARLY);
      const borrower = t.f.users[0].accountKey;

      // A minute before the end it still waits: a supervisor may yet decide.
      expect(await t.run(new Date(END.getTime() - 60_000))).toMatchObject({
        affected: 0,
      });
      expect(await t.status(key)).toBe('Pending');

      const before = (await t.notices(borrower)).length;
      expect(await t.run(new Date(END.getTime() + 60_000))).toMatchObject({
        affected: 1,
      });
      const row = await tx.reservations.findUniqueOrThrow({
        where: { ReservationKey: key },
      });
      expect(row.ApproveStatus).toBe('Canceled');
      expect(row.ResolvedAt).toEqual(new Date(END.getTime() + 60_000));

      const told = (await t.notices(borrower)).slice(before);
      expect(told).toHaveLength(1);
      expect(told[0]).toMatchObject({
        NotificationType: 'RequestRejected',
        DedupeKey: `lapsed:${key}`,
        Title: 'คำขอยืมถูกยกเลิกอัตโนมัติ',
        ReadAt: null,
      });
      // Not the no-show wording, which would blame the borrower.
      expect(told[0].Body).not.toContain('ไม่ได้มารับ');

      // Rerunning changes nothing and sends nothing more.
      expect(await t.run(new Date(END.getTime() + 2 * HOUR))).toMatchObject({
        affected: 0,
      });
      expect(await t.notices(borrower)).toHaveLength(before + 1);
    });
  });
});
