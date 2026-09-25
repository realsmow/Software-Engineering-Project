import { ItemManagementService } from './item.management.service';
import type { PrismaService } from '../prisma.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { ImageService } from '../image/image.service';
import type { TrpcUser } from '../trpc/context';

/**
 * FR-EQP-04: a room's opening hours are its own, not the fixed grid every room
 * used to share. `createRoom` and `updateRoom` are what write
 * RoomInfo.OpenTime/CloseTime/BreakStart/BreakEnd - the grid math itself
 * (`assertValidRoomHours`, `roomSlots`, …) is covered in
 * common/booking/room-slots.spec.ts. This file only checks the service wires
 * defaults, merges partial updates, and bubbles up INVALID_ROOM_HOURS.
 */

const staff: TrpcUser = {
  accountKey: 4,
  role: 'staff',
  facultyKey: null,
  creditScore: 100,
};

function existingRoom(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    RoomKey: 1,
    RoomName: 'Lab A',
    RoomDesc: null,
    RoomLocation: null,
    ImageURL: null,
    CreditWeight: 0,
    Capacity: null,
    OpenTime: 420,
    CloseTime: 1080,
    BreakStart: 720,
    BreakEnd: 780,
    Resource: {
      ResourceKey: 50,
      ResourceStatus: 'InStorage',
      AllowBorrow: true,
      BorrowRuleInfo: { RuleName: 'T3' },
      CurrentCondition: null,
      ManagementGroup: {
        ManageGroupKey: 1,
        GroupType: 'Faculty',
        Branch: { BranchName: 'EE' },
        Club: null,
      },
    },
    ...overrides,
  };
}

function harness() {
  const tx = {
    resourceInfo: { create: jest.fn().mockResolvedValue({ ResourceKey: 50 }) },
    roomInfo: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    borrowRule: {
      findFirst: jest.fn().mockResolvedValue({ BorrowRuleKey: 9 }),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    roomInfo: {
      findUnique: jest.fn().mockResolvedValue(existingRoom()),
      update: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
  const scope = {
    assertGroupInScope: jest.fn(),
    assertResourceInScope: jest.fn(),
  } as unknown as StaffScopeService;
  const images = {
    toStoredUrl: (url?: string) => url ?? null,
    toPublicUrl: (url: string | null) => url,
  } as unknown as ImageService;
  const audit = { record: jest.fn() };
  return {
    service: new ItemManagementService(
      prisma,
      scope,
      images,
      audit as never,
      { retirementRequested: jest.fn(), retirementDecided: jest.fn() } as never,
    ),
    prisma,
    tx,
    audit,
  };
}

const baseCreate = {
  manageGroupKey: 1,
  name: 'Lab A',
  creditWeight: 0,
  lendable: true,
} as const;

describe('createRoom hours', () => {
  it('defaults to the grid every room used to share', async () => {
    const t = harness();
    await t.service.createRoom(staff, baseCreate);

    expect(t.tx.roomInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          OpenTime: 420,
          CloseTime: 1080,
          BreakStart: 720,
          BreakEnd: 780,
        }),
      }),
    );
  });

  it('writes custom hours with no break', async () => {
    const t = harness();
    await t.service.createRoom(staff, {
      ...baseCreate,
      openMinutes: 540,
      closeMinutes: 1020,
      breakStartMinutes: null,
      breakEndMinutes: null,
    });

    expect(t.tx.roomInfo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          OpenTime: 540,
          CloseTime: 1020,
          BreakStart: null,
          BreakEnd: null,
        }),
      }),
    );
  });

  it('refuses hours off the 30-minute grid', async () => {
    const t = harness();
    await expect(
      t.service.createRoom(staff, {
        ...baseCreate,
        openMinutes: 541,
        closeMinutes: 1020,
      }),
    ).rejects.toMatchObject({ businessCode: 'INVALID_ROOM_HOURS' });
    expect(t.tx.roomInfo.create).not.toHaveBeenCalled();
  });

  it('refuses a close time before the open time', async () => {
    const t = harness();
    await expect(
      t.service.createRoom(staff, {
        ...baseCreate,
        openMinutes: 1000,
        closeMinutes: 900,
      }),
    ).rejects.toMatchObject({ businessCode: 'INVALID_ROOM_HOURS' });
  });
});

describe('updateRoom hours', () => {
  it('leaves hours untouched when none of the four fields are sent', async () => {
    const t = harness();
    await t.service.updateRoom(staff, {
      resourceKey: 50,
      name: 'New name',
    });

    expect(t.prisma.roomInfo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ OpenTime: expect.anything() }),
      }),
    );
  });

  it('merges a break change onto the existing open/close hours', async () => {
    const t = harness();
    await t.service.updateRoom(staff, {
      resourceKey: 50,
      breakStartMinutes: null,
      breakEndMinutes: null,
    });

    expect(t.prisma.roomInfo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          OpenTime: 420,
          CloseTime: 1080,
          BreakStart: null,
          BreakEnd: null,
        }),
      }),
    );
  });

  it('refuses a new close time that would leave the existing break hanging out the end', async () => {
    const t = harness();
    // The room's break runs 720-780 (12:00-13:00); closing at 700 (11:40,
    // rounded down here to 11:30=690 would also fail the grid check, so 690
    // is used) leaves the break's end past the new close time.
    await expect(
      t.service.updateRoom(staff, {
        resourceKey: 50,
        openMinutes: 420,
        closeMinutes: 690,
      }),
    ).rejects.toMatchObject({ businessCode: 'INVALID_ROOM_HOURS' });
    expect(t.prisma.roomInfo.update).not.toHaveBeenCalled();
  });

  it('returns RESOURCE_NOT_FOUND for a room that does not exist', async () => {
    const t = harness();
    (t.prisma.roomInfo.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(
      t.service.updateRoom(staff, { resourceKey: 999 }),
    ).rejects.toMatchObject({ businessCode: 'RESOURCE_NOT_FOUND' });
  });
});
