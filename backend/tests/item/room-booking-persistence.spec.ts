import { CreditTierService } from '../../src/common/credit/credit-tier.service';
import { withOutputContracts } from '../fixtures/output-contracts';
import {
  catalogContracts,
  requestContracts,
} from '../fixtures/service-contracts';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma.service';
import { ItemService } from '../../src/item/item.service';
import { LoanRequestService } from '../../src/loan/loan.request.service';
import { EligibilityService } from '../../src/common/authority/eligibility.service';
import { listRoomsInput } from '../../src/item/item.schema';
import type { TrpcUser } from '../../src/trpc/context';

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
        ApproveStatus: 'Pending',
      });
      const history = await service().listMine(user, { page: 1, pageSize: 20 });
      expect(history.items[0]).toMatchObject({
        reservationKey: key,
        resource: { name: token, kind: 'room' },
        status: 'pending',
      });
      const held = await catalog.roomAvailability({
        roomKey: keys.room,
        date: '2031-09-26',
      });
      expect(
        held.slots
          .filter((slot) => [2, 3].includes(slot.index))
          .map((slot) => slot.available),
      ).toEqual([false, false]);
      await service().cancel(user, { reservationKey: key });
      const released = await catalog.roomAvailability({
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
