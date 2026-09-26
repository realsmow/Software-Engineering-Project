import { inspectionOutput } from '../../src/inspection/inspection.schema';
import { PenaltyService } from '../../src/common/penalty/penalty.service';
import type { ConditionType } from '../../src/common/schemas/status.schema';
import { withOutputContracts } from '../fixtures/output-contracts';
import { InspectionService } from '../../src/inspection/inspection.service';
import type { TrpcUser } from '../../src/trpc/context';

function objectContaining(value: Record<string, unknown>): unknown {
  return expect.objectContaining(value) as unknown;
}

function subject(changes: Partial<ReturnType<typeof baseSubject>> = {}) {
  return { ...baseSubject(), ...changes };
}

function baseSubject() {
  return {
    UsageKey: 42,
    CurrentStatus: 'Returned',
    DueTime: new Date('2026-09-25T10:00:00.000Z'),
    CheckoutTime: new Date('2026-09-23T10:00:00.000Z'),
    CheckInTime: new Date('2026-09-25T09:00:00.000Z'),
    Account: {
      AccountKey: 10,
      UserID: 'S12345',
      UserFName: 'Ada',
      UserLName: 'Lovelace',
      UserCredit: 88,
    },
    Resource: {
      ResourceKey: 7,
      BorrowRule: 3,
      BorrowRuleInfo: { RuleName: 'T2' },
      Item: {
        ItemID: 'OSC-001',
        Item: { ItemName: 'Oscilloscope', CreditWeight: 12 },
      },
      Room: null,
    },
    CheckoutConditionLog: { Condition: 'Normal', Notes: null, LoggedBy: 99 },
    Inspections: [] as Array<{ InspectionKey: number }>,
  };
}

function setup(usage = subject()) {
  let storedCondition: ConditionType = 'Normal';
  type InspectionData = {
    UsageKey: number;
    ResourceKey: number;
    InspectorKey: number;
    ConditionKey: number;
    PenaltyKey: number | null;
    ActionTime: Date;
    Notes: string | null;
  };
  let storedInspection: InspectionData | null = null;
  const prisma = {
    conditionLog: {
      create: jest.fn(({ data }: { data: { Condition: ConditionType } }) => {
        storedCondition = data.Condition;
        return Promise.resolve({ ConditionKey: 8 });
      }),
    },
    inspection: {
      create: jest.fn(({ data }: { data: InspectionData }) => {
        storedInspection = data;
        return Promise.resolve({ InspectionKey: 13 });
      }),
      findUnique: jest.fn(() =>
        Promise.resolve(
          storedInspection
            ? {
                ...storedInspection,
                InspectionKey: 13,
                Condition: { Condition: storedCondition },
                Penalty:
                  storedInspection.PenaltyKey === null
                    ? null
                    : {
                        PenaltyKey: storedInspection.PenaltyKey,
                        CreditDeducted: 36,
                        ExpirationTime: new Date(
                          storedInspection.ActionTime.getTime() +
                            72 * 86_400_000,
                        ),
                      },
              }
            : null,
        ),
      ),
    },
    usageLog: {
      findUnique: jest.fn().mockResolvedValue(usage),
      update: jest.fn().mockResolvedValue(usage),
    },
    penaltyRule: { findUnique: jest.fn().mockResolvedValue(null) },
    resourceInfo: { update: jest.fn().mockResolvedValue({}) },
    images: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  );
  const scope = {
    assertResourceInScope: jest.fn().mockResolvedValue(undefined),
  };
  const penalties = new PenaltyService(prisma as never);
  const penaltySpies = {
    quoteDamage: jest.spyOn(penalties, 'quoteDamage'),
    apply: jest
      .spyOn(penalties, 'apply')
      .mockImplementation((_tx, quote) =>
        Promise.resolve(quote.amount > 0 ? 16 : null),
      ),
  };
  const images = { toStoredUrl: jest.fn((url: string) => url) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new InspectionService(
    prisma as never,
    scope as never,
    penalties,
    images as never,
    audit as never,
  );
  withOutputContracts(service, { createInspection: inspectionOutput });
  return { service, prisma, scope, penalties: penaltySpies, images, audit };
}

const inspector: TrpcUser = {
  accountKey: 99,
  role: 'staff',
  facultyKey: null,
  creditScore: 100,
};
const input = {
  usageKey: 42,
  level: 'B2' as const,
  note: 'Screen cracked',
  imageUrls: [],
};

describe('InspectionService grading', () => {
  it('refuses a T2 inspection by the staff member who prepared the unit', async () => {
    const { service, prisma, penalties } = setup();

    await expect(
      service.createInspection(inspector, input),
    ).rejects.toMatchObject({
      message: 'CANNOT_INSPECT_OWN_PREPARATION',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(penalties.apply).not.toHaveBeenCalled();
  });

  it('refuses a second grade for the same return', async () => {
    const { service, prisma } = setup(
      subject({ Inspections: [{ InspectionKey: 13 }] }),
    );

    await expect(
      service.createInspection(inspector, input),
    ).rejects.toMatchObject({
      message: 'ALREADY_INSPECTED',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records damage, penalty, and the unit hold together for an independent inspector', async () => {
    const usage = subject({
      CheckoutConditionLog: { Condition: 'Normal', Notes: null, LoggedBy: 98 },
    });
    const { service, prisma, penalties, audit } = setup(usage);

    await service.createInspection(inspector, input);

    expect(penalties.quoteDamage).toHaveBeenCalledWith(3, 12, 'B2');
    expect(prisma.conditionLog.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          Condition: 'MajorDamage',
          LoggedBy: 99,
        }),
      }),
    );
    expect(penalties.apply).toHaveBeenCalledWith(
      prisma,
      {
        reason: 'DamagedItem',
        amount: 36,
        lengthDays: 72,
        source: 'proposal-formula',
      },
      objectContaining({
        accountKey: 10,
        usageKey: 42,
      }),
    );
    expect(prisma.inspection.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({ ConditionKey: 8, PenaltyKey: 16 }),
      }),
    );
    expect(prisma.usageLog.update).toHaveBeenCalledWith(
      objectContaining({
        data: { CurrentStatus: 'Inspected', CheckInCondition: 8 },
      }),
    );
    expect(prisma.resourceInfo.update).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({ ConditionKey: 8, AllowBorrow: false }),
      }),
    );
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('returns a B0 unit to the pool and stores inspector evidence', async () => {
    const usage = subject({
      CheckoutConditionLog: { Condition: 'Normal', Notes: null, LoggedBy: 98 },
    });
    const { service, prisma, images } = setup(usage);

    await service.createInspection(inspector, {
      usageKey: 42,
      level: 'B0',
      imageUrls: ['/media/evidence.jpg'],
    });

    expect(prisma.conditionLog.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({ Condition: 'Normal' }),
      }),
    );
    const updateCalls = prisma.resourceInfo.update.mock
      .calls as unknown as Array<[{ data: { AllowBorrow?: boolean } }]>;
    const update = updateCalls[0][0];
    expect(update.data.AllowBorrow).toBeUndefined();
    expect(images.toStoredUrl).toHaveBeenCalledWith('/media/evidence.jpg');
    expect(prisma.images.createMany).toHaveBeenCalledWith(
      objectContaining({
        data: [objectContaining({ SubmissionType: 'InspectionPicture' })],
      }),
    );
  });
});
