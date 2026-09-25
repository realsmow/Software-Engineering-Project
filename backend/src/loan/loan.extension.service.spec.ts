import { LoanExtensionService } from './loan.extension.service';
import type { PrismaService } from '../prisma.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { CreditTierService } from '../common/credit/credit-tier.service';
import type { EligibilityService } from '../common/authority/eligibility.service';
import type { NotificationService } from '../notification/notification.service';
import type { TrpcUser } from '../trpc/context';

/**
 * The extension desk's audit trail (FR-ADM-05): a supervisor's decision on an
 * extension is exactly the kind of dispute-relevant action the log audit
 * found missing.
 */
const SUPERVISOR = {
  accountKey: 20,
  role: 'supervisor',
  facultyKey: null,
  creditScore: 100,
} as TrpcUser;

const BORROWER_ROW = {
  AccountKey: 3,
  UserID: 'b3',
  UserFName: 'F',
  UserLName: 'L',
  UserCredit: 80,
};

const RESOURCE = {
  ResourceKey: 26,
  ManagedBy: 3,
  BufferTime: 0,
  BorrowRule: 3,
  BorrowRuleInfo: { RuleName: 'T1' },
  Item: { ItemID: 'EE-OSC-001', Item: { ItemName: 'Scope' } },
  Room: null,
};

function extensionRow() {
  return {
    ExtensionKey: 5,
    UsageKey: 501,
    RequestedBy: BORROWER_ROW.AccountKey,
    ExtendNo: 1,
    PreviousDueTime: new Date('2099-01-10T00:00:00Z'),
    RequestedDueTime: new Date('2099-01-15T00:00:00Z'),
    ApproveStatus: 'Pending',
    ApprovedBy: null,
    RequestedAt: new Date('2099-01-05T00:00:00Z'),
    ResolvedAt: null,
    Reason: 'need more time',
    RequestedByUser: BORROWER_ROW,
    Usage: {
      UsageKey: 501,
      ReservationKey: null,
      AccountKey: BORROWER_ROW.AccountKey,
      CurrentStatus: 'Lended',
      DueTime: new Date('2099-01-10T00:00:00Z'),
      PendingExtension: 5,
      Account: BORROWER_ROW,
      Resource: RESOURCE,
    },
  };
}

function build(row = extensionRow()) {
  const tx = {
    conditionLog: {
      create: jest.fn().mockResolvedValue({ ConditionKey: 900 }),
    },
    resourceInfo: { update: jest.fn().mockResolvedValue({}) },
    extensionRequest: { update: jest.fn().mockResolvedValue({}) },
    usageLog: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    usageLog: { findUnique: jest.fn().mockResolvedValue(row.Usage) },
    extensionRequest: {
      findUnique: jest.fn().mockResolvedValue(row),
      // Read back by render() after the decision; counts and limits are not
      // what this spec is about.
      groupBy: jest.fn().mockResolvedValue([]),
    },
    creditTier: { findMany: jest.fn().mockResolvedValue([]) },
    borrowConstraints: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((work: (t: unknown) => unknown) =>
      Promise.resolve(work(tx)),
    ),
  } as unknown as PrismaService;

  const scope = {
    assertResourceInScope: jest.fn().mockResolvedValue(undefined),
  } as unknown as StaffScopeService;
  const creditTiers = {
    tierMapper: jest.fn().mockResolvedValue(() => 'D0'),
  } as unknown as CreditTierService;
  const notifications = {
    extensionApproved: jest.fn().mockResolvedValue(undefined),
    extensionRejected: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationService;
  const audit = { record: jest.fn() };

  const service = new LoanExtensionService(
    prisma,
    scope,
    creditTiers,
    {} as EligibilityService,
    notifications,
    audit as never,
  );

  return { service, tx, audit };
}

describe('LoanExtensionService.decide — audit trail', () => {
  it('records the decision after rejecting succeeds', async () => {
    const { service, tx, audit } = build();

    await service.decide(SUPERVISOR, {
      extensionKey: 5,
      decision: 'reject',
      condition: 'Normal',
    });

    expect(tx.extensionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ApproveStatus: 'Rejected' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      { accountKey: SUPERVISOR.accountKey },
      'update',
      'extension/5',
      expect.any(String),
    );
  });

  it('does not record anything when the request was already decided', async () => {
    const { service, audit } = build(
      extensionRow() && { ...extensionRow(), ApproveStatus: 'Approved' },
    );

    await expect(
      service.decide(SUPERVISOR, {
        extensionKey: 5,
        decision: 'reject',
        condition: 'Normal',
      }),
    ).rejects.toThrow(/ALREADY_DECIDED/);
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('LoanExtensionService — rooms', () => {
  const borrower = {
    accountKey: BORROWER_ROW.AccountKey,
    role: 'borrower',
    facultyKey: null,
    creditScore: 80,
  } as TrpcUser;
  const roomLoan = () => {
    const row = extensionRow();
    return {
      ...row,
      Usage: {
        ...row.Usage,
        PendingExtension: null,
        Resource: {
          ...RESOURCE,
          BorrowRuleInfo: { RuleName: 'T3' },
          Item: null,
          Room: { RoomName: 'Lab 2' },
        },
      },
    };
  };

  it('refuses to extend a room booking', async () => {
    const { service } = build(roomLoan() as never);
    await expect(
      service.request(borrower, {
        usageKey: 501,
        requestedDueAt: '2099-01-10T01:00:00.000Z',
      }),
    ).rejects.toMatchObject({ businessCode: 'ROOM_NOT_EXTENDABLE' });
  });

  it('tells the borrower why before they ask', async () => {
    const { service } = build(roomLoan() as never);
    const options = await service.getOptions(borrower, 501);
    expect(options).toMatchObject({
      canRequest: false,
      blockedBy: 'ROOM_NOT_EXTENDABLE',
    });
  });
});
