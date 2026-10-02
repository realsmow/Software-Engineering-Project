import type { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma.service';
import { ApprovalService } from '../../src/approval/approval.service';
import {
  approvalCounts,
  decideApprovalInput,
  listApprovalQueueInput,
} from '../../src/approval/approval.schema';
import { StaffScopeService } from '../../src/common/authority/staff-scope.service';
import { CreditTierService } from '../../src/common/credit/credit-tier.service';
import {
  historyFixture,
  inHistoryFixture,
  requireIsolatedDatabase,
  transactionClient,
} from '../fixtures/borrower-history';
import { freezeBusinessDate } from '../fixtures/business-clock';
import type { TrpcUser } from '../../src/trpc/context';
import { setup, reservation, start, end } from '../fixtures/approval-harness';

function objectContaining(value: Record<string, unknown>): unknown {
  return expect.objectContaining(value) as unknown;
}

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

// Real service/adapter assertions share this module's suite; setup is scoped.
describe('Persisted business records', () => {
  const NOW = new Date('2031-09-26T03:00:00Z');

  function service(tx: Prisma.TransactionClient) {
    const client = transactionClient(tx);
    return new ApprovalService(
      client,
      new StaffScopeService(client),
      new CreditTierService(client),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  async function request(
    tx: Prisma.TransactionClient,
    resourceKey: number,
    accountKey: number,
    start: Date,
  ) {
    return tx.reservations.create({
      data: {
        ResourceKey: resourceKey,
        ReservedBy: accountKey,
        StartTime: start,
        EndTime: new Date(start.getTime() + 3_600_000),
        ApproveStatus: 'Pending',
        ActionTime: NOW,
        ReservationExpiration: new Date(start.getTime() + 3_600_000),
      },
    });
  }

  describe('FR-APV-01: approval dashboard counts, scope and Bangkok day boundary', () => {
    let prisma: PrismaService;
    beforeAll(async () => {
      requireIsolatedDatabase();
      prisma = new PrismaService();
      await prisma.$connect();
    });
    afterAll(async () => prisma?.$disconnect());
    beforeEach(() => freezeBusinessDate(NOW));
    afterEach(() => jest.useRealTimers());

    it('counts supervisor and fallback staff routes only in scope, with strict overdue boundary', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const own = await historyFixture(tx),
          legacy = await historyFixture(tx),
          foreign = await historyFixture(tx);
        // A rule outside T0-T3 is legacy/unconfigured data and needs a staff look.
        await tx.borrowRule.update({
          where: { BorrowRuleKey: legacy.rule.BorrowRuleKey },
          data: { RuleName: 'legacy-unconfigured' },
        });
        await tx.resourceInfo.update({
          where: { ResourceKey: legacy.resource.ResourceKey },
          data: { ManagedBy: own.group.ManageGroupKey },
        });
        await request(
          tx,
          own.resource.ResourceKey,
          own.borrower.AccountKey,
          NOW,
        );
        await request(
          tx,
          legacy.resource.ResourceKey,
          legacy.borrower.AccountKey,
          new Date(NOW.getTime() - 1),
        );
        await request(
          tx,
          foreign.resource.ResourceKey,
          foreign.borrower.AccountKey,
          new Date(NOW.getTime() - 1),
        );
        const output = approvalCounts
          .strict()
          .parse(await service(tx).counts(own.decider));
        expect(output).toMatchObject({
          staff: 1,
          supervisor: 1,
          overdueToDecide: 1,
          autoApprovedToday: 0,
          retirement: 0,
          asOf: NOW.toISOString(),
        });
      });
    });

    it('includes auto approvals from Bangkok midnight, excludes the previous day, and scopes retirement requests', async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const own = await historyFixture(tx),
          foreign = await historyFixture(tx);
        await tx.borrowRule.update({
          where: { BorrowRuleKey: own.rule.BorrowRuleKey },
          data: { RuleName: 'T1' },
        });
        const midnight = new Date('2031-09-25T17:00:00.000Z');
        for (const [index, approvedAt] of [
          midnight,
          new Date(midnight.getTime() - 1),
        ].entries()) {
          const row = await request(
            tx,
            own.resource.ResourceKey,
            own.borrower.AccountKey,
            new Date(NOW.getTime() + (index + 1) * 86_400_000),
          );
          await tx.reservations.update({
            where: { ReservationKey: row.ReservationKey },
            data: {
              ApproveStatus: 'Approved',
              AutoApproved: true,
              ApprovedAt: approvedAt,
            },
          });
        }
        for (const f of [own, foreign])
          await tx.retirementRequest.create({
            data: {
              ResourceKey: f.resource.ResourceKey,
              RequestedBy: f.decider.accountKey,
              Reason: 'Beyond repair',
              ApproveStatus: 'Pending',
              RequestedAt: NOW,
            },
          });
        expect(await service(tx).counts(own.decider)).toMatchObject({
          staff: 0,
          supervisor: 0,
          overdueToDecide: 0,
          autoApprovedToday: 1,
          retirement: 1,
        });
      });
    });
  });
});
