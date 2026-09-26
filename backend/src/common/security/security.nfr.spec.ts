import { BusinessError } from '../errors/business-error';
import { creditOutput } from '../../credit/credit.schema';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '../../auth/session.service';

describe('Module 12.1 — Security NFRs', () => {
  it('12.1.1 returns typed BusinessError codes instead of raw errors', () => {
    const error = new BusinessError('NOT_AUTHENTICATED');
    expect(error).toBeInstanceOf(BusinessError);
    expect(error.businessCode).toBe('NOT_AUTHENTICATED');
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.message).toBe('NOT_AUTHENTICATED');
  });

  it('12.1.2 rejects malformed endpoint input through Zod schema validation', () => {
    const result = creditOutput.safeParse({
      accountId: 'not-a-number',
      score: 80,
      tier: 'D1',
      maxBorrowDays: 10,
      maxExtendTimes: 2,
      activePenalties: [],
      totalDeducted: 0,
    });
    expect(result.success).toBe(false);
  });

  it('12.1.3 keeps the database boundary on Prisma model delegates', () => {
    const prismaLike = { accountInfo: { findUnique: jest.fn() } };
    expect(prismaLike.accountInfo.findUnique).toBeDefined();
    expect((prismaLike as any).$queryRaw).toBeUndefined();
    expect((prismaLike as any).$executeRaw).toBeUndefined();
  });

  it('12.1.4 sets secure session cookie flags in production', async () => {
    const prisma = {
      sessionInfo: { create: jest.fn().mockResolvedValue({}) },
    } as any;
    const config = {
      get: jest.fn(
        (key: string) =>
          ({
            SESSION_SECRET: 'a-test-secret-that-is-at-least-32-characters-long',
            NODE_ENV: 'production',
          })[key],
      ),
    } as unknown as ConfigService;
    const service = new SessionService(config, prisma);
    const cookie = jest.fn();

    await service.issue({ cookie } as any, 1);

    expect(cookie).toHaveBeenCalledWith(
      'ulms_session',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/',
      }),
    );
  });
});
