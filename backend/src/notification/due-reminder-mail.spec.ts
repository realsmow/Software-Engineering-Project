import { NotificationService } from './notification.service';
import type { PrismaService } from '../prisma.service';
import type { ConfigService } from '@nestjs/config';

const sendMail = jest.fn().mockResolvedValue({});
jest.mock('nodemailer', () => ({ createTransport: () => ({ sendMail }) }));

/** FR-NTF-02: one email per loan, sent with the first due-soon bell entry. */
function build(
  alreadyReminded: boolean,
  due = new Date(Date.now() + 86_400_000),
) {
  const prisma = {
    usageLog: {
      findMany: jest.fn().mockResolvedValue([
        {
          UsageKey: 7,
          DueTime: due,
          Resource: { Item: { Item: { ItemName: 'Multimeter' } }, Room: null },
        },
      ]),
    },
    notification: {
      findFirst: jest
        .fn()
        .mockResolvedValue(alreadyReminded ? { NotificationKey: 1 } : null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    accountInfo: {
      findUnique: jest.fn().mockResolvedValue({ Email: 'b@ku.th' }),
    },
  };
  const config = { get: () => undefined } as unknown as ConfigService;
  return Object.assign(
    new NotificationService(prisma as unknown as PrismaService, config),
    { db: prisma },
  );
}

beforeEach(() => sendMail.mockClear());

it('emails the borrower the first time a loan comes due soon', async () => {
  await build(false).syncDueReminders(3);
  await new Promise((r) => setImmediate(r));
  expect(sendMail).toHaveBeenCalledTimes(1);
  expect(sendMail.mock.calls[0][0]).toMatchObject({ to: 'b@ku.th' });
  expect(sendMail.mock.calls[0][0].text).toContain('Multimeter');
});

it('does not email again once the reminder exists', async () => {
  await build(true).syncDueReminders(3);
  await new Promise((r) => setImmediate(r));
  expect(sendMail).not.toHaveBeenCalled();
});

it('#233: keys the reminder on the due date, so a new due date is reminded again', async () => {
  const due = new Date('2099-01-11T10:00:00Z');
  const service = build(false, due);
  // Due tomorrow from the service's point of view.
  jest.useFakeTimers({ now: new Date('2099-01-10T10:00:00Z') });
  try {
    await service.syncDueReminders(3);
  } finally {
    jest.useRealTimers();
  }
  expect(service.db.notification.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        DedupeKey: 'usage:7:due:2099-01-11T10:00:00.000Z',
      }),
    }),
  );
});

it('#233: rewrites the overdue text so the day count stays current', async () => {
  const service = build(false, new Date(Date.now() - 3 * 86_400_000 + 60_000));
  await service.syncDueReminders(3);
  const call = service.db.notification.upsert.mock.calls[0][0];
  expect(call.update.Body).toContain('3 วัน');
  expect(call.update.BodyEn).toContain('3 days overdue');
});
