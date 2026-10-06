import { NotificationService, englishDateTime } from './notification.service';
import { PrismaService } from '../prisma.service';

/** #175: every notification carries an English twin with Gregorian dates. */
describe('notification English text', () => {
  it('formats English dates in the Gregorian year, Bangkok time', () => {
    // 09:11 UTC is 16:11 in Bangkok
    expect(englishDateTime(new Date('2026-10-05T09:11:00Z'))).toBe(
      '5 Oct 2026 16:11',
    );
  });

  it('writes both Thai and English for a pickup notice', async () => {
    const prisma = {
      notification: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const service = new NotificationService(prisma as unknown as PrismaService);

    await service.pickupReady(prisma as never, {
      accountKey: 1,
      usageKey: 2,
      itemName: 'Camera',
      collectFrom: new Date('2026-10-05T09:11:00Z'),
    });

    const data = prisma.notification.upsert.mock.calls[0][0].create;
    expect(data.Title).toBe('อุปกรณ์พร้อมให้รับแล้ว');
    expect(data.Body).toContain('2569');
    expect(data.TitleEn).toBe('Equipment ready for pickup');
    expect(data.BodyEn).toBe(
      'Camera · Collect at the department counter from 5 Oct 2026 16:11',
    );
  });

  it('exposes English only when the row has it', () => {
    const service = new NotificationService({} as PrismaService);
    const base = {
      NotificationKey: 1,
      AccountKey: 1,
      NotificationType: 'DueSoon' as const,
      Title: 'ไทย',
      Body: 'ไทย',
      LinkTo: null,
      CreatedAt: new Date(),
      ReadAt: null,
    };
    const toOutput = (row: object) =>
      (service as unknown as { toOutput(r: object): object }).toOutput(row);
    expect(
      toOutput({ ...base, TitleEn: null, BodyEn: null }),
    ).not.toHaveProperty('titleEn');
    expect(
      toOutput({ ...base, TitleEn: 'En', BodyEn: 'En body' }),
    ).toMatchObject({ titleEn: 'En', bodyEn: 'En body' });
  });
});
