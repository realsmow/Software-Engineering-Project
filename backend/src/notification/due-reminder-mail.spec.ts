import { NotificationService } from './notification.service';
import type { PrismaService } from '../prisma.service';
import type { ConfigService } from '@nestjs/config';

const sendMail = jest.fn().mockResolvedValue({});
jest.mock('nodemailer', () => ({ createTransport: () => ({ sendMail }) }));

/** FR-NTF-02: one email per loan, sent with the first due-soon bell entry. */
function build(alreadyReminded: boolean) {
  const prisma = {
    usageLog: {
      findMany: jest.fn().mockResolvedValue([
        {
          UsageKey: 7,
          DueTime: new Date(Date.now() + 86_400_000),
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
  return new NotificationService(prisma as unknown as PrismaService, config);
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
