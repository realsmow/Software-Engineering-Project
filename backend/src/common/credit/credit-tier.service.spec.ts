import { CreditTierService } from './credit-tier.service';

describe('CreditTierService — Module 3.1 / 3.2 / 3.5', () => {
  const prisma = { creditTier: { findFirst: jest.fn() } } as any;
  let service: CreditTierService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CreditTierService(prisma);
  });

  describe('3.1 Credit Tier resolution', () => {
    it('resolves a credit score to the matching credit tier', async () => {
      prisma.creditTier.findFirst.mockResolvedValue({ CreditTierKey: 1, CreditTierName: 'D0' });
      await expect(service.resolveTier(95)).resolves.toEqual({ creditTierKey: 1, creditTier: 'D0' });
    });

    it('rejects a score when no credit tier is configured', async () => {
      prisma.creditTier.findFirst.mockResolvedValue(null);
      await expect(service.resolveTier(50)).rejects.toMatchObject({ businessCode: 'CREDIT_TIER_NOT_CONFIGURED' });
    });
  });

  describe('3.2 Borrow Limits', () => {
    it('resolves max borrow days and max extension times', async () => {
      prisma.creditTier.findFirst.mockResolvedValue({ CreditTierName: 'D1', BorrowConstraints: [{ MaxBorrowDate: 10, MaxExtendTime: 2 }] });
      await expect(service.resolveBorrowLimits(85)).resolves.toEqual({ creditTier: 'D1', maxBorrowDays: 10, maxExtendTimes: 2 });
    });

    it('uses the lowest configured borrow limit when multiple constraints exist', async () => {
      prisma.creditTier.findFirst.mockResolvedValue({ CreditTierName: 'D2', BorrowConstraints: [{ MaxBorrowDate: 7, MaxExtendTime: 1 }] });
      await expect(service.resolveBorrowLimits(60)).resolves.toEqual({ creditTier: 'D2', maxBorrowDays: 7, maxExtendTimes: 1 });
    });
  });

  describe('3.5 Tier boundary behavior', () => {
    it('matches scores at inclusive tier boundaries', async () => {
      prisma.creditTier.findFirst
        .mockResolvedValueOnce({ CreditTierKey: 1, CreditTierName: 'D0' })
        .mockResolvedValueOnce({ CreditTierKey: 2, CreditTierName: 'D1' });

      await expect(service.resolveTier(90)).resolves.toEqual({ creditTierKey: 1, creditTier: 'D0' });
      await expect(service.resolveTier(89)).resolves.toEqual({ creditTierKey: 2, creditTier: 'D1' });
    });
  });
});
