import { InspectionService } from '../../src/inspection/inspection.service';
import { inspectionSubjectOutput } from '../../src/inspection/inspection.schema';
import type { TrpcUser } from '../../src/trpc/context';

const supervisor: TrpcUser = {
  accountKey: 99,
  role: 'supervisor',
  facultyKey: null,
  creditScore: 100,
};

function buildInspectionService() {
  const prisma = {
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
    usageLog: {
      findUnique: jest.fn().mockResolvedValue({
        UsageKey: 42,
        CurrentStatus: 'Returned',
        DueTime: new Date('2026-09-05T00:00:00Z'),
        CheckoutTime: new Date('2026-08-30T00:00:00Z'),
        CheckInTime: new Date('2026-09-02T00:00:00Z'),
        Account: {
          AccountKey: 10,
          UserID: 'S12345',
          UserFName: 'Ada',
          UserLName: 'Lovelace',
          UserCredit: 88,
        },
        Resource: {
          ResourceKey: 7,
          BorrowRule: 1,
          BorrowRuleInfo: { RuleName: 'T1' },
          Item: {
            ItemID: 'ITEM-42',
            Item: { ItemName: 'Laptop', CreditWeight: 12 },
          },
          Room: null,
        },
        CheckoutConditionLog: {
          Condition: 'Normal',
          Notes: 'Good condition on release',
          LoggedBy: 98,
        },
        Inspections: [],
      }),
    },
    images: {
      findMany: jest.fn().mockResolvedValue([
        {
          ImageKey: 1,
          ImageURL: '/media/before.png',
          SubmissionType: 'BeforePicture',
          ActionTime: new Date('2026-09-01T12:00:00Z'),
        },
      ]),
    },
    conditionLog: {
      findMany: jest.fn().mockResolvedValue([
        {
          ConditionKey: 6,
          Condition: 'Normal',
          Notes: 'Returned clean',
          LoggedAt: new Date('2026-08-28T10:00:00Z'),
        },
        {
          ConditionKey: 5,
          Condition: 'MinorDamage',
          Notes: 'Handle slightly worn',
          LoggedAt: new Date('2026-08-25T10:00:00Z'),
        },
      ]),
    },
  };
  return new InspectionService(
    prisma as never,
    { assertResourceInScope: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
    { toPublicUrl: (url: string) => `http://localhost:3000${url}` } as never,
    {} as never,
  );
}

it('loads borrower credit and newest-first condition history through the inspection service', async () => {
  const result = inspectionSubjectOutput
    .strict()
    .parse(await buildInspectionService().getSubject(supervisor, 42));
  expect(result).toMatchObject({
    borrowerName: 'Ada Lovelace',
    borrowerStudentId: 'S12345',
    borrowerCreditScore: 88,
    itemName: 'Laptop',
    serialNo: 'ITEM-42',
    beforeImages: [
      { imageKey: 1, url: 'http://localhost:3000/media/before.png' },
    ],
  });
  expect(result.unitHistory.map((entry) => entry.condition)).toEqual([
    'Normal',
    'MinorDamage',
  ]);
});
