import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  OPEN_LATE_PENALTY,
  PenaltyService,
} from '../common/penalty/penalty.service';
import {
  NotificationService,
  reminderKeyOf,
  resourceName,
  supervisorsForGroup,
} from '../notification/notification.service';
import { recomputeCredit } from '../common/credit/recompute-credit';
import { LATE_PENALTY_HELD_OPEN } from '../common/schemas/penalty.schema';

/** The six jobs in SRS §5.3 that this system runs. */
export type CronJobId =
  | 'markOverdue'
  | 'markLost'
  | 'expireDemerits'
  | 'openT3InspectionRounds'
  | 'dueSoonReminder'
  | 'expireStaleRequests';

/**
 * How long a room may go unchecked before a new round opens.
 *
 * A month: long enough that staff are not handed the same room every week,
 * short enough that a term does not pass without anybody looking at it.
 */
const CHECK_INTERVAL_DAYS = 30;

/** How long staff have to carry out a round once it is opened. */
const CHECK_GRACE_DAYS = 7;

/** §5.7: two weeks past due and the thing is written off. */
const LOST_AFTER_DAYS = 14;
/** Approval-wait round: an undecided request starting within this many hours is brought to the supervisors again… */
const REMIND_BEFORE_START_HOURS = 24;
/** …once it has waited this long, so a request sent an hour ago is not announced twice. */
const REMIND_AFTER_WAITING_HOURS = 6;
/** The occasion of that reminder, part of its dedupe key: one per request. */
const BEFORE_START = 'before-start';

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
      case 'openT3InspectionRounds':
        return this.openT3InspectionRounds();
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
        // Nothing already billed for lateness since the current due time.
        Penalties: { none: OPEN_LATE_PENALTY },
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
   *
   * #230: the loan is closed the way a staff write-off closes it (Inspected),
   * not 'Returned', which would put it in the inspection queue as if the
   * unit were back on the counter.
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
        PendingExtension: true,
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
          data: {
            CurrentStatus: 'Inspected',
            CheckInTime: now,
            PendingExtension: null,
          },
        });
        if (loan.PendingExtension !== null) {
          await tx.extensionRequest.updateMany({
            where: {
              ExtensionKey: loan.PendingExtension,
              ApproveStatus: 'Pending',
            },
            data: { ApproveStatus: 'Canceled', ResolvedAt: now },
          });
        }
        await tx.resourceInfo.update({
          where: { ResourceKey: loan.Resource.ResourceKey },
          data: { ResourceStatus: 'Missing', AllowBorrow: false },
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
   * The score is recomputed from the penalties still in force (FR-CRD-06).
   */
  private async expireDemerits(): Promise<CronOutcome> {
    const now = new Date();
    const expired = await this.prisma.penaltyInfo.findMany({
      where: {
        InEffect: true,
        ExpirationTime: { lte: now },
        // #196: lateness keeps counting until the item is back, so its
        // penalty cannot run out first. The return restarts its clock. The
        // same row is what `activePenaltyWhere` keeps counting against the
        // score, so leaving it open here does not hand the points back (#199).
        NOT: LATE_PENALTY_HELD_OPEN,
      },
      select: { PenaltyKey: true, AccountKey: true, CreditDeducted: true },
    });

    for (const p of expired) {
      await this.prisma.$transaction(async (tx) => {
        await tx.penaltyInfo.update({
          where: { PenaltyKey: p.PenaltyKey },
          data: { InEffect: false },
        });
        await recomputeCredit(tx, p.AccountKey);
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

    // FR-NTF-03: staff hear about returns due within a day, or already late.
    const dueBack = await this.prisma.usageLog.findMany({
      where: {
        CurrentStatus: 'Lended',
        DueTime: { lt: new Date(Date.now() + 86_400_000) },
      },
      select: {
        UsageKey: true,
        DueTime: true,
        Resource: {
          select: {
            ManagedBy: true,
            Item: { select: { Item: { select: { ItemName: true } } } },
            Room: { select: { RoomName: true } },
          },
        },
      },
    });
    for (const loan of dueBack) {
      await this.notifications.returnToReceive(this.prisma, {
        manageGroupKey: loan.Resource.ManagedBy,
        usageKey: loan.UsageKey,
        itemName: resourceName(loan.Resource),
        due: loan.DueTime,
      });
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
  /**
   * Opens a condition-check task for every bookable room whose last check has
   * aged out (§5.3, §5.9).
   *
   * Idempotent in the way that matters here: a room with a round already open
   * is skipped, and the `@@unique([ResourceKey, ClosedAt])` constraint means
   * two runs racing cannot both win. Running it twice in a row opens nothing
   * the second time.
   *
   * Only bookable rooms. A room already withdrawn from service does not need a
   * task telling somebody to go and find out that it is broken; the check that
   * withdrew it is the record, and it comes back into the rotation when it is
   * made bookable again.
   */
  private async openT3InspectionRounds(): Promise<CronOutcome> {
    const now = new Date();
    const staleBefore = new Date(
      now.getTime() - CHECK_INTERVAL_DAYS * 86_400_000,
    );

    const rooms = await this.prisma.resourceInfo.findMany({
      where: { ResourceType: 'Room', AllowBorrow: true },
      select: {
        ResourceKey: true,
        ManagedBy: true,
        Room: { select: { RoomName: true } },
        CheckRounds: {
          orderBy: { OpenedAt: 'desc' },
          take: 1,
          select: { ClosedAt: true },
        },
      },
    });

    const due = rooms.filter(({ CheckRounds: [latest] }) => {
      if (!latest) return true;
      // Still open: the task exists and nobody has done it yet.
      if (!latest.ClosedAt) return false;
      return latest.ClosedAt < staleBefore;
    });

    if (due.length === 0) {
      return {
        affected: 0,
        detail: 'every bookable room has been checked recently',
      };
    }

    const dueAt = new Date(now.getTime() + CHECK_GRACE_DAYS * 86_400_000);
    const { count } = await this.prisma.roomCheckRound.createMany({
      data: due.map((room) => ({
        ResourceKey: room.ResourceKey,
        OpenedAt: now,
        DueAt: dueAt,
      })),
      // A concurrent run that already opened one loses here rather than failing
      // the whole job.
      skipDuplicates: true,
    });

    for (const room of due) {
      await this.notifications.roomToCheck(this.prisma, {
        manageGroupKey: room.ManagedBy,
        resourceKey: room.ResourceKey,
        roomName: room.Room?.RoomName ?? `room ${room.ResourceKey}`,
        dueAt,
      });
    }

    return {
      affected: count,
      detail: `${count} room check round(s) opened, due ${CHECK_GRACE_DAYS} day(s) from now`,
    };
  }

  /**
   * Approval-wait round (30 Oct 2569), part 1a: a request still undecided as
   * its borrowing period comes close goes to the department's supervisors once
   * more. Only one that has already waited a while: a request sent this
   * morning for tomorrow has just been announced, and a second notice an hour
   * later would be noise.
   */
  private async remindBeforeStart(now: Date): Promise<number> {
    const waiting = await this.prisma.reservations.findMany({
      where: {
        ApproveStatus: 'Pending',
        StartTime: { gt: now, lte: hoursFrom(now, REMIND_BEFORE_START_HOURS) },
        ActionTime: { lte: hoursFrom(now, -REMIND_AFTER_WAITING_HOURS) },
      },
      select: {
        ReservationKey: true,
        ReservedBy: true,
        StartTime: true,
        Resource: {
          select: {
            ManagedBy: true,
            Item: { select: { Item: { select: { ItemName: true } } } },
            Room: { select: { RoomName: true } },
          },
        },
      },
    });
    // Once per request: skip those already reminded, so the count means
    // "reminded this run" and an hourly rerun does not rewrite anything.
    const already = new Set(
      (
        await this.prisma.notification.findMany({
          where: {
            DedupeKey: {
              in: waiting.map((r) =>
                reminderKeyOf(r.ReservationKey, BEFORE_START),
              ),
            },
          },
          select: { DedupeKey: true },
        })
      ).map((n) => n.DedupeKey),
    );
    let reminded = 0;
    for (const r of waiting) {
      if (already.has(reminderKeyOf(r.ReservationKey, BEFORE_START))) continue;
      await this.prisma.$transaction(async (tx) => {
        const supervisors = await supervisorsForGroup(tx, r.Resource.ManagedBy);
        for (const s of supervisors) {
          // A supervisor's own request is not theirs to approve (§5.9).
          if (s.AccountKey === r.ReservedBy) continue;
          await this.notifications.approvalReminder(tx, {
            accountKey: s.AccountKey,
            reservationKey: r.ReservationKey,
            itemName: resourceName(r.Resource),
            startTime: r.StartTime,
            occasion: BEFORE_START,
          });
        }
      });
      reminded += 1;
    }
    return reminded;
  }

  /**
   * Approval-wait round (30 Oct 2569), part 1c: a request nobody decided by
   * the end of its borrowing period is cancelled, and the borrower is told.
   * Until now it stayed "waiting for approval" for good, and a late approval
   * sent the borrower to a counter that then refused the pickup (R7-18).
   */
  private async lapseUndecided(now: Date): Promise<number> {
    const undecided = await this.prisma.reservations.findMany({
      where: { ApproveStatus: 'Pending', EndTime: { lte: now } },
      select: {
        ReservationKey: true,
        ReservedBy: true,
        Resource: {
          select: {
            Item: { select: { Item: { select: { ItemName: true } } } },
            Room: { select: { RoomName: true } },
          },
        },
      },
    });
    let lapsed = 0;
    for (const r of undecided) {
      const cancelled = await this.prisma.$transaction(async (tx) => {
        // Only while still undecided: a supervisor deciding at this moment
        // holds the row lock, and once they commit this matches nothing.
        const { count } = await tx.reservations.updateMany({
          where: { ReservationKey: r.ReservationKey, ApproveStatus: 'Pending' },
          data: { ApproveStatus: 'Canceled', ResolvedAt: now },
        });
        if (count === 0) return false;
        await this.notifications.requestLapsed(tx, {
          accountKey: r.ReservedBy,
          reservationKey: r.ReservationKey,
          itemName: resourceName(r.Resource),
        });
        return true;
      });
      if (cancelled) lapsed += 1;
    }
    return lapsed;
  }

  private async expireStaleRequests(): Promise<CronOutcome> {
    const now = new Date();
    const reminded = await this.remindBeforeStart(now);
    const lapsed = await this.lapseUndecided(now);
    const stale = await this.prisma.reservations.findMany({
      where: {
        ApproveStatus: 'Approved',
        ReservationExpiration: { lt: now },
        UsageLogs: { none: {} },
      },
      select: {
        ReservationKey: true,
        ReservedBy: true,
        Resource: {
          select: {
            Item: { select: { Item: { select: { ItemName: true } } } },
            Room: { select: { RoomName: true } },
          },
        },
      },
    });
    const keys = stale.map((r) => r.ReservationKey);
    if (keys.length > 0) {
      await this.prisma.reservations.updateMany({
        where: { ReservationKey: { in: keys } },
        data: { ApproveStatus: 'Canceled' },
      });
    }

    // FR-PKP-05: a unit already set aside for a no-show is released too. The
    // Prepared row never left the counter, so it is removed (with any pickup
    // photo taken for it) rather than kept as a loan that never happened.
    const noShows = await this.prisma.usageLog.findMany({
      where: {
        CurrentStatus: 'Prepared',
        Reservation: {
          ApproveStatus: 'Approved',
          ReservationExpiration: { lt: now },
        },
      },
      select: {
        UsageKey: true,
        ReservationKey: true,
        Reservation: {
          select: {
            ReservedBy: true,
            Resource: {
              select: {
                Item: { select: { Item: { select: { ItemName: true } } } },
                Room: { select: { RoomName: true } },
              },
            },
          },
        },
      },
    });
    for (const usage of noShows) {
      await this.prisma.$transaction([
        this.prisma.images.deleteMany({ where: { UsageKey: usage.UsageKey } }),
        this.prisma.usageLog.delete({ where: { UsageKey: usage.UsageKey } }),
        this.prisma.reservations.update({
          where: { ReservationKey: usage.ReservationKey! },
          data: { ApproveStatus: 'Canceled' },
        }),
      ]);
    }

    // FR-APV-06 / FR-NTF-01: the borrower hears their request was cancelled.
    const expired = [
      ...stale,
      ...noShows.map((u) => ({
        ReservationKey: u.ReservationKey!,
        ...u.Reservation!,
      })),
    ];
    for (const r of expired) {
      await this.notifications.requestExpired(this.prisma, {
        accountKey: r.ReservedBy,
        reservationKey: r.ReservationKey,
        itemName: resourceName(r.Resource),
      });
    }

    const released = keys.length + noShows.length;
    const affected = released + lapsed;
    return {
      affected,
      detail:
        affected === 0 && reminded === 0
          ? 'no uncollected requests past their hold'
          : `${keys.length} uncollected request(s) and ${noShows.length} prepared no-show(s) released back to the pool, ` +
            `${lapsed} undecided request(s) cancelled at the end of their period, ` +
            `${reminded} request(s) brought to the supervisors again before their start`,
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

function hoursFrom(at: Date, hours: number): Date {
  return new Date(at.getTime() + hours * 3_600_000);
}
