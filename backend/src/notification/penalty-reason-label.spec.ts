import { NotificationService } from './notification.service';
import { PrismaService } from '../prisma.service';

/**
 * #169: FR-RTN-03 calls B1-B2 "เสียหาย" (DamagedItem) and B3 "ชำรุด"
 * (BrokenItem). The bell used to say the opposite of the staff screen.
 */
it.each([
  ['DamagedItem', 'อุปกรณ์เสียหาย'],
  ['BrokenItem', 'อุปกรณ์ชำรุด'],
] as const)('labels a %s penalty as %s', async (reason, label) => {
  const prisma = { notification: { upsert: jest.fn().mockResolvedValue({}) } };
  const service = new NotificationService(prisma as unknown as PrismaService);

  await service.creditDeducted(prisma as never, {
    accountKey: 1,
    penaltyKey: 2,
    amount: 9,
    reason,
    newScore: 91,
    expiresAt: new Date('2026-10-01T00:00:00Z'),
  });

  const body = prisma.notification.upsert.mock.calls[0][0].create.Body;
  expect(body).toContain(`สาเหตุ: ${label} ·`);
});
