import { InspectionService } from './inspection.service';
import type { PrismaService } from '../prisma.service';
import type { StaffScopeService } from '../common/authority/staff-scope.service';
import type { PenaltyService } from '../common/penalty/penalty.service';
import type { ImageService } from '../image/image.service';
import type { TrpcUser } from '../trpc/context';

const staff = { accountKey: 5, role: 'staff' } as TrpcUser;

function resource(overrides: Record<string, unknown> = {}) {
  return {
    ResourceKey: 26,
    BorrowRule: 3,
    BorrowRuleInfo: { RuleName: 'T2' },
    Item: { ItemID: 'EE-1', Item: { ItemName: 'Scope', CreditWeight: 3 } },
    Room: null,
    ...overrides,
  };
}

function subjectRow(overrides: Record<string, unknown> = {}) {
  return {
    UsageKey: 8,
    CurrentStatus: 'Returned',
    DueTime: new Date('2099-01-10T00:00:00Z'),
    CheckoutTime: new Date('2099-01-01T00:00:00Z'),
    CheckInTime: new Date('2099-01-09T00:00:00Z'),
    Account: {
      AccountKey: 3,
      UserID: 'u3',
      UserFName: 'F',
      UserLName: 'L',
      UserCredit: 80,
    },
    Resource: resource(),
    CheckoutConditionLog: { Condition: 'Normal', Notes: null, LoggedBy: 99 },
    Inspections: [],
    ...overrides,
  };
}

function service(overrides: {
  subject?: ReturnType<typeof subjectRow> | null;
}) {
  const subject = 'subject' in overrides ? overrides.subject : subjectRow();
  const tx = {
    conditionLog: {
      create: jest.fn().mockResolvedValue({ ConditionKey: 900 }),
    },
    inspection: {
      create: jest.fn().mockResolvedValue({ InspectionKey: 700 }),
    },
    usageLog: { update: jest.fn().mockResolvedValue({}) },
    resourceInfo: { update: jest.fn().mockResolvedValue({}) },
    images: { createMany: jest.fn().mockResolvedValue({}) },
    repairLog: {
      create: jest.fn().mockResolvedValue({ RepairKey: 55 }),
      update: jest.fn().mockResolvedValue({}),
    },
    roomCheckRound: { updateMany: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    usageLog: { findUnique: jest.fn().mockResolvedValue(subject) },
    inspection: {
      findUnique: jest.fn().mockResolvedValue({
        InspectionKey: 700,
        UsageKey: 8,
        ResourceKey: 26,
        InspectorKey: staff.accountKey,
        Notes: null,
        ActionTime: new Date('2099-01-09T01:00:00Z'),
        Condition: { Condition: 'MinorDamage' },
        Penalty: {
          PenaltyKey: 1,
          CreditDeducted: 5,
          ExpirationTime: new Date(),
        },
      }),
    },
    resourceInfo: { findUnique: jest.fn() },
    repairLog: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        RepairKey: 55,
        ResourceKey: 26,
        BeginRepairDate: new Date('2099-01-01T00:00:00Z'),
        EndRepairDate: null,
        RepairedByUser: { UserFName: 'F', UserLName: 'L' },
        ConditionBefore: { Condition: 'MinorDamage' },
        ConditionAfter: null,
        Resource: resource(),
      }),
    },
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
  const penalties = {
    quoteDamage: jest
      .fn()
      .mockResolvedValue({ reason: 'DamagedItem', amount: 5, lengthDays: 0 }),
    apply: jest.fn().mockResolvedValue(1),
  } as unknown as PenaltyService;
  const images = {
    toPublicUrl: jest.fn((u: string) => u),
    toStoredUrl: jest.fn((u: string) => u),
  } as unknown as ImageService;
  const audit = { record: jest.fn() };

  const svc = new InspectionService(
    prisma,
    scope,
    penalties,
    images,
    audit as never,
  );
  return { svc, prisma, scope, penalties, images, audit, tx };
}

describe('createInspection', () => {
  it('refuses to grade a loan that has not been returned', async () => {
    const t = service({ subject: subjectRow({ CurrentStatus: 'Lended' }) });
    await expect(
      t.svc.createInspection(staff, {
        usageKey: 8,
        level: 'B1',
        imageUrls: [],
      } as never),
    ).rejects.toMatchObject({ businessCode: 'WRONG_LOAN_STATE' });
  });

  it('refuses to grade a loan already inspected', async () => {
    const t = service({
      subject: subjectRow({ Inspections: [{ InspectionKey: 1 }] }),
    });
    await expect(
      t.svc.createInspection(staff, {
        usageKey: 8,
        level: 'B1',
        imageUrls: [],
      } as never),
    ).rejects.toMatchObject({ businessCode: 'ALREADY_INSPECTED' });
  });

  it('refuses a T2 grader who prepared the same unit (FR-RTN-04)', async () => {
    const t = service({
      subject: subjectRow({
        CheckoutConditionLog: {
          Condition: 'Normal',
          Notes: null,
          LoggedBy: staff.accountKey,
        },
      }),
    });
    await expect(
      t.svc.createInspection(staff, {
        usageKey: 8,
        level: 'B1',
        imageUrls: [],
      } as never),
    ).rejects.toMatchObject({ businessCode: 'CANNOT_INSPECT_OWN_PREPARATION' });
  });

  it('does not apply the own-preparation rule outside T2', async () => {
    const t = service({
      subject: subjectRow({
        Resource: resource({ BorrowRuleInfo: { RuleName: 'T0' } }),
        CheckoutConditionLog: {
          Condition: 'Normal',
          Notes: null,
          LoggedBy: staff.accountKey,
        },
      }),
    });
    await expect(
      t.svc.createInspection(staff, {
        usageKey: 8,
        level: 'B1',
        imageUrls: [],
      } as never),
    ).resolves.toBeDefined();
  });

  it('grades damage, applies the penalty, and marks the unit unusable for B2+', async () => {
    const t = service({});
    (t.penalties.quoteDamage as jest.Mock).mockResolvedValue({
      reason: 'DamagedItem',
      amount: 20,
      lengthDays: 0,
    });
    const result = await t.svc.createInspection(staff, {
      usageKey: 8,
      level: 'B2',
      note: 'cracked lens',
      imageUrls: ['a.jpg'],
    } as never);

    expect(t.tx.conditionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ Condition: 'MajorDamage' }),
      }),
    );
    expect(t.penalties.apply).toHaveBeenCalled();
    expect(t.tx.usageLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ CurrentStatus: 'Inspected' }),
      }),
    );
    expect(t.tx.resourceInfo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ AllowBorrow: false }),
      }),
    );
    expect(t.tx.images.createMany).toHaveBeenCalled();
    expect(t.audit.record).toHaveBeenCalledWith(
      { accountKey: staff.accountKey },
      'update',
      'inspection/700',
      expect.stringContaining('MajorDamage'),
    );
    expect(result.returnedToPool).toBe(false);
  });

  it('marks a missing unit Missing and keeps the unit off the shelf', async () => {
    const t = service({});
    const result = await t.svc.createInspection(staff, {
      usageKey: 8,
      level: 'B3',
      imageUrls: [],
    } as never);
    expect(t.tx.resourceInfo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ AllowBorrow: false }),
      }),
    );
    expect(result.returnedToPool).toBe(false);
  });

  it('returns a B0 unit straight back to the pool with no penalty applied', async () => {
    const t = service({});
    (t.penalties.quoteDamage as jest.Mock).mockResolvedValue({
      reason: 'DamagedItem',
      amount: 0,
      lengthDays: 0,
    });
    const result = await t.svc.createInspection(staff, {
      usageKey: 8,
      level: 'B0',
      imageUrls: [],
    } as never);
    expect(t.tx.resourceInfo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ AllowBorrow: false }),
      }),
    );
    expect(result.returnedToPool).toBe(true);
  });
});

describe('recordRoomCheck', () => {
  it('refuses a resource that does not exist', async () => {
    const t = service({});
    (t.prisma.resourceInfo.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      t.svc.recordRoomCheck(staff, {
        resourceKey: 26,
        condition: 'Normal',
      } as never),
    ).rejects.toMatchObject({ businessCode: 'RESOURCE_NOT_FOUND' });
  });

  it('refuses a check submitted against non-room equipment', async () => {
    const t = service({});
    (t.prisma.resourceInfo.findUnique as jest.Mock).mockResolvedValue({
      ResourceKey: 26,
      ResourceType: 'Equipment',
    });
    await expect(
      t.svc.recordRoomCheck(staff, {
        resourceKey: 26,
        condition: 'Normal',
      } as never),
    ).rejects.toMatchObject({ businessCode: 'UNIT_DOES_NOT_MATCH_REQUEST' });
  });

  it('records a check, closes any open round, and keeps a bad room off the shelf', async () => {
    const t = service({});
    (t.prisma.resourceInfo.findUnique as jest.Mock).mockResolvedValue({
      ResourceKey: 26,
      ResourceType: 'Room',
    });
    const result = await t.svc.recordRoomCheck(staff, {
      resourceKey: 26,
      condition: 'Broken',
      note: 'AC broken',
    } as never);
    expect(t.tx.roomCheckRound.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ResourceKey: 26, ClosedAt: null } }),
    );
    expect(t.tx.resourceInfo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ AllowBorrow: false }),
      }),
    );
    expect(result.stillBookable).toBe(false);
    expect(t.audit.record).toHaveBeenCalled();
  });
});

describe('startRepair', () => {
  it('refuses a resource that does not exist', async () => {
    const t = service({});
    (t.prisma.resourceInfo.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      t.svc.startRepair(staff, { resourceKey: 26 }),
    ).rejects.toMatchObject({ businessCode: 'RESOURCE_NOT_FOUND' });
  });

  it('logs a starting condition when none exists yet, and pulls the unit from the pool', async () => {
    const t = service({});
    (t.prisma.resourceInfo.findUnique as jest.Mock).mockResolvedValue({
      ResourceKey: 26,
      ConditionKey: null,
    });
    await t.svc.startRepair(staff, { resourceKey: 26, note: 'cracked' });
    expect(t.tx.conditionLog.create).toHaveBeenCalled();
    expect(t.tx.repairLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ConditionBeforeRepair: 900 }),
      }),
    );
    expect(t.tx.resourceInfo.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { AllowBorrow: false } }),
    );
  });

  it('reuses the existing condition when one is already on file', async () => {
    const t = service({});
    (t.prisma.resourceInfo.findUnique as jest.Mock).mockResolvedValue({
      ResourceKey: 26,
      ConditionKey: 42,
    });
    await t.svc.startRepair(staff, { resourceKey: 26 });
    expect(t.tx.conditionLog.create).not.toHaveBeenCalled();
    expect(t.tx.repairLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ConditionBeforeRepair: 42 }),
      }),
    );
  });
});

describe('finishRepair', () => {
  it('refuses a repair that does not exist', async () => {
    const t = service({});
    (t.prisma.repairLog.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      t.svc.finishRepair(staff, {
        repairKey: 55,
        condition: 'Normal',
      } as never),
    ).rejects.toMatchObject({ businessCode: 'RESOURCE_NOT_FOUND' });
  });

  it('refuses a repair already closed', async () => {
    const t = service({});
    (t.prisma.repairLog.findUnique as jest.Mock).mockResolvedValue({
      RepairKey: 55,
      ResourceKey: 26,
      EndRepairDate: new Date(),
    });
    await expect(
      t.svc.finishRepair(staff, {
        repairKey: 55,
        condition: 'Normal',
      } as never),
    ).rejects.toMatchObject({ businessCode: 'ALREADY_DECIDED' });
  });

  it('closes the repair and returns the unit to the shelf on a Normal result', async () => {
    const t = service({});
    (t.prisma.repairLog.findUnique as jest.Mock).mockResolvedValue({
      RepairKey: 55,
      ResourceKey: 26,
      EndRepairDate: null,
    });
    await t.svc.finishRepair(staff, {
      repairKey: 55,
      condition: 'Normal',
    } as never);
    expect(t.tx.repairLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ConditionAfterRepair: 900 }),
      }),
    );
    expect(t.tx.resourceInfo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          AllowBorrow: true,
          ResourceStatus: 'InStorage',
        }),
      }),
    );
  });

  it('keeps a still-broken unit off the shelf after repair', async () => {
    const t = service({});
    (t.prisma.repairLog.findUnique as jest.Mock).mockResolvedValue({
      RepairKey: 55,
      ResourceKey: 26,
      EndRepairDate: null,
    });
    await t.svc.finishRepair(staff, {
      repairKey: 55,
      condition: 'Broken',
    } as never);
    expect(t.tx.resourceInfo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ AllowBorrow: false }),
      }),
    );
  });
});
