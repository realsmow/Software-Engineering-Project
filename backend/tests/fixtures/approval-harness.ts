import { ApprovalService } from '../../src/approval/approval.service';
import {
  decideApprovalOutput,
  paginatedApprovalQueue,
} from '../../src/approval/approval.schema';
import { LoanRequestService } from '../../src/loan/loan.request.service';
import { requestOutput } from '../../src/loan/loan.schema';
import { NotificationService } from '../../src/notification/notification.service';
import type { ApproveStatus } from '../../src/generated/prisma/enums';
import { withOutputContracts } from './output-contracts';

export const start = new Date('2026-10-01T06:00:00.000Z');
export const end = new Date('2026-10-02T06:00:00.000Z');

export function reservation(
  changes: Partial<ReturnType<typeof baseReservation>> = {},
) {
  return {
    ...baseReservation(),
    ...changes,
    ReservedByUser: changes.ReservedByUser ?? {
      ...baseReservation().ReservedByUser,
      AccountKey: changes.ReservedBy ?? 42,
    },
  };
}

function baseReservation() {
  return {
    ReservationKey: 77,
    ReservedBy: 42,
    Reason: 'Lab project',
    DecisionNote: null as string | null,
    StartTime: start,
    EndTime: end,
    ActionTime: new Date('2026-09-24T08:00:00.000Z'),
    ApproveStatus: 'Pending' as ApproveStatus,
    ApprovedBy: null as number | null,
    ApprovedAt: null as Date | null,
    ReservationExpiration: null as Date | null,
    AutoApproved: false,
    ResolvedAt: null as Date | null,
    ApprovedByUser: null as typeof borrower | null,
    ReservedByUser: borrower,
    UsageLogs: [],
    Resource: {
      ResourceKey: 7,
      ManagedBy: 1,
      BufferTime: 0,
      AllowBorrow: true,
      ResourceStatus: 'InStorage',
      BorrowRule: 3,
      BorrowRuleInfo: { RuleName: 'T2' },
      Item: {
        ItemID: 'OSC-001',
        Item: { ItemName: 'Oscilloscope', CreditWeight: 12 },
      },
      Room: null,
    },
  };
}

const borrower = {
  AccountKey: 42,
  UserID: 'S12345',
  UserFName: 'Ada',
  UserLName: 'Lovelace',
  UserCredit: 100,
};

export function setup(row = reservation()) {
  const prisma = {
    reservations: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(row)),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Partial<typeof row> }) => {
          Object.assign(row, data);
          if (row.ApprovedBy !== null)
            row.ApprovedByUser = {
              AccountKey: row.ApprovedBy,
              UserID: 'supervisor',
              UserFName: 'Loan',
              UserLName: 'Reviewer',
              UserCredit: 100,
            };
          return Promise.resolve(row);
        }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    notification: { upsert: jest.fn().mockResolvedValue(undefined) },
    // FR-NTF-03: approving looks up the department staff to tell.
    accountInfo: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  );
  const scope = {
    assertResourceInScope: jest.fn().mockResolvedValue(undefined),
    resourceScope: jest.fn().mockResolvedValue({ ManagedBy: 1 }),
  };
  const creditTiers = { tierMapper: jest.fn().mockResolvedValue(() => 'D0') };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const requests = withOutputContracts(
    new LoanRequestService(
      prisma as never,
      creditTiers as never,
      {} as never,
      { itemToPrepare: jest.fn(), requestNeedsSupervisor: jest.fn() } as never,
      audit as never,
    ),
    {
      getAsDecider: requestOutput,
    },
  );
  const notifications = new NotificationService(prisma as never);
  const notificationSpies = {
    requestApproved: jest.spyOn(notifications, 'requestApproved'),
    requestRejected: jest.spyOn(notifications, 'requestRejected'),
  };
  const service = withOutputContracts(
    new ApprovalService(
      prisma as never,
      scope as never,
      creditTiers as never,
      requests,
      notifications,
      audit as never,
      {} as never,
    ),
    {
      listQueue: paginatedApprovalQueue,
      decide: decideApprovalOutput,
    },
  );
  return {
    service,
    prisma,
    scope,
    notifications: notificationSpies,
    audit,
    row,
  };
}
