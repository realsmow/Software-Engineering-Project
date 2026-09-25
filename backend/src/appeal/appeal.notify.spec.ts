import { AppealService } from './appeal.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { NotificationService } from '../notification/notification.service';
import type { PrismaService } from '../prisma.service';
import type { TrpcUser } from '../trpc/context';

/**
 * FR-NTF-04: filing an appeal must tell every supervisor who could rule on it
 * — with a department when the penalty came from a borrowed unit, or every
 * supervisor when it did not (an administrative ban has no department, and
 * `listQueue` shows those to everyone with the role).
 */

const BORROWER: TrpcUser = {
  accountKey: 100,
  role: 'borrower',
  creditScore: 60,
} as TrpcUser;

const DAY = 86_400_000;
const RECENTLY = new Date(Date.now() - DAY);

function penaltyRow(usageKey: number | null) {
  return {
    PenaltyKey: 55,
    Reason: 'DamagedItem',
    CreditDeducted: 20,
    ActionTime: RECENTLY,
    ExpirationTime: new Date(Date.now() + 30 * DAY),
    InEffect: true,
    AccountKey: BORROWER.accountKey,
    UsageKey: usageKey,
    OriginalAppeal: null,
  };
}

function build(penalty: unknown, department: unknown, supervisors: unknown) {
  const tx = {
    appealInfo: { create: jest.fn().mockResolvedValue({ AppealKey: 9 }) },
    penaltyInfo: { update: jest.fn().mockResolvedValue({}) },
    inspection: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    usageLog: { findUnique: jest.fn().mockResolvedValue(department) },
    accountInfo: { findMany: jest.fn().mockResolvedValue(supervisors) },
  };
  const prisma = {
    penaltyInfo: { findUnique: jest.fn().mockResolvedValue(penalty) },
    appealInfo: {
      findUnique: jest.fn().mockResolvedValue({
        AppealKey: 9,
        AppealReason: 'ผมไม่ได้ทำ',
        ApproveStatus: 'Pending',
        ActionTime: RECENTLY,
        ResolvedAt: null,
        FiledBy: BORROWER.accountKey,
        FiledByUser: {
          AccountKey: BORROWER.accountKey,
          UserID: 'b100',
          UserFName: 'F',
          UserLName: 'L',
        },
        ResolvedByUser: null,
        OriginalPenaltyInfo: { ...(penalty as object), Usage: null },
        NewPenaltyInfo: null,
        Inspections: [],
      }),
    },
    $transaction: jest.fn((work: (t: unknown) => unknown) =>
      Promise.resolve(work(tx)),
    ),
  };

  const scope = {} as unknown as StaffScopeService;
  const notifications = {
    appealFiled: jest.fn(),
  } as unknown as NotificationService;

  const service = new AppealService(
    prisma as unknown as PrismaService,
    scope,
    notifications,
    { record: jest.fn() } as never,
  );

  return { service, tx, notifications };
}

const filing = { penaltyKey: 55, appealReason: 'ผมไม่ได้ทำ' };

describe('FR-NTF-04: filing an appeal against a penalty with a department', () => {
  it('notifies every supervisor with authority over that department', async () => {
    const { service, tx, notifications } = build(
      penaltyRow(7),
      { Resource: { ManagedBy: 3 } },
      [{ AccountKey: 21 }, { AccountKey: 22 }],
    );

    await service.create(BORROWER, filing);

    expect(tx.accountInfo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          Role: { RoleName: 'Supervisor' },
          Authorities: { some: { ManageGroupKey: 3 } },
        }),
      }),
    );
    expect(notifications.appealFiled).toHaveBeenCalledTimes(2);
    expect(notifications.appealFiled).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ accountKey: 21, appealKey: 9 }),
    );
  });
});

describe('FR-NTF-04: filing an appeal against an administrative penalty', () => {
  it('notifies every supervisor, unscoped by department', async () => {
    const { service, tx, notifications } = build(penaltyRow(null), null, [
      { AccountKey: 31 },
    ]);

    await service.create(BORROWER, filing);

    expect(tx.accountInfo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { Role: { RoleName: 'Supervisor' } },
      }),
    );
    expect(notifications.appealFiled).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ accountKey: 31, appealKey: 9 }),
    );
  });
});

describe('FR-NTF-04: the filer is also a supervisor over the department', () => {
  it('is not notified about their own appeal', async () => {
    const { service, notifications } = build(
      penaltyRow(7),
      { Resource: { ManagedBy: 3 } },
      [{ AccountKey: BORROWER.accountKey }],
    );

    await service.create(BORROWER, filing);

    expect(notifications.appealFiled).not.toHaveBeenCalled();
  });
});
