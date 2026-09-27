import { PrismaService } from '../../src/prisma.service';
import { borrowerHistoryOutput } from '../../src/approval/approval.schema';
import { appealOutput } from '../../src/appeal/appeal.schema';
import { inHistoryFixture, historyFixture } from '../fixtures/borrower-history';

describe('FR-APV-01 / FR-APL-06 real history and appeal persistence', () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('orders actual database rows newest first and counts all loans beyond the 50-row display limit', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await historyFixture(tx);
      await tx.usageLog.createMany({
        data: Array.from({ length: 54 }, (_, index) => ({
          AccountKey: f.borrower.AccountKey,
          ResourceKey: f.resource.ResourceKey,
          CurrentStatus: 'Inspected' as const,
          CheckoutCondition: f.checkoutCondition.ConditionKey,
          CheckoutTime: new Date(
            f.usage.CheckoutTime.getTime() - (54 - index) * 86_400_000,
          ),
          DueTime: f.inspectedAt,
          CheckInTime: new Date(f.inspectedAt.getTime() + 1),
        })),
      });
      const normalLoan = await tx.usageLog.findFirstOrThrow({
        where: {
          AccountKey: f.borrower.AccountKey,
          UsageKey: { not: f.usage.UsageKey },
        },
      });
      await tx.inspection.create({
        data: {
          UsageKey: normalLoan.UsageKey,
          ResourceKey: f.resource.ResourceKey,
          InspectorKey: f.inspector.AccountKey,
          ConditionKey: f.checkoutCondition.ConditionKey,
          ActionTime: new Date(f.inspectedAt.getTime() + 1),
        },
      });
      const result = borrowerHistoryOutput
        .strict()
        .parse(await f.history.borrowerHistory(f.admin, f.borrower.AccountKey));
      expect(result).toMatchObject({
        totalLoans: 55,
        lateReturns: 54,
        damageIncidents: 1,
      });
      expect(result.items).toHaveLength(50);
      expect(result.items[0].usageKey).toBe(f.usage.UsageKey);
      const times = result.items.map((item) => Date.parse(item.checkoutAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
      await expect(
        f.history.borrowerHistory(f.decider, f.borrower.AccountKey),
      ).rejects.toMatchObject({ businessCode: 'OUT_OF_MANAGEMENT_SCOPE' });
      await tx.reservations.create({
        data: {
          ResourceKey: f.resource.ResourceKey,
          ReservedBy: f.borrower.AccountKey,
          ApproveStatus: 'Rejected',
          StartTime: f.usage.CheckoutTime,
          EndTime: f.inspectedAt,
          ActionTime: f.usage.CheckoutTime,
          ReservationExpiration: f.inspectedAt,
        },
      });
      expect(
        borrowerHistoryOutput
          .strict()
          .parse(
            await f.history.borrowerHistory(f.decider, f.borrower.AccountKey),
          ),
      ).toEqual(result);
    });
  });

  it.each(['B0', 'B1'] as const)(
    'persists revised grade %s while preserving inspection evidence and recomputing other active credit',
    async (grade) => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await historyFixture(tx);
        await tx.penaltyInfo.createMany({
          data: [
            {
              AccountKey: f.borrower.AccountKey,
              CreditDeducted: 7,
              ExpirationTime: f.penalty.ExpirationTime,
              InEffect: true,
            },
            {
              AccountKey: f.borrower.AccountKey,
              CreditDeducted: 9,
              ExpirationTime: new Date(Date.now() - 1),
              InEffect: true,
            },
          ],
        });
        const result = appealOutput.strict().parse(
          await f.appeals.decide(f.decider, {
            appealKey: f.appeal.AppealKey,
            decision: 'approve',
            revisedGrade: grade,
          }),
        );
        const remaining = grade === 'B0' ? 0 : 4;
        expect(result.revisedGrade).toBe(grade);
        expect(result.creditRestored).toBe(12 - remaining);
        expect(result.inspection?.grade).toBe('B2');
        expect(result.penalty.inEffect).toBe(false);
        expect(result.replacementPenalty?.creditDeducted ?? 0).toBe(remaining);
        if (remaining) {
          expect(result.replacementPenalty).toMatchObject({
            issuedAt: f.penalty.ActionTime!.toISOString(),
            expiresAt: f.penalty.ExpirationTime.toISOString(),
          });
        } else expect(result.replacementPenalty).toBeNull();
        expect(
          (
            await tx.accountInfo.findUniqueOrThrow({
              where: { AccountKey: f.borrower.AccountKey },
            })
          ).UserCredit,
        ).toBe(100 - 7 - remaining);
        expect(
          (
            await tx.conditionLog.findUniqueOrThrow({
              where: { ConditionKey: f.condition.ConditionKey },
            })
          ).Condition,
        ).toBe('MajorDamage');
        if (grade === 'B1')
          expect(
            (await f.history.borrowerHistory(f.admin, f.borrower.AccountKey))
              .damageIncidents,
          ).toBe(1);
      });
    },
  );

  describe('expected defect: history still counts the original grade after B0 appeal', () => {
    let actual: ReturnType<typeof borrowerHistoryOutput.parse>;
    let lastRemainingDamage: string;
    beforeAll(async () => {
      // Setup assertions run outside it.failing, so database/appeal failures cannot mask this defect.
      await inHistoryFixture(prisma, async (tx) => {
        const f = await historyFixture(tx);
        const older = new Date(f.inspectedAt.getTime() - 86_400_000);
        lastRemainingDamage = older.toISOString();
        const condition = await tx.conditionLog.create({
          data: {
            ResourceKey: f.resource.ResourceKey,
            LoggedBy: f.inspector.AccountKey,
            Condition: 'MinorDamage',
            LoggedAt: older,
          },
        });
        const usage = await tx.usageLog.create({
          data: {
            ResourceKey: f.resource.ResourceKey,
            AccountKey: f.borrower.AccountKey,
            CurrentStatus: 'Inspected',
            CheckoutCondition: f.checkoutCondition.ConditionKey,
            CheckInCondition: condition.ConditionKey,
            CheckoutTime: new Date(older.getTime() - 86_400_000),
            DueTime: older,
            CheckInTime: older,
          },
        });
        await tx.inspection.create({
          data: {
            UsageKey: usage.UsageKey,
            ResourceKey: f.resource.ResourceKey,
            InspectorKey: f.inspector.AccountKey,
            ConditionKey: condition.ConditionKey,
            ActionTime: older,
          },
        });
        expect(
          (await f.history.borrowerHistory(f.admin, f.borrower.AccountKey))
            .damageIncidents,
        ).toBe(2);
        const resolved = appealOutput.strict().parse(
          await f.appeals.decide(f.decider, {
            appealKey: f.appeal.AppealKey,
            decision: 'approve',
            revisedGrade: 'B0',
          }),
        );
        expect(resolved).toMatchObject({
          revisedGrade: 'B0',
          replacementPenalty: null,
          creditRestored: 12,
        });
        actual = borrowerHistoryOutput
          .strict()
          .parse(
            await f.history.borrowerHistory(f.admin, f.borrower.AccountKey),
          );
      });
    });
    it.failing(
      'excludes the incident revised to B0 from the damage count',
      () => {
        expect(actual.damageIncidents).toBe(1);
      },
    );
    it.failing(
      'uses the latest remaining B1–B3 inspection date after a B0 revision',
      () => {
        expect(actual.lastDamageDate).toBe(lastRemainingDamage);
      },
    );
  });
});
