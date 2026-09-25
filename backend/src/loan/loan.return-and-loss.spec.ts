import { LoanService } from './loan.service';
import type { PrismaService } from '../prisma.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { PenaltyService } from '../common/penalty/penalty.service';
import type { NotificationService } from '../notification/notification.service';
import type { TrpcUser } from '../trpc/context';

/**
 * Money paths at the return desk: the late penalty on recordReturn, and the
 * lost-item penalty on markLost — including the "already charged overnight"
 * guard that stops a borrower being billed twice for the same lateness.
 */
const staff = { accountKey: 4, role: 'staff' } as TrpcUser;

function usageRow(overrides: Record<string, unknown> = {}) {
  return {
    UsageKey: 8,
    ReservationKey: 11,
    CurrentStatus: 'Lended',
    CheckoutTime: new Date('2099-01-01T00:00:00Z'),
    DueTime: new Date('2099-01-10T00:00:00Z'),
    CheckInTime: null,
    PendingExtension: null,
    Account: {
      AccountKey: 3,
      UserID: 'u3',
      UserFName: 'F',
      UserLName: 'L',
      UserCredit: 80,
    },
    Resource: {
      ResourceKey: 26,
      ManagedBy: 3,
      BufferTime: 0,
      BorrowRule: 3,
      BorrowRuleInfo: { RuleName: 'T1' },
      Item: {
        ItemKey: 7,
        ItemID: 'EE-1',
        Item: { ItemName: 'Scope', CreditWeight: 3 },
      },
      Room: null,
    },
    CheckoutConditionLog: { Condition: 'Normal', Notes: null },
    CheckInConditionLog: null,
    ...overrides,
  };
}

function service(overrides: {
  usage?: ReturnType<typeof usageRow>;
  afterPhoto?: { ImageKey: number } | null;
  alreadyCharged?: { PenaltyKey: number } | null;
}) {
  const usage = overrides.usage ?? usageRow();
  const tx = {
    usageLog: { update: jest.fn().mockResolvedValue({}) },
    resourceInfo: { update: jest.fn().mockResolvedValue({}) },
    conditionLog: {
      create: jest.fn().mockResolvedValue({ ConditionKey: 900 }),
    },
    extensionRequest: { updateMany: jest.fn().mockResolvedValue({}) },
    accountInfo: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ UserCredit: 70 }),
    },
  };
  const prisma = {
    usageLog: { findUnique: jest.fn().mockResolvedValue(usage) },
    images: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          'afterPhoto' in overrides ? overrides.afterPhoto : { ImageKey: 1 },
        ),
    },
    penaltyInfo: {
      findFirst: jest.fn().mockResolvedValue(overrides.alreadyCharged ?? null),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        PenaltyKey: 500,
        CreditDeducted: 10,
        ExpirationTime: new Date('2099-06-01T00:00:00Z'),
      }),
    },
    $transaction: jest.fn((work: unknown) =>
      typeof work === 'function'
        ? (work as any)(tx)
        : Promise.all(work as any[]),
    ),
  } as unknown as PrismaService;
  const scope = {
    assertResourceInScope: jest.fn(),
  } as unknown as StaffScopeService;
  const penalties = {
    overdueDays: jest.fn().mockReturnValue(3),
    quoteLate: jest
      .fn()
      .mockResolvedValue({ reason: 'ReturnLate', amount: 10, lengthDays: 30 }),
    quoteLost: jest
      .fn()
      .mockResolvedValue({ reason: 'LostItem', amount: 40, lengthDays: 90 }),
    apply: jest.fn().mockResolvedValue(500),
  } as unknown as PenaltyService;
  const notifications = {
    creditDeducted: jest.fn(),
  } as unknown as NotificationService;
  const audit = { record: jest.fn() };

  const svc = new LoanService(
    prisma,
    scope,
    penalties,
    notifications,
    audit as any,
  );
  return { svc, prisma, penalties, notifications, audit, tx };
}

describe('recordReturn', () => {
  it('refuses a return without an after photo (FR-RTN-01)', async () => {
    const t = service({ afterPhoto: null });
    await expect(
      t.svc.recordReturn(staff, { usageKey: 8 } as any),
    ).rejects.toMatchObject({ businessCode: 'RETURN_PHOTO_REQUIRED' });
  });

  it('refuses a return for a loan that is not out', async () => {
    const t = service({ usage: usageRow({ CurrentStatus: 'Prepared' }) });
    await expect(
      t.svc.recordReturn(staff, { usageKey: 8 } as any),
    ).rejects.toMatchObject({ businessCode: 'WRONG_LOAN_STATE' });
  });

  it('charges a late penalty, notifies the deduction, and puts the unit back in storage', async () => {
    const t = service({});
    const result = await t.svc.recordReturn(staff, { usageKey: 8 });

    expect(t.tx.usageLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ CurrentStatus: 'Returned' }),
      }),
    );
    expect(t.tx.resourceInfo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ResourceStatus: 'InStorage' }),
      }),
    );
    expect(t.penalties.apply).toHaveBeenCalled();
    expect(t.notifications.creditDeducted).toHaveBeenCalled();
    expect(t.audit.record).toHaveBeenCalledWith(
      { accountKey: staff.accountKey },
      'update',
      'loan/8',
      expect.stringContaining('late penalty 10 credit'),
    );
    expect(result.latePenalty).toEqual(
      expect.objectContaining({ penaltyKey: 500, overdueDays: 3 }),
    );
  });

  it('does not double-charge lateness the overnight job already billed', async () => {
    const t = service({ alreadyCharged: { PenaltyKey: 900 } });
    const result = await t.svc.recordReturn(staff, { usageKey: 8 });

    // No fresh penalty is applied — the prior night's charge is reported instead.
    expect(t.penalties.apply).not.toHaveBeenCalled();
    expect(t.audit.record).toHaveBeenCalledWith(
      { accountKey: staff.accountKey },
      'update',
      'loan/8',
      expect.stringContaining('late penalty'),
    );
    expect(result.latePenalty?.penaltyKey).toBe(500); // read back via findUniqueOrThrow
  });

  it('closes a pending extension request on the way back', async () => {
    const t = service({ usage: usageRow({ PendingExtension: 42 }) });
    await t.svc.recordReturn(staff, { usageKey: 8 });
    expect(t.tx.extensionRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ExtensionKey: 42, ApproveStatus: 'Pending' },
        data: expect.objectContaining({ ApproveStatus: 'Canceled' }),
      }),
    );
  });

  it('logs a condition note when staff leave one', async () => {
    const t = service({});
    await t.svc.recordReturn(staff, {
      usageKey: 8,
      note: 'scratch on lens',
    });
    expect(t.tx.conditionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ Notes: 'scratch on lens' }),
      }),
    );
  });
});

describe('markLost', () => {
  it('refuses to mark lost a loan not currently out', async () => {
    const t = service({ usage: usageRow({ CurrentStatus: 'Returned' }) });
    await expect(
      t.svc.markLost(staff, { usageKey: 8 } as any),
    ).rejects.toMatchObject({ businessCode: 'WRONG_LOAN_STATE' });
  });

  it('refuses a staff-initiated lost report before the 14-day threshold', async () => {
    const t = service({});
    (t.penalties.overdueDays as jest.Mock).mockReturnValue(5);
    await expect(
      t.svc.markLost(staff, { usageKey: 8, reportedByBorrower: false } as any),
    ).rejects.toMatchObject({ businessCode: 'NOT_YET_LOST' });
  });

  it('lets a borrower report it lost early, before the 14-day threshold', async () => {
    const t = service({});
    (t.penalties.overdueDays as jest.Mock).mockReturnValue(2);
    await expect(
      t.svc.markLost(staff, {
        usageKey: 8,
        reportedByBorrower: true,
      } as any),
    ).resolves.toBeDefined();
  });

  it('writes off the unit, charges the lost-item penalty, and notifies the borrower', async () => {
    const t = service({});
    (t.penalties.overdueDays as jest.Mock).mockReturnValue(20);
    await t.svc.markLost(staff, {
      usageKey: 8,
      reason: 'never returned',
    } as any);

    expect(t.tx.conditionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ Condition: 'Missing' }),
      }),
    );
    expect(t.tx.resourceInfo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ResourceStatus: 'Missing',
          AllowBorrow: false,
        }),
      }),
    );
    expect(t.penalties.apply).toHaveBeenCalled();
    expect(t.notifications.creditDeducted).toHaveBeenCalled();
    expect(t.audit.record).toHaveBeenCalledWith(
      { accountKey: staff.accountKey },
      'update',
      'loan/8',
      expect.stringContaining('Marked lost'),
    );
  });
});
