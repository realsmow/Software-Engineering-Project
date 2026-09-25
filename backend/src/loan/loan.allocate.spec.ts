import { LoanService } from './loan.service';
import type { PrismaService } from '../prisma.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { PenaltyService } from '../common/penalty/penalty.service';
import type { NotificationService } from '../notification/notification.service';
import type { TrpcUser } from '../trpc/context';

/**
 * Preparing a request with a different unit than the one reserved.
 *
 * A T2 request is approved for one serial, so preparing another hands out a
 * unit nobody approved. swapUnit refused that at pickup, but allocate reached
 * the same result at preparation without looking at the tier.
 */
const staff = {
  accountKey: 4,
  role: 'staff',
  facultyKey: null,
  creditScore: 100,
} as TrpcUser;

function reserved(ruleName: string) {
  return {
    ReservationKey: 11,
    ReservedBy: 3,
    ApproveStatus: 'Approved',
    StartTime: new Date('2099-01-10T02:00:00Z'),
    EndTime: new Date('2099-01-11T09:00:00Z'),
    Resource: {
      ResourceKey: 26,
      ManagedBy: 3,
      BufferTime: 0,
      BorrowRule: 3,
      BorrowRuleInfo: { RuleName: ruleName },
      Item: {
        ItemKey: 7,
        ItemID: 'EE-OSC-001',
        Item: { ItemName: 'Scope', CreditWeight: 3 },
      },
      Room: null,
    },
    UsageLogs: [],
  };
}

function service(ruleName: string) {
  const findTarget = jest.fn().mockResolvedValue(null);
  const prisma = {
    reservations: {
      findUnique: jest.fn().mockResolvedValue(reserved(ruleName)),
    },
    resourceInfo: { findUnique: findTarget },
  } as unknown as PrismaService;
  const scope = {
    assertResourceInScope: jest.fn(),
  } as unknown as StaffScopeService;
  const audit = { record: jest.fn() };
  return {
    svc: new LoanService(
      prisma,
      scope,
      {} as PenaltyService,
      {} as NotificationService,
      audit as any,
    ),
    findTarget,
    audit,
  };
}

it('refuses to prepare a different unit for a T2 request', async () => {
  const t = service('T2');
  await expect(
    t.svc.allocate(staff, {
      reservationKey: 11,
      resourceKey: 27,
      condition: 'Normal',
    }),
  ).rejects.toMatchObject({ businessCode: 'UNIT_SWAP_NOT_ALLOWED' });
  expect(t.findTarget).not.toHaveBeenCalled();
  expect(t.audit.record).not.toHaveBeenCalled();
});

it('still lets a T1 request go out on another unit of the same type', async () => {
  const t = service('T1');
  // Past the tier guard, the target is looked up; null here stops it there.
  await expect(
    t.svc.allocate(staff, {
      reservationKey: 11,
      resourceKey: 27,
      condition: 'Normal',
    }),
  ).rejects.toMatchObject({ businessCode: 'RESOURCE_NOT_FOUND' });
  expect(t.findTarget).toHaveBeenCalled();
});

describe('recordReturn', () => {
  function svcWithPhotos(count: number) {
    const prisma = {
      images: {
        findFirst: jest
          .fn()
          .mockResolvedValue(count > 0 ? { ImageKey: 1 } : null),
      },
    } as unknown as PrismaService;
    const scope = {
      assertResourceInScope: jest.fn(),
    } as unknown as StaffScopeService;
    const penalties = {
      overdueDays: jest.fn(() => {
        throw new Error('reached lateness');
      }),
    } as unknown as PenaltyService;
    const audit = { record: jest.fn() };
    const svc = new LoanService(
      prisma,
      scope,
      penalties,
      {} as NotificationService,
      audit as any,
    );
    // The usage read is not what is under test.
    Object.assign(svc, {
      readUsage: jest.fn().mockResolvedValue({
        CurrentStatus: 'Lended',
        DueTime: new Date(),
        Resource: { ResourceKey: 26 },
      }),
    });
    return { svc, audit };
  }

  it('refuses a return nobody photographed', async () => {
    const t = svcWithPhotos(0);
    await expect(
      t.svc.recordReturn(staff, { usageKey: 8 }),
    ).rejects.toMatchObject({
      businessCode: 'RETURN_PHOTO_REQUIRED',
    });
    expect(t.audit.record).not.toHaveBeenCalled();
  });

  it('goes on to settle lateness once an after photo is on file', async () => {
    const t = svcWithPhotos(1);
    await expect(t.svc.recordReturn(staff, { usageKey: 8 })).rejects.toThrow(
      'reached lateness',
    );
    expect(t.audit.record).not.toHaveBeenCalled();
  });
});

describe('allocate — audit trail', () => {
  function svcAllocating() {
    const row = reserved('T1');
    const tx = {
      conditionLog: {
        create: jest.fn().mockResolvedValue({ ConditionKey: 900 }),
      },
      usageLog: { create: jest.fn().mockResolvedValue({ UsageKey: 501 }) },
      resourceInfo: { update: jest.fn().mockResolvedValue({}) },
      reservations: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      reservations: { findUnique: jest.fn().mockResolvedValue(row) },
      resourceInfo: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ResourceStatus: 'InStorage',
          AllowBorrow: true,
          UsageLogs: [],
        }),
      },
      $transaction: jest.fn((work: (t: typeof tx) => unknown) => work(tx)),
    } as unknown as PrismaService;
    const scope = {
      assertResourceInScope: jest.fn(),
    } as unknown as StaffScopeService;
    const notifications = {
      pickupReady: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationService;
    const audit = { record: jest.fn() };
    const svc = new LoanService(
      prisma,
      scope,
      {} as PenaltyService,
      notifications,
      audit as any,
    );
    Object.assign(svc, {
      readUsage: jest.fn().mockResolvedValue({
        UsageKey: 501,
        ReservationKey: 11,
        CurrentStatus: 'Prepared',
        DueTime: row.EndTime,
        CheckoutTime: row.StartTime,
        CheckInTime: null,
        PendingExtension: null,
        Account: {
          AccountKey: 3,
          UserID: 'u3',
          UserFName: 'F',
          UserLName: 'L',
          UserCredit: 80,
        },
        Resource: row.Resource,
        CheckoutConditionLog: { Condition: 'Normal', Notes: null },
        CheckInConditionLog: null,
      }),
    });
    return { svc, audit };
  }

  it('records the allocation after it succeeds', async () => {
    const t = svcAllocating();
    await t.svc.allocate(staff, { reservationKey: 11, condition: 'Normal' });

    expect(t.audit.record).toHaveBeenCalledWith(
      { accountKey: staff.accountKey },
      'update',
      'reservation/11',
      expect.any(String),
    );
  });
});

describe('confirmPickup before the booked time', () => {
  const now = new Date('2099-01-09T02:00:00Z');
  // Booked 10 Jan 02:00 to 11 Jan 09:00, prepared a day ahead.
  const prepared = (room = false) => ({
    UsageKey: 8,
    ReservationKey: 11,
    CurrentStatus: 'Prepared',
    CheckoutTime: new Date('2099-01-10T02:00:00Z'),
    DueTime: new Date('2099-01-11T09:00:00Z'),
    Resource: {
      ResourceKey: 26,
      BufferTime: 0,
      Room: room ? { RoomName: 'Lab' } : null,
    },
    CheckoutConditionLog: { Condition: 'Normal' },
  });

  function svcFor(
    usage: ReturnType<typeof prepared>,
    clash: { ReservationKey: number } | null = null,
    photo = true,
  ) {
    const tx = {
      reservations: {
        findFirst: jest.fn().mockResolvedValue(clash),
        update: jest.fn().mockResolvedValue({}),
      },
      usageLog: { update: jest.fn().mockResolvedValue({}) },
      resourceInfo: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      images: {
        findFirst: jest.fn().mockResolvedValue(photo ? { ImageKey: 1 } : null),
      },
      $transaction: jest.fn((work: (t: typeof tx) => unknown) => work(tx)),
    } as unknown as PrismaService;
    const scope = {
      assertResourceInScope: jest.fn(),
    } as unknown as StaffScopeService;
    const audit = { record: jest.fn() };
    const svc = new LoanService(
      prisma,
      scope,
      {} as PenaltyService,
      {} as NotificationService,
      audit as any,
    );
    Object.assign(svc, {
      readUsage: jest.fn().mockResolvedValue(usage),
      toLoan: jest.fn().mockReturnValue({}),
    });
    return { svc, tx, audit };
  }

  beforeEach(() =>
    jest.useFakeTimers({ now, doNotFake: ['nextTick', 'setImmediate'] }),
  );
  afterEach(() => jest.useRealTimers());

  it('refuses a plain handover before the pickup window', async () => {
    const t = svcFor(prepared());
    await expect(
      t.svc.confirmPickup(staff, { usageKey: 8 }),
    ).rejects.toMatchObject({
      businessCode: 'PICKUP_NOT_OPEN',
    });
    expect(t.tx.usageLog.update).not.toHaveBeenCalled();
  });

  it('hands over early with the same loan length when the unit is free', async () => {
    const t = svcFor(prepared());
    await t.svc.confirmPickup(staff, { usageKey: 8, early: true });

    const due = new Date('2099-01-10T09:00:00Z'); // 31 hours from now, as booked
    expect(t.tx.reservations.update).toHaveBeenCalledWith({
      where: { ReservationKey: 11 },
      data: { StartTime: now, EndTime: due },
    });
    expect(t.tx.usageLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          CurrentStatus: 'Lended',
          CheckoutTime: now,
          DueTime: due,
        }),
      }),
    );
  });

  it('refuses an early handover that runs into another booking', async () => {
    const t = svcFor(prepared(), { ReservationKey: 12 });
    await expect(
      t.svc.confirmPickup(staff, { usageKey: 8, early: true }),
    ).rejects.toMatchObject({
      businessCode: 'WINDOW_NOT_AVAILABLE',
    });
    expect(t.tx.usageLog.update).not.toHaveBeenCalled();
  });

  it('refuses a handover nobody photographed (FR-PKP-03)', async () => {
    const t = svcFor(prepared(), null, false);
    await expect(
      t.svc.confirmPickup(staff, { usageKey: 8, early: true }),
    ).rejects.toMatchObject({
      businessCode: 'PICKUP_PHOTO_REQUIRED',
    });
    expect(t.tx.usageLog.update).not.toHaveBeenCalled();
  });

  it('never moves a room booking off its slots', async () => {
    const t = svcFor(prepared(true));
    await expect(
      t.svc.confirmPickup(staff, { usageKey: 8, early: true }),
    ).rejects.toMatchObject({
      businessCode: 'PICKUP_NOT_OPEN',
    });
  });
});
