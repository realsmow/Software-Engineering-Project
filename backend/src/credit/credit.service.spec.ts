import { CreditService } from './credit.service';

describe('CreditService — Module 3.3 / 3.4', () => {
  const prisma = { accountInfo: { findUnique: jest.fn() } } as any;
  const creditTiers = { resolveBorrowLimits: jest.fn() } as any;
  let service: CreditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CreditService(prisma as never, creditTiers as never);
  });

  it('3.3 calculates total credit deducted from active penalties, treating null as zero', async () => {
    prisma.accountInfo.findUnique.mockResolvedValue({
      AccountKey: 10,
      UserCredit: 72,
      Penalties: [
        {
          PenaltyKey: 1,
          Reason: 'Late',
          CreditDeducted: 5,
          ActionTime: new Date(),
          ExpirationTime: new Date(Date.now() + 86400000),
          Appealed: false,
        },
        {
          PenaltyKey: 2,
          Reason: 'Ban',
          CreditDeducted: null,
          ActionTime: new Date(),
          ExpirationTime: new Date(Date.now() + 86400000),
          Appealed: false,
        },
        {
          PenaltyKey: 3,
          Reason: 'Damage',
          CreditDeducted: 3,
          ActionTime: new Date(),
          ExpirationTime: new Date(Date.now() + 86400000),
          Appealed: false,
        },
      ],
    });
    creditTiers.resolveBorrowLimits.mockResolvedValue({
      creditTier: 'D2',
      maxBorrowDays: 7,
      maxExtendTimes: 1,
    });

    const result = await service.getCredit(10);

    expect(result.score).toBe(72);
    expect(result.totalDeducted).toBe(8);
    expect(result.activePenalties).toHaveLength(3);
  });

  it('3.4 returns score, tier, borrow limits, penalties and total deduction for credit.me data', async () => {
    prisma.accountInfo.findUnique.mockResolvedValue({
      AccountKey: 10,
      UserCredit: 95,
      Penalties: [],
    });
    creditTiers.resolveBorrowLimits.mockResolvedValue({
      creditTier: 'D0',
      maxBorrowDays: 14,
      maxExtendTimes: 3,
    });

    await expect(service.getCredit(10)).resolves.toMatchObject({
      accountId: 10,
      score: 95,
      tier: 'D0',
      maxBorrowDays: 14,
      maxExtendTimes: 3,
      activePenalties: [],
      totalDeducted: 0,
    });
  });
});
