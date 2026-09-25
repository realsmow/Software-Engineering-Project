import { ApprovalService } from './approval.service';
import type { PrismaService } from '../prisma.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { CreditTierService } from '../common/credit/credit-tier.service';
import type { LoanRequestService } from '../loan/loan.request.service';
import type { NotificationService } from '../notification/notification.service';
import type { ItemManagementService } from '../item/item.management.service';
import type { TrpcUser } from '../trpc/context';

const staff = { accountKey: 1, role: 'staff' } as TrpcUser;

function toBand() {
  return () => 'D0';
}

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    ReservationKey: 11,
    ReservedBy: 9,
    Reason: null,
    StartTime: new Date('2099-01-10T02:00:00Z'),
    EndTime: new Date('2099-01-11T09:00:00Z'),
    ActionTime: new Date('2099-01-01T00:00:00Z'),
    ApproveStatus: 'Pending',
    AutoApproved: false,
    ResolvedAt: null,
    ReservedByUser: {
      AccountKey: 9,
      UserID: 'u9',
      UserFName: 'F',
      UserLName: 'L',
      UserCredit: 80,
    },
    Resource: {
      ResourceKey: 26,
      ManagedBy: 3,
      BufferTime: 0,
      BorrowRuleInfo: { RuleName: 'T0' },
      Item: { ItemID: 'EE-1', Item: { ItemName: 'Scope' } },
      Room: null,
    },
    ...overrides,
  };
}

function service(overrides: {
  row?: ReturnType<typeof baseRow> | null;
  clashes?: unknown[];
  alreadyApproved?: number;
}) {
  const row = 'row' in overrides ? overrides.row : baseRow();
  const tx = {
    reservations: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue(overrides.clashes ?? []),
      count: jest.fn().mockResolvedValue(overrides.alreadyApproved ?? 0),
    },
    retirementRequest: {
      update: jest.fn().mockResolvedValue({}),
    },
    resourceInfo: {
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    reservations: { findUnique: jest.fn().mockResolvedValue(row) },
    retirementRequest: { findUnique: jest.fn() },
    $transaction: jest.fn((work: unknown) =>
      typeof work === 'function'
        ? (work as any)(tx)
        : Promise.all(work as any[]),
    ),
  } as unknown as PrismaService;
  const scope = {
    assertResourceInScope: jest.fn(),
    resourceScope: jest.fn().mockResolvedValue({}),
  } as unknown as StaffScopeService;
  const creditTiers = {
    tierMapper: jest.fn().mockResolvedValue(toBand()),
  } as unknown as CreditTierService;
  const requests = {
    getAsDecider: jest.fn().mockResolvedValue({ reservationKey: 11 }),
  } as unknown as LoanRequestService;
  const notifications = {
    requestRejected: jest.fn(),
    requestApproved: jest.fn(),
    retirementDecided: jest.fn(),
  } as unknown as NotificationService;
  const audit = { record: jest.fn() };
  const itemManagement = {
    assertNotActive: jest.fn(),
    readRetirementRequest: jest.fn().mockResolvedValue({ requestKey: 5 }),
  } as unknown as ItemManagementService;

  const svc = new ApprovalService(
    prisma,
    scope,
    creditTiers,
    requests,
    notifications,
    audit as any,
    itemManagement,
  );
  return {
    svc,
    prisma,
    scope,
    requests,
    notifications,
    audit,
    tx,
    itemManagement,
  };
}

describe('decide', () => {
  it('refuses when the reservation does not exist', async () => {
    const t = service({ row: null });
    await expect(
      t.svc.decide(staff, { reservationKey: 11, decision: 'approve' }),
    ).rejects.toMatchObject({ businessCode: 'RESERVATION_NOT_FOUND' });
  });

  it('refuses to let a staffer approve their own request', async () => {
    const t = service({ row: baseRow({ ReservedBy: staff.accountKey }) });
    await expect(
      t.svc.decide(staff, { reservationKey: 11, decision: 'approve' }),
    ).rejects.toMatchObject({ businessCode: 'CANNOT_APPROVE_OWN_REQUEST' });
  });

  it('refuses a decision on a request already decided', async () => {
    const t = service({ row: baseRow({ ApproveStatus: 'Approved' }) });
    await expect(
      t.svc.decide(staff, { reservationKey: 11, decision: 'approve' }),
    ).rejects.toMatchObject({ businessCode: 'ALREADY_DECIDED' });
  });

  it('reports an auto-approved request distinctly from a decided one', async () => {
    const t = service({
      row: baseRow({ ApproveStatus: 'Approved', AutoApproved: true }),
    });
    await expect(
      t.svc.decide(staff, { reservationKey: 11, decision: 'approve' }),
    ).rejects.toMatchObject({ businessCode: 'ALREADY_AUTO_APPROVED' });
  });

  it('refuses staff on a T2 request routed to a supervisor', async () => {
    const t = service({
      row: baseRow({
        Resource: { ...baseRow().Resource, BorrowRuleInfo: { RuleName: 'T2' } },
      }),
    });
    await expect(
      t.svc.decide(staff, { reservationKey: 11, decision: 'approve' }),
    ).rejects.toMatchObject({ businessCode: 'APPROVAL_NEEDS_SUPERVISOR' });
  });

  it('rejects a request, notifies the borrower and records the audit note', async () => {
    const t = service({});
    const result = await t.svc.decide(staff, {
      reservationKey: 11,
      decision: 'reject',
      reason: 'no stock',
    });
    expect(t.tx.reservations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ApproveStatus: 'Rejected' }),
      }),
    );
    expect(t.notifications.requestRejected).toHaveBeenCalled();
    expect(t.audit.record).toHaveBeenCalledWith(
      { accountKey: staff.accountKey },
      'update',
      'reservation/11',
      expect.stringContaining('no stock'),
    );
    expect(result).toEqual({ request: { reservationKey: 11 }, cancelled: [] });
  });

  it('refuses to approve into a window someone else already holds', async () => {
    const t = service({ alreadyApproved: 1 });
    await expect(
      t.svc.decide(staff, { reservationKey: 11, decision: 'approve' }),
    ).rejects.toMatchObject({ businessCode: 'WINDOW_NOT_AVAILABLE' });
    expect(t.tx.reservations.update).not.toHaveBeenCalled();
  });

  it('approves and cancels clashing pending requests, notifying each loser', async () => {
    const clash = {
      ReservationKey: 12,
      StartTime: new Date('2099-01-10T02:00:00Z'),
      EndTime: new Date('2099-01-11T09:00:00Z'),
      ReservedByUser: {
        AccountKey: 40,
        UserID: 'u40',
        UserFName: 'A',
        UserLName: 'B',
        UserCredit: 60,
      },
    };
    const t = service({ clashes: [clash] });
    const result = await t.svc.decide(staff, {
      reservationKey: 11,
      decision: 'approve',
    });
    expect(t.tx.reservations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ApproveStatus: 'Approved' }),
      }),
    );
    expect(t.tx.reservations.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ReservationKey: { in: [12] } },
      }),
    );
    expect(t.notifications.requestRejected).toHaveBeenCalledWith(
      t.tx,
      expect.objectContaining({ accountKey: 40, reservationKey: 12 }),
    );
    expect(t.audit.record).toHaveBeenCalledWith(
      { accountKey: staff.accountKey },
      'update',
      'reservation/11',
      expect.stringContaining('cancelled 1'),
    );
    expect(result.cancelled).toEqual([
      expect.objectContaining({ reservationKey: 12 }),
    ]);
  });
});

// Retirement desk cases live in approval.retirement.spec.ts.
