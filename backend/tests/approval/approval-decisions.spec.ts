import { ApprovalService } from '../../src/approval/approval.service';
import {
  decideApprovalInput,
  listApprovalQueueInput,
} from '../../src/approval/approval.schema';
import type { TrpcUser } from '../../src/trpc/context';

function objectContaining(value: Record<string, unknown>): unknown {
  return expect.objectContaining(value) as unknown;
}

const start = new Date('2026-10-01T06:00:00.000Z');
const end = new Date('2026-10-02T06:00:00.000Z');

function reservation(changes: Record<string, unknown> = {}) {
  return {
    ReservationKey: 77,
    ReservedBy: 42,
    Reason: 'Lab project',
    StartTime: start,
    EndTime: end,
    ActionTime: new Date('2026-09-24T08:00:00.000Z'),
    ApproveStatus: 'Pending',
    AutoApproved: false,
    ResolvedAt: null,
    ReservedByUser: {
      AccountKey: 42,
      UserID: 'S12345',
      UserFName: 'Ada',
      UserLName: 'Lovelace',
      UserCredit: 100,
    },
    Resource: {
      ResourceKey: 7,
      ManagedBy: 1,
      BufferTime: 0,
      BorrowRuleInfo: { RuleName: 'T2' },
      Item: { ItemID: 'OSC-001', Item: { ItemName: 'Oscilloscope' } },
      Room: null,
    },
    ...changes,
  };
}

function setup(row = reservation()) {
  const prisma = {
    reservations: {
      findUnique: jest.fn().mockResolvedValue(row),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
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
  const requests = {
    getAsDecider: jest
      .fn()
      .mockResolvedValue({ reservationKey: 77, status: 'Approved' }),
  };
  const notifications = {
    requestApproved: jest.fn().mockResolvedValue(undefined),
    requestRejected: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new ApprovalService(
    prisma as never,
    scope as never,
    creditTiers as never,
    requests as never,
    notifications as never,
    audit as never,
  );
  return { service, prisma, scope, notifications, audit };
}

const supervisor: TrpcUser = {
  accountKey: 99,
  role: 'supervisor',
  facultyKey: null,
  creditScore: 100,
};

describe('ApprovalService decisions', () => {
  it('lists only the supervisor-routed rows with borrower credit and clashing requests', async () => {
    const { service, prisma, scope } = setup();
    prisma.reservations.findMany
      .mockResolvedValueOnce([reservation()])
      .mockResolvedValueOnce([
        {
          ReservationKey: 78,
          StartTime: start,
          EndTime: end,
          ReservedByUser: { UserFName: 'Grace', UserLName: 'Hopper' },
        },
      ]);

    const result = await service.listQueue(
      supervisor,
      listApprovalQueueInput.parse({ route: 'supervisor' }),
    );

    expect(scope.resourceScope).toHaveBeenCalledWith(supervisor);
    expect(result.items).toEqual([
      objectContaining({
        reservationKey: 77,
        route: 'supervisor',
        creditTier: 'D0',
        borrower: objectContaining({ creditScore: 100, studentId: 'S12345' }),
        clashesWith: [objectContaining({ reservationKey: 78 })],
      }),
    ]);
  });

  it('rejects a staff member deciding a T2 request before writing anything', async () => {
    const { service, prisma, notifications } = setup();

    await expect(
      service.decide(
        { ...supervisor, accountKey: 98, role: 'staff' },
        {
          reservationKey: 77,
          decision: 'approve',
        },
      ),
    ).rejects.toMatchObject({ message: 'APPROVAL_NEEDS_SUPERVISOR' });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notifications.requestApproved).not.toHaveBeenCalled();
  });

  it('prevents a supervisor from approving their own request', async () => {
    const { service, prisma } = setup(reservation({ ReservedBy: 99 }));

    await expect(
      service.decide(supervisor, { reservationKey: 77, decision: 'approve' }),
    ).rejects.toMatchObject({ message: 'CANNOT_APPROVE_OWN_REQUEST' });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires a nonblank reason for a rejection at the API boundary', () => {
    expect(
      decideApprovalInput.safeParse({
        reservationKey: 77,
        decision: 'reject',
        reason: '  ',
      }).success,
    ).toBe(false);
    expect(
      decideApprovalInput.safeParse({
        reservationKey: 77,
        decision: 'reject',
        reason: 'Unavailable',
      }).success,
    ).toBe(true);
  });

  it('approves one request and cancels clashing requests in the same transaction', async () => {
    const { service, prisma, notifications, audit } = setup();
    prisma.reservations.findMany.mockResolvedValueOnce([
      {
        ReservationKey: 78,
        StartTime: start,
        EndTime: end,
        ReservedByUser: {
          AccountKey: 43,
          UserID: 'S54321',
          UserFName: 'Grace',
          UserLName: 'Hopper',
          UserCredit: 80,
        },
      },
    ]);

    const result = await service.decide(supervisor, {
      reservationKey: 77,
      decision: 'approve',
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function) as unknown,
      objectContaining({ isolationLevel: 'Serializable' }),
    );
    const updateCalls = prisma.reservations.update.mock
      .calls as unknown as Array<
      [{ data: { ReservationExpiration: Date; ApprovedAt: Date } }]
    >;
    const update = updateCalls[0][0];
    expect(update.data).toEqual(
      objectContaining({
        ApproveStatus: 'Approved',
        ApprovedBy: 99,
        AutoApproved: false,
      }),
    );
    expect(
      update.data.ReservationExpiration.getTime() -
        update.data.ApprovedAt.getTime(),
    ).toBe(24 * 60 * 60 * 1000);
    expect(prisma.reservations.updateMany).toHaveBeenCalledWith(
      objectContaining({
        where: { ReservationKey: { in: [78] } },
        data: objectContaining({ ApproveStatus: 'Canceled' }),
      }),
    );
    expect(notifications.requestApproved).toHaveBeenCalledWith(
      prisma,
      objectContaining({
        accountKey: 42,
        reservationKey: 77,
      }),
    );
    expect(notifications.requestRejected).toHaveBeenCalledWith(
      prisma,
      objectContaining({
        accountKey: 43,
        reservationKey: 78,
      }),
    );
    expect(result.cancelled).toEqual([
      objectContaining({ reservationKey: 78 }),
    ]);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('leaves the request untouched when an approved booking already occupies the window', async () => {
    const { service, prisma, notifications } = setup();
    prisma.reservations.count.mockResolvedValueOnce(1);

    await expect(
      service.decide(supervisor, { reservationKey: 77, decision: 'approve' }),
    ).rejects.toMatchObject({ message: 'WINDOW_NOT_AVAILABLE' });

    expect(prisma.reservations.update).not.toHaveBeenCalled();
    expect(notifications.requestApproved).not.toHaveBeenCalled();
  });
});
