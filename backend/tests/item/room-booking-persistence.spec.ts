import { CreditTierService } from '../../src/common/credit/credit-tier.service';
import { withOutputContracts } from '../fixtures/output-contracts';
import {
  catalogContracts,
  requestContracts,
} from '../fixtures/service-contracts';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma.service';
import { requireIsolatedDatabase } from '../fixtures/isolated-database';
import { ItemService } from '../../src/item/item.service';
import { LoanRequestService } from '../../src/loan/loan.request.service';
import { EligibilityService } from '../../src/common/authority/eligibility.service';
import { listRoomsInput } from '../../src/item/item.schema';
import type { TrpcUser } from '../../src/trpc/context';
import type { Prisma, RoomInfo } from '../../src/generated/prisma/client';
import { inHistoryFixture } from '../fixtures/borrower-history';
import { pickupFixture } from '../fixtures/pickup';
import { requestService } from '../fixtures/loan-request';
import { freezeBusinessDate } from '../fixtures/business-clock';
import { StaffScopeService } from '../../src/common/authority/staff-scope.service';
import { PenaltyService } from '../../src/common/penalty/penalty.service';
import { InspectionService } from '../../src/inspection/inspection.service';
import { roomCheckOutput } from '../../src/inspection/inspection.schema';
import { loanOutput } from '../../src/loan/loan.schema';

describe('PDF p. 9: room bookings persist in the database', () => {
  let prisma: PrismaService;
  let createdCreditTier = false;
  const keys: Partial<
    Record<
      | 'role'
      | 'account'
      | 'group'
      | 'authorityRole'
      | 'rule'
      | 'tier'
      | 'resource'
      | 'room',
      number
    >
  > = {};

  beforeAll(async () => {
    requireIsolatedDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    // Delete only this suite's own rows, including partially created fixtures.
    if (keys.resource) {
      await prisma.reservations.deleteMany({
        where: { ResourceKey: keys.resource },
      });
      await prisma.eligibility.deleteMany({
        where: { ResourceKey: keys.resource },
      });
      await prisma.usageLog.deleteMany({
        where: { ResourceKey: keys.resource },
      });
      await prisma.conditionLog.deleteMany({
        where: { ResourceKey: keys.resource },
      });
      await prisma.roomInfo.deleteMany({
        where: { ResourceKey: keys.resource },
      });
      await prisma.resourceInfo.deleteMany({
        where: { ResourceKey: keys.resource },
      });
    }
    if (keys.account) {
      await prisma.authority.deleteMany({
        where: { AccountKey: keys.account },
      });
      await prisma.accountInfo.deleteMany({
        where: { AccountKey: keys.account },
      });
    }
    if (keys.rule)
      await prisma.borrowConstraints.deleteMany({
        where: { BorrowRuleKey: keys.rule },
      });
    if (keys.group)
      await prisma.managementGroup.deleteMany({
        where: { ManageGroupKey: keys.group },
      });
    if (keys.authorityRole)
      await prisma.authorityRole.deleteMany({
        where: { AuthorityRoleKey: keys.authorityRole },
      });
    if (createdCreditTier && keys.tier)
      await prisma.creditTier.deleteMany({
        where: {
          CreditTierKey: keys.tier,
          CreditTierName: { notIn: ['D0', 'D1', 'D2', 'D3'] },
        },
      });
    if (keys.rule)
      await prisma.borrowRule.deleteMany({
        where: { BorrowRuleKey: keys.rule },
      });
    if (keys.role)
      // Built-in role names are shared lookup rows even when this suite creates them.
      await prisma.roleInfo.deleteMany({
        where: {
          RoleKey: keys.role,
          RoleName: {
            notIn: ['Admin', 'Staff', 'Student', 'Borrower', 'Supervisor'],
          },
        },
      });
    await prisma?.$disconnect();
  });

  it('lists the real room, stores its request, holds its slots, and releases them after cancellation', async () => {
    const token = `pdf-room-${randomUUID()}`;
    keys.role = (
      await prisma.roleInfo.create({ data: { RoleName: 'Student' } })
    ).RoleKey;
    keys.account = (
      await prisma.accountInfo.create({
        data: {
          Email: `${token}@example.test`,
          UserID: token,
          HashedPassword: 'unused-test-hash',
          UserFName: 'PDF',
          UserLName: 'Borrower',
          UserCredit: 100,
          RoleKey: keys.role,
        },
      })
    ).AccountKey;
    keys.group = (
      await prisma.managementGroup.create({ data: { GroupType: 'Faculty' } })
    ).ManageGroupKey;
    keys.authorityRole = (
      await prisma.authorityRole.create({
        data: { AuthorityName: token, AuthorityLevel: 0 },
      })
    ).AuthorityRoleKey;
    keys.rule = (
      await prisma.borrowRule.create({ data: { RuleName: 'T3' } })
    ).BorrowRuleKey;
    const existingTier = await prisma.creditTier.findFirst({
      where: {
        CreditTierName: 'D0',
        CreditMin: { lte: 100 },
        CreditMax: { gte: 100 },
      },
      orderBy: { CreditMin: 'desc' },
    });
    if (existingTier) keys.tier = existingTier.CreditTierKey;
    else {
      keys.tier = (
        await prisma.creditTier.create({
          data: { CreditTierName: 'D0', CreditMin: 80, CreditMax: 100 },
        })
      ).CreditTierKey;
      createdCreditTier = true;
    }
    await prisma.borrowConstraints.create({
      data: {
        BorrowRuleKey: keys.rule,
        CreditTierKey: keys.tier,
        MaxBorrowDate: 14,
        MaxExtendTime: 0,
      },
    });
    await prisma.authority.create({
      data: {
        AccountKey: keys.account,
        ManageGroupKey: keys.group,
        AuthorityRoleKey: keys.authorityRole,
      },
    });
    keys.resource = (
      await prisma.resourceInfo.create({
        data: {
          ManagedBy: keys.group,
          BorrowRule: keys.rule,
          ResourceStatus: 'InStorage',
          ResourceType: 'Room',
          BufferTime: 0,
          AllowBorrow: true,
        },
      })
    ).ResourceKey;
    keys.room = (
      await prisma.roomInfo.create({
        data: {
          ResourceKey: keys.resource,
          RoomName: token,
          RoomLocation: 'Test building',
          CreditWeight: 1,
          Capacity: 24,
        },
      })
    ).RoomKey;
    await prisma.eligibility.create({
      data: {
        GroupKey: keys.group,
        RoleKey: keys.authorityRole,
        ResourceKey: keys.resource,
      },
    });

    const user: TrpcUser = {
      accountKey: keys.account,
      role: 'borrower',
      facultyKey: null,
      creditScore: 100,
    };
    // Resolve credit from the real tier rows, alongside real eligibility and storage.
    const tiers = new CreditTierService(prisma);
    const audit = { record: jest.fn() };
    const service = () =>
      withOutputContracts(
        new LoanRequestService(
          prisma,
          tiers,
          new EligibilityService(prisma),
          {
            itemToPrepare: jest.fn(),
            requestNeedsSupervisor: jest.fn(),
          } as never,
          audit as never,
        ),
        requestContracts,
      );
    const catalog = withOutputContracts(
      new ItemService(prisma),
      catalogContracts,
    );
    const listed = await catalog.listRooms(listRoomsInput.parse({ q: token }));
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({
      id: keys.room,
      name: token,
      bookable: true,
    });

    // Freeze Date only; keep database/network timers real. The room policy is
    // same-day, so this must also run at night without skipping the test.
    jest.useFakeTimers({
      now: new Date('2031-09-26T00:00:00.000Z'),
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
    try {
      const booking = await service().createRoomBooking(user, {
        roomKey: keys.room,
        date: '2031-09-26',
        slots: [2, 3],
        reason: token,
      });
      expect(booking.rejected).toEqual([]);
      expect(booking.created).toHaveLength(1);
      const key = booking.created[0].reservationKey;
      expect(
        await prisma.reservations.findUnique({
          where: { ReservationKey: key },
        }),
      ).toMatchObject({
        ResourceKey: keys.resource,
        ReservedBy: keys.account,
        ApproveStatus: 'Approved',
        AutoApproved: true,
      });
      const history = await service().listMine(user, { page: 1, pageSize: 20 });
      expect(history.items[0]).toMatchObject({
        reservationKey: key,
        resource: { name: token, kind: 'room' },
        status: 'approved',
        approval: { route: 'auto', status: 'Approved', autoApproved: true },
      });
      const held = await catalog.roomAvailability(user, {
        roomKey: keys.room,
        date: '2031-09-26',
      });
      expect(
        held.slots
          .filter((slot) => [2, 3].includes(slot.index))
          .map((slot) => slot.available),
      ).toEqual([false, false]);
      // Staff prepare the room (#162): the borrower can still cancel until
      // check-in, and the prepared row goes with the booking.
      const condition = await prisma.conditionLog.create({
        data: {
          ResourceKey: keys.resource,
          LoggedBy: keys.account,
          Condition: 'Normal',
          LoggedAt: new Date(),
        },
      });
      await prisma.usageLog.create({
        data: {
          ReservationKey: key,
          AccountKey: keys.account,
          ResourceKey: keys.resource,
          CurrentStatus: 'Prepared',
          DueTime: new Date('2031-09-26T04:00:00.000Z'),
          CheckoutTime: new Date(),
          CheckoutCondition: condition.ConditionKey,
        },
      });
      expect(
        (await service().listMine(user, { page: 1, pageSize: 20 })).items[0]
          .cancellable,
      ).toBe(true);
      await service().cancel(user, { reservationKey: key });
      expect(
        await prisma.usageLog.count({ where: { ReservationKey: key } }),
      ).toBe(0);
      const released = await catalog.roomAvailability(user, {
        roomKey: keys.room,
        date: '2031-09-26',
      });
      expect(
        released.slots
          .filter((slot) => [2, 3].includes(slot.index))
          .map((slot) => slot.available),
      ).toEqual([true, true]);
    } finally {
      jest.useRealTimers();
    }
  });
});

// Reuse the established borrower/staff fixture; rooms get their own T3 rule
// rather than changing the fixture's equipment rule.
const ROOM_DAY = '2031-09-26';
async function roomRegressionFixture(tx: Prisma.TransactionClient) {
  const f = await pickupFixture(tx);
  const rule = await tx.borrowRule.create({ data: { RuleName: 'T3' } });
  const band = await tx.creditTier.findFirstOrThrow({
    where: { CreditTierName: 'D0' },
  });
  await tx.borrowConstraints.create({
    data: {
      BorrowRuleKey: rule.BorrowRuleKey,
      CreditTierKey: band.CreditTierKey,
      MaxBorrowDate: 1,
      MaxExtendTime: 0,
    },
  });
  const rooms: RoomInfo[] = [];
  for (const index of [0, 1]) {
    rooms.push(
      await tx.roomInfo.create({
        data: {
          RoomName: `Regression room ${index}`,
          CreditWeight: 0,
          Capacity: 24,
          OpenTime: 540,
          CloseTime: 1020,
          BreakStart: null,
          BreakEnd: null,
          Resource: {
            create: {
              BorrowRule: rule.BorrowRuleKey,
              ManagedBy: f.group.ManageGroupKey,
              ResourceType: 'Room',
              ResourceStatus: 'InStorage',
              AllowBorrow: true,
              BufferTime: 0,
              Eligibilities: {
                create: {
                  GroupKey: f.group.ManageGroupKey,
                  RoleKey: f.authorityRole.AuthorityRoleKey,
                },
              },
            },
          },
        },
      }),
    );
  }
  const requests = withOutputContracts(
    requestService(f.client).service,
    requestContracts,
  );
  const catalog = withOutputContracts(
    new ItemService(f.client),
    catalogContracts,
  );
  const book = (slots = [0, 1], borrower = 0, room = 0) =>
    requests.createRoomBooking(f.users[borrower], {
      roomKey: rooms[room].RoomKey,
      date: ROOM_DAY,
      slots,
    });
  const prepare = async (slots = [0, 1]) => {
    const booking = await book(slots);
    expect(booking.rejected).toEqual([]);
    expect(booking.created).toHaveLength(1);
    const usage = loanOutput.strict().parse(
      await f.loan.allocate(f.staff, {
        reservationKey: booking.created[0].reservationKey,
        condition: 'Normal',
      }),
    );
    expect(usage.status).toBe('Prepared');
    await tx.images.create({
      data: {
        UsageKey: usage.usageKey,
        ResourceKey: rooms[0].ResourceKey,
        SubmittedBy: f.users[0].accountKey,
        SubmissionType: 'BeforePicture',
        ImageURL: '/qa-room-before.png',
      },
    });
    return { booking, usage };
  };
  const checkIn = async (caller: 'borrower' | 'staff', usageKey: number) => {
    const [result] = await Promise.allSettled([
      caller === 'borrower'
        ? requests.confirmMyPickup(f.users[0], usageKey)
        : f.loan
            .confirmPickup(f.staff, { usageKey })
            .then((value) => loanOutput.strict().parse(value)),
    ]);
    // A database/contract/setup failure must never become an expected defect.
    if (result.status === 'rejected') {
      expect(result.reason).toMatchObject({ businessCode: expect.any(String) });
    }
    const row = await tx.usageLog.findUniqueOrThrow({
      where: { UsageKey: usageKey },
    });
    const resource = await tx.resourceInfo.findUniqueOrThrow({
      where: { ResourceKey: rooms[0].ResourceKey },
    });
    return {
      accepted: result.status === 'fulfilled',
      state: row.CurrentStatus,
      resourceStatus: resource.ResourceStatus,
      due: row.DueTime.toISOString(),
      checkout: row.CheckoutTime.toISOString(),
    };
  };
  return { ...f, rooms, requests, catalog, book, prepare, checkIn };
}

type RoomCheckIn = Awaited<
  ReturnType<Awaited<ReturnType<typeof roomRegressionFixture>>['checkIn']>
>;

describe('selected room regressions', () => {
  let db: PrismaService;
  beforeAll(async () => {
    requireIsolatedDatabase();
    db = new PrismaService();
    await db.$connect();
  });
  beforeEach(() => freezeBusinessDate(new Date(`${ROOM_DAY}T00:00:00Z`)));
  afterEach(() => jest.useRealTimers());
  afterAll(async () => {
    await db?.$disconnect();
  });

  for (const caller of ['borrower', 'staff'] as const) {
    for (const [boundary, time] of [
      ['at end', '2031-09-26T03:00:00.000Z'],
      ['after end', '2031-09-26T03:00:00.001Z'],
      ['after collection deadline without cron', '2031-09-27T02:00:00.001Z'],
    ] as const) {
      describe(`${caller}: ${boundary}`, () => {
        let result: RoomCheckIn;
        beforeEach(async () => {
          result = await inHistoryFixture(db, async (tx) => {
            const f = await roomRegressionFixture(tx);
            const { booking, usage } = await f.prepare();
            expect(booking.created[0].endTime).toBe(
              `${ROOM_DAY}T03:00:00.000Z`,
            );
            expect(
              new Date(booking.created[0].expiresAt!).getTime(),
            ).toBeGreaterThan(new Date(booking.created[0].endTime).getTime());
            jest.setSystemTime(new Date(time));
            return f.checkIn(caller, usage.usageKey);
          });
        });
        it.failing(
          'refuses expired check-in and preserves the prepared booking',
          () => {
            expect(result).toEqual({
              accepted: false,
              state: 'Prepared',
              resourceStatus: 'InStorage',
              due: `${ROOM_DAY}T03:00:00.000Z`,
              checkout: `${ROOM_DAY}T02:00:00.000Z`,
            });
          },
        );
      });
    }
    it(`${caller} can check in immediately before end`, async () => {
      await inHistoryFixture(db, async (tx) => {
        const f = await roomRegressionFixture(tx);
        const { usage } = await f.prepare();
        jest.setSystemTime(new Date(`${ROOM_DAY}T02:59:59.999Z`));
        expect(await f.checkIn(caller, usage.usageKey)).toMatchObject({
          accepted: true,
          state: 'Lended',
          resourceStatus: 'Lended',
          due: `${ROOM_DAY}T03:00:00.000Z`,
        });
      });
    });
    describe(`${caller}: real inspection closes a prepared room`, () => {
      let result: RoomCheckIn;
      beforeEach(async () => {
        result = await inHistoryFixture(db, async (tx) => {
          const f = await roomRegressionFixture(tx);
          const { usage } = await f.prepare();
          const inspection = new InspectionService(
            f.client,
            new StaffScopeService(f.client),
            new PenaltyService(f.client),
            {} as never,
            f.audit as never,
            f.notifications,
          );
          const check = roomCheckOutput.strict().parse(
            await inspection.recordRoomCheck(f.staff, {
              resourceKey: f.rooms[0].ResourceKey,
              condition: 'Broken',
            }),
          );
          expect(check.stillBookable).toBe(false);
          expect(
            (
              await tx.resourceInfo.findUniqueOrThrow({
                where: { ResourceKey: f.rooms[0].ResourceKey },
              })
            ).AllowBorrow,
          ).toBe(false);
          jest.setSystemTime(new Date(`${ROOM_DAY}T02:00:00Z`));
          return f.checkIn(caller, usage.usageKey);
        });
      });
      it.failing('refuses entry after closure and keeps usage Prepared', () => {
        expect(result).toMatchObject({
          accepted: false,
          state: 'Prepared',
          resourceStatus: 'InStorage',
          checkout: `${ROOM_DAY}T02:00:00.000Z`,
        });
      });
    });
    it(`control: a Normal inspection permits ${caller} check-in`, async () => {
      await inHistoryFixture(db, async (tx) => {
        const f = await roomRegressionFixture(tx);
        const { usage } = await f.prepare();
        const inspection = new InspectionService(
          f.client,
          new StaffScopeService(f.client),
          new PenaltyService(f.client),
          {} as never,
          f.audit as never,
          f.notifications,
        );
        expect(
          roomCheckOutput.strict().parse(
            await inspection.recordRoomCheck(f.staff, {
              resourceKey: f.rooms[0].ResourceKey,
              condition: 'Normal',
            }),
          ).stillBookable,
        ).toBe(true);
        jest.setSystemTime(new Date(`${ROOM_DAY}T02:00:00Z`));
        expect(await f.checkIn(caller, usage.usageKey)).toMatchObject({
          accepted: true,
          state: 'Lended',
        });
      });
    });
  }

  describe('later preparation must leave earlier disjoint slots bookable', () => {
    let result: { created: number; rejected: string[]; persisted: number };
    beforeEach(async () => {
      result = await inHistoryFixture(db, async (tx) => {
        const f = await roomRegressionFixture(tx);
        await f.prepare([8, 9]); // 13:00-14:00
        const calendar = await f.catalog.roomAvailability(f.users[1], {
          roomKey: f.rooms[0].RoomKey,
          date: ROOM_DAY,
        });
        expect(
          calendar.slots.slice(0, 2).map((slot) => slot.available),
        ).toEqual([true, true]);
        const booking = await f.book([0, 1], 1); // 09:00-10:00
        return {
          created: booking.created.length,
          rejected: booking.rejected.map((row) => row.code),
          persisted: await tx.reservations.count({
            where: { ResourceKey: f.rooms[0].ResourceKey },
          }),
        };
      });
    });
    it.failing(
      'accepts the morning booking and persists both disjoint reservations',
      () => {
        expect(result).toEqual({ created: 1, rejected: [], persisted: 2 });
      },
    );
  });
  it('controls: overlap refused; adjacent later booking accepted', async () => {
    await inHistoryFixture(db, async (tx) => {
      const f = await roomRegressionFixture(tx);
      await f.prepare([8, 9]);
      const overlap = await f.book([9, 10], 1);
      expect(overlap.created).toEqual([]);
      expect(overlap.rejected[0].code).toBe('WINDOW_NOT_AVAILABLE');
      const adjacent = await f.book([10, 11], 1);
      expect(adjacent.created).toHaveLength(1);
      expect(adjacent.rejected).toEqual([]);
    });
  });
  it('two disjoint reservations before preparation are accepted', async () => {
    await inHistoryFixture(db, async (tx) => {
      const f = await roomRegressionFixture(tx);
      expect((await f.book([8, 9])).created).toHaveLength(1);
      expect((await f.book([0, 1], 1)).created).toHaveLength(1);
    });
  });
  it('backend control: Approved already consumes the one-booking quota', async () => {
    await inHistoryFixture(db, async (tx) => {
      const f = await roomRegressionFixture(tx);
      expect((await f.book()).created[0].status).toBe('approved');
      const second = await f.book([4, 5], 0, 1);
      expect(second.created).toEqual([]);
      expect(second.rejected[0].code).toBe('ROOM_BOOKING_LIMIT_REACHED');
    });
  });
  for (const state of ['Prepared', 'Lended'] as const) {
    it(`backend control: expired ${state} does not consume quota for another room`, async () => {
      await inHistoryFixture(db, async (tx) => {
        const f = await roomRegressionFixture(tx);
        const { usage } = await f.prepare();
        if (state === 'Lended') {
          jest.setSystemTime(new Date(`${ROOM_DAY}T02:00:00Z`));
          expect((await f.checkIn('borrower', usage.usageKey)).state).toBe(
            'Lended',
          );
        }
        jest.setSystemTime(new Date(`${ROOM_DAY}T03:00:00Z`));
        expect(
          (await f.requests.listMine(f.users[0], { page: 1, pageSize: 20 }))
            .items[0].status,
        ).toBe(state === 'Prepared' ? 'ready' : 'inUse');
        const next = await f.book([4, 5], 0, 1);
        expect(next.created).toHaveLength(1);
        expect(next.rejected).toEqual([]);
      });
    });
  }
});
