import type { Prisma } from '../../src/generated/prisma/client';
import type { PrismaService } from '../../src/prisma.service';
import { StaffScopeService } from '../../src/common/authority/staff-scope.service';
import { CreditTierService } from '../../src/common/credit/credit-tier.service';
import { PenaltyService } from '../../src/common/penalty/penalty.service';
import { CreditService } from '../../src/credit/credit.service';
import {
  creditOutput,
  type CreditOutput,
} from '../../src/credit/credit.schema';
import { CronService } from '../../src/cron/cron.service';
import { LoanService } from '../../src/loan/loan.service';
import {
  allocateLoanInput,
  loanOutput,
  recordReturnOutput,
} from '../../src/loan/loan.schema';
import { NotificationService } from '../../src/notification/notification.service';
import { inHistoryFixture } from '../fixtures/borrower-history';
import { freezeBusinessDate } from '../fixtures/business-clock';
import {
  createIsolatedDatabase,
  type IsolatedTestDatabase,
} from '../fixtures/isolated-database';
import {
  pickupFixture,
  pickupRequest,
  PICKUP_NOW,
  PICKUP_START,
  PICKUP_END,
} from '../fixtures/pickup';

const DAY = 86_400_000;
// Monday 17:00 Bangkok is the deadline; the first sweep is Tuesday 00:01.
const FIRST_SWEEP = new Date('2031-09-29T17:01:00.000Z');
const RETURN_AFTER_THREE_DAYS = new Date('2031-10-02T09:00:00.000Z');
const STILL_OUT = new Date('2031-10-04T02:00:00.000Z');
const RETURN_AFTER_SEVEN_DAYS = new Date('2031-10-06T09:00:00.000Z');

function services(client: PrismaService) {
  const penalties = new PenaltyService(client);
  const notifications = new NotificationService(client);
  return {
    cron: new CronService(client, penalties, notifications),
    loan: new LoanService(
      client,
      new StaffScopeService(client),
      penalties,
      notifications,
      { record: jest.fn() } as never,
      new CreditTierService(client),
    ),
  };
}

async function lendedFixture(
  tx: Prisma.TransactionClient,
  endTime = PICKUP_END,
) {
  const f = await pickupFixture(tx);
  // No ReturnLate PenaltyRule exists for this fixture's new BorrowRule.
  // FR-CRD-03 therefore gives 14 / 7 = 2 credit per overdue day.
  await tx.itemInfo.update({
    where: { ItemKey: f.item.ItemKey },
    data: { CreditWeight: 14 },
  });
  const request = await pickupRequest(f, 0, 0, PICKUP_START, endTime);
  const prepared = loanOutput
    .strict()
    .parse(
      await f.loan.allocate(
        f.staff,
        allocateLoanInput.parse({ reservationKey: request.reservationKey }),
      ),
    );
  await tx.images.create({
    data: {
      UsageKey: prepared.usageKey,
      ResourceKey: f.units[0].ResourceKey,
      SubmittedBy: f.users[0].accountKey,
      SubmissionType: 'BeforePicture',
      ImageURL: '/media/late-return-pickup.png',
      ActionTime: PICKUP_START,
    },
  });
  jest.setSystemTime(PICKUP_START);
  const collected = loanOutput
    .strict()
    .parse(
      await f.loan.confirmPickup(f.staff, { usageKey: prepared.usageKey }),
    );
  expect(collected).toMatchObject({
    status: 'Lended',
    dueAt: endTime.toISOString(),
  });
  return { ...f, usageKey: prepared.usageKey };
}

type Fixture = Awaited<ReturnType<typeof lendedFixture>>;

async function returnLoan(client: PrismaService, f: Fixture) {
  // Persist return evidence at the actual receipt time.
  await client.images.create({
    data: {
      UsageKey: f.usageKey,
      ResourceKey: f.units[0].ResourceKey,
      SubmittedBy: f.users[0].accountKey,
      SubmissionType: 'AfterPicture',
      ImageURL: '/media/late-return-after.png',
      ActionTime: new Date(),
    },
  });
  return recordReturnOutput.strict().parse(
    await services(client).loan.recordReturn(f.staff, {
      usageKey: f.usageKey,
    }),
  );
}

async function lateState(
  client: Pick<
    Prisma.TransactionClient,
    'penaltyInfo' | 'accountInfo' | 'usageLog'
  >,
  f: Fixture,
  reason: 'ReturnLate' | 'LostItem' = 'ReturnLate',
) {
  const penalties = await client.penaltyInfo.findMany({
    where: {
      UsageKey: f.usageKey,
      Reason: { startsWith: reason },
    },
    orderBy: { PenaltyKey: 'asc' },
  });
  const active = penalties.filter(
    (row) => row.InEffect && row.ExpirationTime.getTime() > Date.now(),
  );
  const account = await client.accountInfo.findUniqueOrThrow({
    where: { AccountKey: f.users[0].accountKey },
    select: { UserCredit: true },
  });
  const usage = await client.usageLog.findUniqueOrThrow({
    where: { UsageKey: f.usageKey },
    select: { CurrentStatus: true, CheckInTime: true },
  });
  return {
    penalties,
    active,
    activeDeduction: active.reduce(
      (sum, row) => sum + (row.CreditDeducted ?? 0),
      0,
    ),
    creditScore: account.UserCredit,
    usage,
  };
}

type Receipt = Awaited<ReturnType<typeof returnLoan>>;
type LateState = Awaited<ReturnType<typeof lateState>>;

function assertReceiptExpiryMatchesDatabase(
  receipt: Receipt,
  state: LateState,
) {
  expect(receipt.latePenalty).not.toBeNull();
  const stored = state.penalties.find(
    (row) => row.PenaltyKey === receipt.latePenalty!.penaltyKey,
  );
  expect(stored).toBeDefined();
  expect(receipt.latePenalty!.expiresAt).toBe(
    stored!.ExpirationTime.toISOString(),
  );
}

describe('FR-RTN-07 / FR-CRD-03/04: late and lost penalty lifecycle', () => {
  let database: IsolatedTestDatabase | undefined;
  let prisma: PrismaService;
  let termEnd: string | undefined;

  beforeAll(async () => {
    termEnd = process.env.TERM_END_DATE;
    delete process.env.TERM_END_DATE;
    // Cron jobs scan all loans, so keep this suite in its own disposable DB.
    database = await createIsolatedDatabase('late_return', {
      seedReferenceData: true,
    });
    prisma = database.client;
  }, 60_000);
  afterAll(async () => {
    if (termEnd === undefined) delete process.env.TERM_END_DATE;
    else process.env.TERM_END_DATE = termEnd;
    await database?.dispose();
  });
  beforeEach(() => freezeBusinessDate(PICKUP_NOW));
  afterEach(() => jest.useRealTimers());

  it('settles a late return once when the counter runs before the overdue sweep', async () => {
    await inHistoryFixture(prisma, async (tx) => {
      const f = await lendedFixture(tx);
      const { cron } = services(f.client);
      jest.setSystemTime(RETURN_AFTER_THREE_DAYS);
      const returned = await returnLoan(f.client, f);
      expect(returned).toMatchObject({
        loan: { status: 'Returned' },
        latePenalty: {
          overdueDays: 3,
          creditDeducted: 6,
          expiresAt: new Date(
            RETURN_AFTER_THREE_DAYS.getTime() + 12 * DAY,
          ).toISOString(),
        },
      });
      const beforeSweep = await lateState(tx, f);
      expect(beforeSweep).toMatchObject({
        activeDeduction: 6,
        creditScore: 94,
        usage: { CheckInTime: RETURN_AFTER_THREE_DAYS },
      });
      expect(beforeSweep.penalties).toHaveLength(1);
      assertReceiptExpiryMatchesDatabase(returned, beforeSweep);
      expect(await cron.run('markOverdue')).toMatchObject({ affected: 0 });
      expect(await lateState(tx, f)).toEqual(beforeSweep);
    });
  });

  describe.each([
    { source: 'FR-CRD-03 formula', rate: null, initial: 2, final: 6 },
    { source: 'configured PenaltyRule', rate: 3, initial: 3, final: 9 },
  ])('$source', ({ rate, initial, final }) => {
    let afterReturn: LateState;
    let receipt: Receipt;
    const expectedExpiry = new Date(
      RETURN_AFTER_THREE_DAYS.getTime() +
        (rate === null ? final * 2 : 20) * DAY,
    ).toISOString();
    beforeEach(async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await lendedFixture(tx);
        if (rate !== null) {
          await tx.penaltyRule.create({
            data: {
              BorrowRuleKey: f.rule.BorrowRuleKey,
              PenaltyReason: 'ReturnLate',
              PenaltyAmount: rate,
              // A matching rule's duration is independent of deducted points.
              PenaltyLength: 20,
            },
          });
        }
        const { cron } = services(f.client);
        jest.setSystemTime(FIRST_SWEEP);
        expect(await cron.run('markOverdue')).toMatchObject({ affected: 1 });
        expect(await lateState(tx, f)).toMatchObject({
          activeDeduction: initial,
          creditScore: 100 - initial,
          usage: { CurrentStatus: 'Lended', CheckInTime: null },
        });
        jest.setSystemTime(RETURN_AFTER_THREE_DAYS);
        receipt = await returnLoan(f.client, f);
        expect(receipt).toMatchObject({
          loan: { status: 'Returned' },
          latePenalty: { overdueDays: 3 },
        });
        afterReturn = await lateState(tx, f);
        // The receipt must agree with what SQL holds.
        expect(receipt.latePenalty!.creditDeducted).toBe(
          afterReturn.activeDeduction,
        );
        assertReceiptExpiryMatchesDatabase(receipt, afterReturn);
      });
    });
    it('reconciles the first scheduled charge with all actual late days', () => {
      // Either reconciliation or a delta is valid; the live total must match.
      expect(afterReturn).toMatchObject({
        activeDeduction: final,
        creditScore: 100 - final,
        usage: { CheckInTime: RETURN_AFTER_THREE_DAYS },
      });
    });
    it('reports the complete actual late deduction in the receipt', () => {
      expect(receipt.latePenalty!.creditDeducted).toBe(final);
    });
    it('reports the full penalty term starting at actual receipt', () => {
      expect(receipt.latePenalty!.expiresAt).toBe(expectedExpiry);
    });
    it('restates the reason with the settled late days, not the first sighting (#201)', () => {
      // The overnight job wrote "overdue 1d (scheduled)" the night it noticed.
      // The item came back on the third late day and the figure was raised to
      // match, so the sentence beside it has to say three — My profile and the
      // return receipt have no other words for why the points went.
      expect(afterReturn.penalties).toHaveLength(1);
      expect(afterReturn.penalties[0].Reason).toBe('ReturnLate: overdue 3d');
    });
  });

  // Without a configured rule FR-CRD-04 defines length; the term starts at
  // actual receipt. Scheduled billing must not consume that term while out.
  describe('FR-CRD-04: the deduction term begins at actual return', () => {
    let whileOut: LateState;
    let dailyWhileOut: LateState[];
    let afterReturn: LateState;
    let receipt: Receipt;
    const expectedExpiry = new Date(
      RETURN_AFTER_SEVEN_DAYS.getTime() + 28 * DAY,
    ).toISOString();

    beforeEach(async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await lendedFixture(tx);
        const { cron } = services(f.client);
        jest.setSystemTime(FIRST_SWEEP);
        expect(await cron.run('markOverdue')).toMatchObject({ affected: 1 });
        const first = await lateState(tx, f);
        expect(first).toMatchObject({ activeDeduction: 2, creditScore: 98 });
        expect(first.penalties).toHaveLength(1);
        dailyWhileOut = [];
        // Four days is the first quote's term (2 credit * 2). This clock
        // passes that point while the item is still out, before it is lost.
        expect(STILL_OUT.getTime()).toBeGreaterThan(
          FIRST_SWEEP.getTime() + 4 * DAY,
        );
        // Exercise the daily schedule, not only a single jump to expiry.
        // Subsequent billing must not allow any deduction to expire while out.
        for (let day = 0; day <= 4; day++) {
          jest.setSystemTime(new Date(FIRST_SWEEP.getTime() + day * DAY));
          await cron.run('markOverdue');
          jest.setSystemTime(
            new Date(FIRST_SWEEP.getTime() + day * DAY + 59 * 60_000),
          );
          await cron.run('expireDemerits');
          const dailyState = await lateState(tx, f);
          expect(dailyState.usage).toEqual({
            CurrentStatus: 'Lended',
            CheckInTime: null,
          });
          dailyWhileOut.push(dailyState);
        }
        jest.setSystemTime(STILL_OUT);
        whileOut = await lateState(tx, f);
        expect(whileOut.usage).toEqual({
          CurrentStatus: 'Lended',
          CheckInTime: null,
        });

        jest.setSystemTime(RETURN_AFTER_SEVEN_DAYS);
        receipt = await returnLoan(f.client, f);
        expect(receipt).toMatchObject({
          loan: { status: 'Returned' },
          latePenalty: { overdueDays: 7 },
        });
        afterReturn = await lateState(tx, f);
        assertReceiptExpiryMatchesDatabase(receipt, afterReturn);
      });
    });

    it('does not restore overdue credit while the borrower still holds the item', () => {
      expect(whileOut.creditScore).toBeLessThan(100);
      expect(whileOut.penalties.some((row) => row.InEffect)).toBe(true);
      for (const dailyState of dailyWhileOut) {
        expect(dailyState.creditScore).toBeLessThan(100);
        expect(dailyState.penalties.some((row) => row.InEffect)).toBe(true);
      }
    });

    it('settles the full late charge despite an old expiry and starts its complete term at return', () => {
      expect(afterReturn).toMatchObject({
        activeDeduction: 14,
        creditScore: 86,
        usage: {
          CurrentStatus: 'Returned',
          CheckInTime: RETURN_AFTER_SEVEN_DAYS,
        },
      });
      // FR-CRD-04: 14 credit * 2 = 28 days, starting at actual receipt.
      // This permits multiple adjustment rows without prescribing their IDs.
      expect(afterReturn.active.length).toBeGreaterThan(0);
      for (const penalty of afterReturn.active) {
        expect(penalty.ExpirationTime).toEqual(
          new Date(RETURN_AFTER_SEVEN_DAYS.getTime() + 28 * DAY),
        );
      }
    });
    it('reports the complete seven-day late deduction after old expiry', () => {
      expect(receipt.latePenalty!.creditDeducted).toBe(14);
    });
    it('reports the renewed expiry instead of the expired historical term', () => {
      expect(receipt.latePenalty!.expiresAt).toBe(expectedExpiry);
    });
  });

  describe('#196: another expiry recomputes credit while the item is still held', () => {
    let whileOut: LateState;
    let borrowerCredit: CreditOutput;
    let afterRepeat: LateState;
    let affected: number[];
    let repeatedAffected: number;
    let otherInEffect: boolean | null;
    let usageKey: number;

    beforeEach(async () => {
      await inHistoryFixture(prisma, async (tx) => {
        const f = await lendedFixture(tx);
        usageKey = f.usageKey;
        const { cron } = services(f.client);
        const penalties = new PenaltyService(f.client);
        const credit = new CreditService(
          f.client,
          new CreditTierService(f.client),
        );

        jest.setSystemTime(FIRST_SWEEP);
        expect(await cron.run('markOverdue')).toMatchObject({ affected: 1 });
        expect(await lateState(tx, f)).toMatchObject({
          activeDeduction: 2,
          creditScore: 98,
          usage: { CurrentStatus: 'Lended', CheckInTime: null },
        });

        // A separate incident on the same account triggers a later recompute.
        // Its matching rule directly supplies the five-day term; this is not
        // a three-point formula penalty with an inconsistent duration.
        await tx.penaltyRule.create({
          data: {
            BorrowRuleKey: f.rule.BorrowRuleKey,
            PenaltyReason: 'DamagedItem',
            PenaltyAmount: 3,
            PenaltyLength: 5,
          },
        });
        const quote = await penalties.quoteDamage(
          f.rule.BorrowRuleKey,
          14,
          'B1',
        );
        expect(quote).toMatchObject({
          amount: 3,
          lengthDays: 5,
          source: 'PenaltyRule',
        });
        const otherKey = await penalties.apply(tx, quote, {
          accountKey: f.users[0].accountKey,
          usageKey: null,
          effectiveFrom: FIRST_SWEEP,
        });
        expect(otherKey).not.toBeNull();
        expect((await lateState(tx, f)).creditScore).toBe(95);

        // The original two-point quote has a four-day term. Run expiry daily
        // through the other penalty's fifth day, without returning or renewing.
        affected = [];
        for (let day = 1; day <= 5; day++) {
          jest.setSystemTime(new Date(FIRST_SWEEP.getTime() + day * DAY));
          affected.push((await cron.run('expireDemerits')).affected);
        }
        whileOut = await lateState(tx, f);
        otherInEffect = (
          await tx.penaltyInfo.findUniqueOrThrow({
            where: { PenaltyKey: otherKey! },
            select: { InEffect: true },
          })
        ).InEffect;
        borrowerCredit = creditOutput
          .strict()
          .parse(await credit.getCredit(f.users[0].accountKey));

        // Setup, database reads, API validation and repeat-job checks stay
        // outside expected-failure markers; only product assertions fail.
        repeatedAffected = (await cron.run('expireDemerits')).affected;
        afterRepeat = await lateState(tx, f);
      });
    });

    it('expires only the unrelated penalty and keeps the loan outstanding', () => {
      expect(affected).toEqual([0, 0, 0, 0, 1]);
      expect(otherInEffect).toBe(false);
      expect(whileOut.usage).toEqual({
        CurrentStatus: 'Lended',
        CheckInTime: null,
      });
      expect(whileOut.penalties.some((row) => row.InEffect)).toBe(true);
    });

    it('does not apply a second change when the expiry job is repeated', () => {
      expect(repeatedAffected).toBe(0);
      expect(afterRepeat).toEqual(whileOut);
    });

    it('keeps the overdue deduction in persisted credit after recomputation', () => {
      expect(whileOut.creditScore).toBe(98);
    });

    it('keeps the still-held overdue charge in the borrower credit response', () => {
      expect(borrowerCredit.totalDeducted).toBe(2);
      expect(borrowerCredit.activePenalties).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ usageKey, creditDeducted: 2 }),
        ]),
      );
    });
  });

  describe.each([
    { source: 'fallback formula', rate: null, daily: 2, term: 20 },
    { source: 'configured two-day term', rate: 3, daily: 3, term: 2 },
  ])(
    'My profile: five overdue sweeps until actual return / $source',
    ({ rate, daily, term }) => {
      // Wednesday due, Monday receipt: five calendar days, including the weekend.
      const due = new Date('2031-10-01T10:00:00.000Z');
      const firstSweep = new Date('2031-10-01T17:01:00.000Z');
      const returnedAt = new Date('2031-10-06T09:00:00.000Z');
      let days: { at: Date; state: LateState; credit: CreditOutput }[];
      let afterReturn: { state: LateState; credit: CreditOutput };
      let receipt: Receipt;
      let billings: number[];
      let expirations: number[];
      let lossJobs: number[];
      let afterExpiry: { state: LateState; credit: CreditOutput };

      beforeEach(async () => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await lendedFixture(tx, due);
          const { cron } = services(f.client);
          const credit = new CreditService(
            f.client,
            new CreditTierService(f.client),
          );
          const read = async () => ({
            state: await lateState(tx, f),
            credit: creditOutput
              .strict()
              .parse(await credit.getCredit(f.users[0].accountKey)),
          });
          if (rate !== null) {
            await tx.penaltyRule.create({
              data: {
                BorrowRuleKey: f.rule.BorrowRuleKey,
                PenaltyReason: 'ReturnLate',
                PenaltyAmount: rate,
                PenaltyLength: term,
              },
            });
          }
          days = [];
          billings = [];
          expirations = [];
          lossJobs = [];
          for (let day = 0; day < 5; day++) {
            jest.setSystemTime(new Date(firstSweep.getTime() + day * DAY));
            billings.push((await cron.run('markOverdue')).affected);
            jest.setSystemTime(
              new Date(firstSweep.getTime() + day * DAY + 14 * 60_000),
            );
            lossJobs.push((await cron.run('markLost')).affected);
            jest.setSystemTime(
              new Date(firstSweep.getTime() + day * DAY + 59 * 60_000),
            );
            expirations.push((await cron.run('expireDemerits')).affected);
            days.push({ at: new Date(), ...(await read()) });
          }
          jest.setSystemTime(returnedAt);
          receipt = await returnLoan(f.client, f);
          afterReturn = await read();
          assertReceiptExpiryMatchesDatabase(receipt, afterReturn.state);
          expect(await cron.run('markOverdue')).toMatchObject({ affected: 0 });
          expect(await cron.run('expireDemerits')).toMatchObject({
            affected: 0,
          });
          expect(await read()).toEqual(afterReturn);

          const expiry = new Date(returnedAt.getTime() + term * DAY);
          jest.setSystemTime(new Date(expiry.getTime() - 1));
          expect(await cron.run('expireDemerits')).toMatchObject({
            affected: 0,
          });
          expect(await read()).toEqual(afterReturn);
          jest.setSystemTime(expiry);
          expect(await cron.run('expireDemerits')).toMatchObject({
            affected: 1,
          });
          afterExpiry = await read();
          expect(await cron.run('expireDemerits')).toMatchObject({
            affected: 0,
          });
          expect(await read()).toEqual(afterExpiry);
        });
      });

      it('charges once and keeps all five daily loans outstanding without restoring stored credit', () => {
        expect(billings).toEqual([1, 0, 0, 0, 0]);
        expect(expirations).toEqual([0, 0, 0, 0, 0]);
        expect(lossJobs).toEqual([0, 0, 0, 0, 0]);
        for (const { state, credit } of days) {
          expect(state.penalties).toHaveLength(1);
          expect(state.penalties[0]).toMatchObject({
            CreditDeducted: daily,
            InEffect: true,
          });
          expect(state.usage).toEqual({
            CurrentStatus: 'Lended',
            CheckInTime: null,
          });
          expect(state.creditScore).toBe(100 - daily);
          expect(credit.score).toBe(100 - daily);
        }
      });

      it('keeps ReturnLate visible with its deduction in every daily My profile response until receipt', () => {
        for (const { credit } of days) {
          expect(credit.totalDeducted).toBe(daily);
          expect(credit.activePenalties).toHaveLength(1);
          expect(credit.activePenalties[0]).toMatchObject({
            reason: expect.stringMatching(/^ReturnLate/),
            creditDeducted: daily,
            itemName: expect.any(String),
          });
        }
      });

      it('reports all five late days and starts the complete term at actual Monday receipt', () => {
        const expiry = new Date(
          returnedAt.getTime() + term * DAY,
        ).toISOString();
        expect(receipt.latePenalty).toMatchObject({
          overdueDays: 5,
          creditDeducted: daily * 5,
          expiresAt: expiry,
        });
        expect(afterReturn.state).toMatchObject({
          creditScore: 100 - daily * 5,
          activeDeduction: daily * 5,
          usage: { CurrentStatus: 'Returned', CheckInTime: returnedAt },
        });
        expect(afterReturn.state.penalties).toHaveLength(1);
        expect(afterReturn.credit).toMatchObject({
          score: 100 - daily * 5,
          totalDeducted: daily * 5,
        });
        expect(afterReturn.credit.activePenalties).toHaveLength(1);
        expect(afterReturn.credit.activePenalties[0]).toMatchObject({
          creditDeducted: daily * 5,
          issuedAt: returnedAt.toISOString(),
          expiresAt: expiry,
        });
      });

      it('restates the five late days in the reason the profile shows (#201)', () => {
        for (const { state } of days) {
          expect(state.penalties[0].Reason).toBe(
            'ReturnLate: overdue 1d (scheduled)',
          );
        }
        expect(afterReturn.state.penalties[0].Reason).toBe(
          'ReturnLate: overdue 5d',
        );
      });

      it('restores credit and removes the profile row only at the term measured from actual receipt', () => {
        expect(afterExpiry.state.creditScore).toBe(100);
        expect(afterExpiry.state.penalties[0].InEffect).toBe(false);
        expect(afterExpiry.credit).toMatchObject({
          score: 100,
          totalDeducted: 0,
          activePenalties: [],
        });
      });
    },
  );

  describe('penalty duration starts at actual return', () => {
    it.each([-1, 0, 1])(
      'expires only at or after the actual-return boundary (offset %i ms)',
      async (offset) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await lendedFixture(tx);
          const { cron } = services(f.client);
          jest.setSystemTime(RETURN_AFTER_THREE_DAYS);
          const receipt = await returnLoan(f.client, f);
          const expiry = new Date(RETURN_AFTER_THREE_DAYS.getTime() + 12 * DAY);
          expect(receipt.latePenalty).toMatchObject({
            creditDeducted: 6,
            expiresAt: expiry.toISOString(),
          });
          jest.setSystemTime(new Date(expiry.getTime() + offset));
          const expired = offset >= 0;
          expect(await cron.run('expireDemerits')).toMatchObject({
            affected: expired ? 1 : 0,
          });
          const state = await lateState(tx, f);
          expect(state.creditScore).toBe(expired ? 100 : 94);
          expect(
            state.penalties.every((row) => row.InEffect === !expired),
          ).toBe(true);
          // Re-running the job cannot restore credit twice or change receipt time.
          expect(await cron.run('expireDemerits')).toMatchObject({
            affected: 0,
          });
          expect(await lateState(tx, f)).toEqual(state);
          expect(state.usage.CheckInTime).toEqual(RETURN_AFTER_THREE_DAYS);
        });
      },
    );

    describe('configured rate without an earlier overdue sweep', () => {
      let receipt: Receipt;
      let atBoundary: LateState;
      const expiry = new Date(RETURN_AFTER_THREE_DAYS.getTime() + 20 * DAY);
      it.each([-1, 0, 1])(
        'uses the configured 20-day term for nine deducted points (boundary offset %i ms)',
        async (offset) => {
          await inHistoryFixture(prisma, async (tx) => {
            const f = await lendedFixture(tx);
            await tx.penaltyRule.create({
              data: {
                BorrowRuleKey: f.rule.BorrowRuleKey,
                PenaltyReason: 'ReturnLate',
                PenaltyAmount: 3,
                PenaltyLength: 20,
              },
            });
            jest.setSystemTime(RETURN_AFTER_THREE_DAYS);
            receipt = await returnLoan(f.client, f);
            expect(receipt).toMatchObject({
              loan: { status: 'Returned' },
              latePenalty: { creditDeducted: 9, overdueDays: 3 },
            });
            const atReturn = await lateState(tx, f);
            expect(atReturn).toMatchObject({
              activeDeduction: 9,
              creditScore: 91,
            });
            assertReceiptExpiryMatchesDatabase(receipt, atReturn);
            // Nine points would give 18 days by formula; the matching rule
            // must keep the charge active until its independently set 20 days.
            jest.setSystemTime(
              new Date(RETURN_AFTER_THREE_DAYS.getTime() + 18 * DAY),
            );
            expect(
              await services(f.client).cron.run('expireDemerits'),
            ).toMatchObject({ affected: 0 });
            expect((await lateState(tx, f)).creditScore).toBe(91);
            jest.setSystemTime(new Date(expiry.getTime() + offset));
            const expired = offset >= 0;
            expect(
              await services(f.client).cron.run('expireDemerits'),
            ).toMatchObject({ affected: expired ? 1 : 0 });
            atBoundary = await lateState(tx, f);
            expect(receipt.latePenalty!.expiresAt).toBe(expiry.toISOString());
            expect(atBoundary.creditScore).toBe(expired ? 100 : 91);
            expect(
              atBoundary.penalties.every((row) => row.InEffect === !expired),
            ).toBe(true);
            expect(
              await services(f.client).cron.run('expireDemerits'),
            ).toMatchObject({ affected: 0 });
            expect(await lateState(tx, f)).toEqual(atBoundary);
          });
        },
      );
    });
  });

  describe('docs §5.7: irrecoverable loss starts its term at the staff report', () => {
    it.each([
      {
        label: 'before the due date',
        reportAt: new Date('2031-09-26T05:00:00Z'),
        points: 70,
      },
      {
        label: 'three days after the due date',
        reportAt: RETURN_AFTER_THREE_DAYS,
        points: 76,
      },
    ])(
      'starts and expires the penalty reported $label',
      async ({ reportAt, points }) => {
        await inHistoryFixture(prisma, async (tx) => {
          const f = await lendedFixture(tx);
          const { loan, cron } = services(f.client);
          jest.setSystemTime(reportAt);
          const reported = loanOutput.strict().parse(
            await loan.markLost(f.staff, {
              usageKey: f.usageKey,
              reportedByBorrower: true,
              reason: 'Borrower reports irrecoverable loss to staff',
            }),
          );
          expect(reported.status).toBe('Inspected');
          const expiry = new Date(reportAt.getTime() + points * 2 * DAY);
          const reportedState = await lateState(tx, f, 'LostItem');
          expect(reportedState).toMatchObject({
            activeDeduction: points,
            creditScore: 100 - points,
          });
          expect(reportedState.penalties).toHaveLength(1);
          expect(reportedState.penalties[0]).toMatchObject({
            ActionTime: reportAt,
            ExpirationTime: expiry,
            InEffect: true,
          });
          jest.setSystemTime(new Date(expiry.getTime() - 1));
          expect(await cron.run('expireDemerits')).toMatchObject({
            affected: 0,
          });
          expect((await lateState(tx, f, 'LostItem')).creditScore).toBe(
            100 - points,
          );
          jest.setSystemTime(expiry);
          expect(await cron.run('expireDemerits')).toMatchObject({
            affected: 1,
          });
          const expired = await lateState(tx, f, 'LostItem');
          expect(expired.creditScore).toBe(100);
          expect(expired.penalties[0].InEffect).toBe(false);
          jest.setSystemTime(new Date(expiry.getTime() + 1));
          expect(await cron.run('expireDemerits')).toMatchObject({
            affected: 0,
          });
          expect(await lateState(tx, f, 'LostItem')).toEqual(expired);
        });
      },
    );
  });
});
