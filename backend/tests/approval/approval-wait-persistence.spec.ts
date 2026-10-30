import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import type { Prisma } from '../../src/generated/prisma/client';
import { ApprovalService } from '../../src/approval/approval.service';
import { StaffScopeService } from '../../src/common/authority/staff-scope.service';
import { CreditTierService } from '../../src/common/credit/credit-tier.service';
import { NotificationService } from '../../src/notification/notification.service';
import {
  createRequestInput,
  createRequestOutput,
} from '../../src/loan/loan.schema';
import type { TrpcUser } from '../../src/trpc/context';
import {
  inHistoryFixture,
  transactionClient,
} from '../fixtures/borrower-history';
import { freezeBusinessDate } from '../fixtures/business-clock';
import { requestFixture } from '../fixtures/loan-request';

const START = new Date('2031-09-26T02:00:00.000Z');
const END = new Date('2031-09-29T10:00:00.000Z');
const SENT = new Date('2031-09-23T02:00:00.000Z');
const HOUR = 3_600_000;

async function deskAccount(
  tx: Prisma.TransactionClient,
  group: number,
  role: 'Supervisor' | 'Staff',
) {
  const roleRow = await tx.roleInfo.findFirstOrThrow({
    where: { RoleName: role },
  });
  const authority = await tx.authorityRole.create({
    data: { AuthorityName: `${role}-${group}`, AuthorityLevel: 1 },
  });
  return tx.accountInfo.create({
    data: {
      Email: `${role.toLowerCase()}.${group}@example.test`,
      UserID: `${role.toLowerCase()}.${group}`,
      HashedPassword: 'unused-test-hash',
      UserFName: role,
      UserLName: String(group),
      RoleKey: roleRow.RoleKey,
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

async function waitingFixture(tx: Prisma.TransactionClient) {
  const f = await requestFixture(tx, 'T2', 1);
  const group = f.group.ManageGroupKey;
  const supervisorRow = await deskAccount(tx, group, 'Supervisor');
  const staffRow = await deskAccount(tx, group, 'Staff');
  const supervisor: TrpcUser = {
    accountKey: supervisorRow.AccountKey,
    role: 'supervisor',
    facultyKey: null,
    creditScore: 100,
  };
  const staff: TrpcUser = {
    accountKey: staffRow.AccountKey,
    role: 'staff',
    facultyKey: null,
    creditScore: 100,
  };
  const client = transactionClient(tx);
  const approvals = new ApprovalService(
    client,
    new StaffScopeService(client),
    new CreditTierService(client),
    f.service,
    new NotificationService(client),
    f.audit as never,
    {} as never,
  );

  jest.setSystemTime(SENT);
  const output = createRequestOutput.strict().parse(
    await f.service.create(
      f.users[0],
      createRequestInput.parse({
        startTime: START.toISOString(),
        endTime: END.toISOString(),
        lines: [{ resourceKey: f.units[0].ResourceKey, reason: 'Field trip' }],
      }),
    ),
  );
  expect(output.created[0]).toMatchObject({ status: 'pending' });
  const reservationKey = output.created[0].reservationKey;

  const unread = () =>
    tx.notification.findMany({
      where: { AccountKey: supervisor.accountKey, ReadAt: null },
    });
  const status = async () =>
    (
      await tx.reservations.findUniqueOrThrow({
        where: { ReservationKey: reservationKey },
      })
    ).ApproveStatus;

  return { approvals, supervisor, staff, reservationKey, unread, status };
}

describe('approval-wait round (30 Oct 2569): reminders and late decisions', () => {
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

  beforeEach(() => freezeBusinessDate(SENT));
  afterEach(() => jest.useRealTimers());

  it('R7-19: a staff reminder reaches a supervisor who already read the first notice', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const t = await waitingFixture(tx);
      expect(await t.unread()).toHaveLength(1);
      await tx.notification.updateMany({
        where: { AccountKey: t.supervisor.accountKey },
        data: { ReadAt: SENT },
      });

      jest.setSystemTime(new Date(SENT.getTime() + 2 * HOUR));
      await expect(
        t.approvals.remind(t.staff, t.reservationKey),
      ).resolves.toEqual({ notified: 1 });
      const first = await t.unread();
      expect(first).toHaveLength(1);
      expect(first[0]).toMatchObject({
        NotificationType: 'SupervisorApprovalNeeded',
        Title: 'คำขอยืมยังรอการอนุมัติ',
      });
      expect(first[0].DedupeKey).toMatch(
        new RegExp(`^reminder:${t.reservationKey}:staff:`),
      );

      // A second press in the same hour adds nothing; an hour later it does.
      await t.approvals.remind(t.staff, t.reservationKey);
      expect(await t.unread()).toHaveLength(1);
      jest.setSystemTime(new Date(SENT.getTime() + 3 * HOUR));
      await t.approvals.remind(t.staff, t.reservationKey);
      expect(await t.unread()).toHaveLength(2);
    });
  });

  it('refuses an approval after the borrowing period has ended, but still allows a refusal', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const t = await waitingFixture(tx);
      jest.setSystemTime(new Date(END.getTime() + 60_000));

      await expect(
        t.approvals.decide(t.supervisor, {
          reservationKey: t.reservationKey,
          decision: 'approve',
        }),
      ).rejects.toMatchObject({ businessCode: 'REQUEST_PERIOD_ENDED' });
      expect(await t.status()).toBe('Pending');

      await t.approvals.decide(t.supervisor, {
        reservationKey: t.reservationKey,
        decision: 'reject',
        reason: 'ช่วงเวลาที่ขอผ่านไปแล้ว',
      });
      expect(await t.status()).toBe('Rejected');
    });
  });

  it('still approves a late decision while the period is running', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const t = await waitingFixture(tx);
      // Two hours after the start: late, but the borrower can still collect.
      jest.setSystemTime(new Date(START.getTime() + 2 * HOUR));
      await t.approvals.decide(t.supervisor, {
        reservationKey: t.reservationKey,
        decision: 'approve',
      });
      expect(await t.status()).toBe('Approved');
    });
  });
});
