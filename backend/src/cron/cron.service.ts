import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PenaltyService } from '../common/penalty/penalty.service';
import { NotificationService } from '../notification/notification.service';
import { notImplemented } from '../common/errors/business-error';

/** The eight jobs in SRS §5.3. */
export type CronJobId =
  | 'markOverdue'
  | 'markLost'
  | 'expireDemerits'
  | 'computeAvailability'
  | 'rollupDailyStats'
  | 'openT3InspectionRounds'
  | 'dueSoonReminder'
  | 'expireStaleRequests';

/** §5.7: two weeks past due and the thing is written off. */
const LOST_AFTER_DAYS = 14;

export interface CronOutcome {
  affected: number;
  detail: string;
}

/**
 * The scheduled jobs (SRS §5.3).
 *
 * Each one is idempotent: running it twice in a row changes nothing the second
 * time. That matters more here than anywhere else in the codebase, because
 * these run unattended and an administrator can also fire one by hand from the
 * status page, so "ran twice" is a normal Tuesday rather than an incident.
 *
 * Every run is written to CronRunLog whether it succeeds or throws. A job that
 * silently does nothing and a job that was never scheduled look identical from
 * outside, and the status page has to tell them apart.
 */
@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly penalties: PenaltyService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Runs one job and records the attempt.
   *
   * The log row is opened before the work starts, so a job that crashes the
   * process still leaves evidence that it began.
   */
  async run(job: CronJobId): Promise<CronOutcome> {
    const started = new Date();
    const row = await this.prisma.cronRunLog.create({
      data: { Job: job, StartedAt: started, Result: 'pending' },
      select: { RunKey: true },
    });

    try {
      const outcome = await this.execute(job);
      await this.prisma.cronRunLog.update({
        where: { RunKey: row.RunKey },
        data: {
          FinishedAt: new Date(),
          Result: 'success',
          Affected: outcome.affected,
          Detail: outcome.detail,
        },
      });
      return outcome;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.cronRunLog.update({
        where: { RunKey: row.RunKey },
        data: { FinishedAt: new Date(), Result: 'failed', Detail: message },
      });
      // Re-thrown so a manual run reports the failure to the administrator who
      // asked for it; the scheduled path catches it instead (see runScheduled).
      throw error;
    }
  }

  /** Scheduled entry point: never let one failing job take the process down. */
  async runScheduled(job: CronJobId): Promise<void> {
    try {
      const outcome = await this.run(job);
      this.logger.log(`${job}: ${outcome.detail}`);
    } catch (error) {
      this.logger.error(
        `${job} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private execute(job: CronJobId): Promise<CronOutcome> {
    switch (job) {
      case 'markOverdue':
        return this.markOverdue();
      case 'markLost':
        return this.markLost();
      case 'expireDemerits':
        return this.expireDemerits();
      case 'dueSoonReminder':
        return this.dueSoonReminder();
      case 'expireStaleRequests':
        return this.expireStaleRequests();
      case 'computeAvailability':
        return notImplemented(
          ['a stored availability column or table'],
          'Availability is computed live by item.getAvailability and the catalogue queries, so there is nothing for a nightly job to precompute. Needed only if those queries become too slow to run per request.',
        );
      case 'rollupDailyStats':
        return notImplemented(
          ['a DailyStats table (date, department, loans, overdue, returns)'],
          'report.summary counts from UsageLog on demand. A rollup needs somewhere to put the daily figures, and would only pay for itself once counting live is too slow.',
        );
      case 'openT3InspectionRounds':
        return notImplemented(
          ['an inspection task/round table', 'seeded T3 rooms'],
          'inspection.recordRoomCheck records the result of a check, but nothing models the task of doing one, and no rooms exist to check.',
        );
    }
  }

  // ── The jobs ────────────────────────────────────────────────────────────

  /**
   * Charges the late penalty on loans that are past due (SRS §5.3 "สร้าง
   * Demerit").
   *
   * One penalty per loan, ever. `loan.recordReturn` also charges lateness when
   * the item comes back, so without a guard on both sides a late return would
   * be billed twice - once by this job while the item was still out, once at
   * the counter. The guard is the existence of a ReturnLate penalty against
   * that UsageKey.
   *
   * A consequence worth knowing: a loan this job has already charged keeps the
   * figure from the night it was charged, which is smaller than the final
   * total if the borrower keeps it longer. Undercharging slightly is the safe
   * side of that trade; the alternative is re-charging every night.
   */
  private async markOverdue(): Promise<CronOutcome> {
    const now = new Date();
    const overdue = await this.prisma.usageLog.findMany({
      where: {
        CurrentStatus: 'Lended',
        DueTime: { lt: now },
        // Nothing already billed for lateness on this loan.
        Penalties: { none: { Reason: { startsWith: 'ReturnLate' } } },
      },
      select: {
        UsageKey: true,
        AccountKey: true,
        DueTime: true,
        Resource: {
          select: {
            BorrowRule: true,
            Item: { select: { Item: { select: { CreditWeight: true } } } },
            Room: { select: { CreditWeight: true } },
          },
        },
      },
    });

    let charged = 0;
    for (const loan of overdue) {
      const weight =
        loan.Resource.Item?.Item.CreditWeight ??
        loan.Resource.Room?.CreditWeight ??
        0;
      const days = this.penalties.overdueDays(loan.DueTime, now);
      const quote = await this.penalties.quoteLate(
        loan.Resource.BorrowRule,
        weight,
        days,
      );
      if (quote.amount <= 0) continue;

      await this.prisma.$transaction((tx) =>
        this.penalties.apply(tx, quote, {
          accountKey: loan.AccountKey,
          usageKey: loan.UsageKey,
          effectiveFrom: now,
          note: `overdue ${days}d (scheduled)`,
        }),
      );
      charged++;
    }

    return {
      affected: charged,
      detail: `${overdue.length} loan(s) past due, ${charged} newly charged`,
    };
  }

  /**
   * Writes off loans more than two weeks past due (§5.7).
   *
   * The unit goes to `Missing` and the borrower is charged the replacement
   * penalty. Loans already marked lost are skipped by the status filter, so
   * this is safe to run repeatedly.
   */
  private async markLost(): Promise<CronOutcome> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - LOST_AFTER_DAYS * 86_400_000);

    const stale = await this.prisma.usageLog.findMany({
      where: { CurrentStatus: 'Lended', DueTime: { lt: cutoff } },
      select: {
        UsageKey: true,
        AccountKey: true,
        DueTime: true,
        Resource: {
          select: {
            ResourceKey: true,
            BorrowRule: true,
            Item: { select: { Item: { select: { CreditWeight: true } } } },
            Room: { select: { CreditWeight: true } },
          },
        },
      },
    });

    for (const loan of stale) {
      const weight =
        loan.Resource.Item?.Item.CreditWeight ??
        loan.Resource.Room?.CreditWeight ??
        0;
      // quoteLost takes the overdue days too: how long it was missing
      // feeds the penalty term, not just the replacement cost.
      const overdue = this.penalties.overdueDays(loan.DueTime, now);
      const quote = await this.penalties.quoteLost(
        loan.Resource.BorrowRule,
        weight,
        overdue,
      );

      await this.prisma.$transaction(async (tx) => {
        await tx.usageLog.update({
          where: { UsageKey: loan.UsageKey },
          data: { CurrentStatus: 'Returned' },
        });
        await tx.resourceInfo.update({
          where: { ResourceKey: loan.Resource.ResourceKey },
          data: { ResourceStatus: 'Missing' },
        });
        await this.penalties.apply(tx, quote, {
          accountKey: loan.AccountKey,
          usageKey: loan.UsageKey,
          effectiveFrom: now,
          note: `not returned within ${LOST_AFTER_DAYS} days (scheduled)`,
        });
      });
    }

    return {
      affected: stale.length,
      detail: `${stale.length} loan(s) written off after ${LOST_AFTER_DAYS} days`,
    };
  }

  /**
   * Lifts penalties whose term has run out, and gives the credit back
   * (SRS §5.3 "หมดอายุบทลงโทษ + recompute credit_score").
   *
   * The credit is restored by the amount the penalty took, rather than
   * recomputed from scratch: PenaltyInfo.CreditDeducted is the record of what
   * was taken, and adding it back is exactly reversible. Recomputing a score
   * from the surviving penalty rows would quietly discard every manual
   * adjustment an administrator has ever made.
   */
  private async expireDemerits(): Promise<CronOutcome> {
    const now = new Date();
    const expired = await this.prisma.penaltyInfo.findMany({
      where: { InEffect: true, ExpirationTime: { lte: now } },
      select: { PenaltyKey: true, AccountKey: true, CreditDeducted: true },
    });

    for (const p of expired) {
      await this.prisma.$transaction(async (tx) => {
        await tx.penaltyInfo.update({
          where: { PenaltyKey: p.PenaltyKey },
          data: { InEffect: false },
        });
        if (p.CreditDeducted && p.CreditDeducted > 0) {
          await tx.accountInfo.update({
            where: { AccountKey: p.AccountKey },
            data: { UserCredit: { increment: p.CreditDeducted } },
          });
        }
      });
    }

    const restored = expired.reduce((n, p) => n + (p.CreditDeducted ?? 0), 0);
    return {
      affected: expired.length,
      detail: `${expired.length} penalty(ies) expired, ${restored} credit restored`,
    };
  }

  /**
   * Sends the near-due reminders (SRS §5.3 "ส่งแจ้งเตือนใกล้ครบกำหนด").
   *
   * Delegates to NotificationService.syncDueReminders, which already writes
   * exactly these notifications for one account and is idempotent. It was
   * built to be driven by the borrower's own poll until a scheduler existed;
   * this is that scheduler, and it reaches borrowers who never open the app.
   */
  private async dueSoonReminder(): Promise<CronOutcome> {
    const accounts = await this.prisma.usageLog.findMany({
      where: { CurrentStatus: 'Lended' },
      select: { AccountKey: true },
      distinct: ['AccountKey'],
    });

    for (const a of accounts) {
      await this.notifications.syncDueReminders(a.AccountKey);
    }

    return {
      affected: accounts.length,
      detail: `reminders synced for ${accounts.length} borrower(s) with open loans`,
    };
  }

  /**
   * Releases approved requests nobody came to collect (SRS §5.3 "Release
   * No-show: ปล่อยของกลับ pool หากไม่มีคนมารับ").
   *
   * Only requests still waiting for collection. Once staff have set a unit
   * aside there is a UsageLog, and that is the counter's problem to settle,
   * not a job's.
   */
  private async expireStaleRequests(): Promise<CronOutcome> {
    const now = new Date();
    const stale = await this.prisma.reservations.findMany({
      where: {
        ApproveStatus: 'Approved',
        ReservationExpiration: { lt: now },
        UsageLogs: { none: {} },
      },
      select: { ReservationKey: true },
    });
    if (stale.length === 0) {
      return { affected: 0, detail: 'no uncollected requests past their hold' };
    }

    const keys = stale.map((r) => r.ReservationKey);
    await this.prisma.reservations.updateMany({
      where: { ReservationKey: { in: keys } },
      data: { ApproveStatus: 'Canceled' },
    });

    return {
      affected: keys.length,
      detail: `${keys.length} uncollected request(s) released back to the pool`,
    };
  }

  /** Newest run per job, for the status page. */
  async lastRuns(): Promise<
    Map<string, { at: Date; result: string; durationMs: number | null }>
  > {
    const rows = await this.prisma.cronRunLog.findMany({
      orderBy: { StartedAt: 'desc' },
      select: {
        Job: true,
        StartedAt: true,
        FinishedAt: true,
        Result: true,
      },
    });

    const newest = new Map<
      string,
      { at: Date; result: string; durationMs: number | null }
    >();
    for (const r of rows) {
      if (newest.has(r.Job)) continue;
      newest.set(r.Job, {
        at: r.StartedAt,
        result: r.Result,
        durationMs: r.FinishedAt
          ? r.FinishedAt.getTime() - r.StartedAt.getTime()
          : null,
      });
    }
    return newest;
  }
}
