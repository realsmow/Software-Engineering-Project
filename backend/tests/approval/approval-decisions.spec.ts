import {
  decideApprovalInput,
  listApprovalQueueInput,
} from '../../src/approval/approval.schema';
import type { TrpcUser } from '../../src/trpc/context';

function objectContaining(value: Record<string, unknown>): unknown {
  return expect.objectContaining(value) as unknown;
}

import { setup, reservation, start, end } from '../fixtures/approval-harness';

const supervisor: TrpcUser = {
  accountKey: 99,
  role: 'supervisor',
  facultyKey: null,
  creditScore: 100,
};

describe('ApprovalService decisions', () => {
  afterEach(() => jest.useRealTimers());
  it('lists only the supervisor-routed rows with borrower credit and clashing requests', async () => {
    const { service, prisma, scope } = setup();
    prisma.reservations.count.mockResolvedValueOnce(1);
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
    expect(prisma.reservations.update).not.toHaveBeenCalled();
  });

  it('requires a nonblank reason for a rejection at the API boundary', () => {
    for (const reason of ['', '   ', undefined]) {
      expect(
        decideApprovalInput.safeParse({
          reservationKey: 77,
          decision: 'reject',
          reason,
        }).success,
      ).toBe(false);
    }
    expect(
      decideApprovalInput.safeParse({
        reservationKey: 77,
        decision: 'reject',
        reason: 'Unavailable',
      }).success,
    ).toBe(true);
    expect(
      decideApprovalInput.safeParse({ reservationKey: 77, decision: 'approve' })
        .success,
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
        Math.max(start.getTime(), update.data.ApprovedAt.getTime()),
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

  it('decides each reservation in a multi-item basket independently, allowing partial approval', async () => {
    const accepted = setup(reservation());
    const refused = setup(reservation({ ReservationKey: 78 }));
    const approved = await accepted.service.decide(
      supervisor,
      decideApprovalInput.parse({ reservationKey: 77, decision: 'approve' }),
    );
    const rejected = await refused.service.decide(
      supervisor,
      decideApprovalInput.parse({
        reservationKey: 78,
        decision: 'reject',
        reason: 'Unavailable in stock',
      }),
    );
    // The API represents a basket as independent reservations; there is no
    // invented aggregate status such as "partially-approved".
    expect(approved.request).toMatchObject({
      reservationKey: 77,
      status: 'approved',
    });
    expect(rejected.request).toMatchObject({
      reservationKey: 78,
      status: 'rejected',
      decisionNote: 'Unavailable in stock',
    });
  });

  it.each([
    ['ahead of pickup', '2026-09-26T08:00:00.000Z', '2026-10-02T06:00:00.000Z'],
    [
      'after pickup opens',
      '2026-10-01T07:00:00.000Z',
      '2026-10-02T07:00:00.000Z',
    ],
  ])(
    'gives a full 24-hour pickup window when approved %s',
    async (_case, approvedAt, expiresAt) => {
      jest.useFakeTimers({ now: new Date(approvedAt) });
      const { service, row } = setup();
      const result = await service.decide(supervisor, {
        reservationKey: 77,
        decision: 'approve',
      });
      expect(row.ApprovedAt).toBeInstanceOf(Date);
      expect(
        row.ReservationExpiration!.getTime() -
          Math.max(row.StartTime.getTime(), row.ApprovedAt!.getTime()),
      ).toBe(86_400_000);
      expect(result.request.expiresAt).toBe(expiresAt);
    },
  );

  it('persists a real borrower notification when approval changes the reservation status', async () => {
    const { service, prisma } = setup();
    const result = await service.decide(supervisor, {
      reservationKey: 77,
      decision: 'approve',
    });
    expect(result.request.status).toBe('approved');
    expect(prisma.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          AccountKey: 42,
          NotificationType: 'RequestApproved',
          DedupeKey: 'reservation:77',
          LinkTo: '/pickup',
        }) as unknown,
      }),
    );
    expect(prisma.accountInfo.findMany).toHaveBeenCalledWith({
      where: {
        Role: { RoleName: 'Staff' },
        Authorities: { some: { ManageGroupKey: 1 } },
      },
      select: { AccountKey: true },
    });
    expect(prisma.notification.upsert).toHaveBeenCalledWith(
      objectContaining({
        create: objectContaining({
          AccountKey: 98,
          NotificationType: 'StaffTask',
          DedupeKey: 'reservation:77',
          LinkTo: '/staff',
        }),
      }),
    );
  });
});
