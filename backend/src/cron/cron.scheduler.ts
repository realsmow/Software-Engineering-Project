import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CronService } from './cron.service';
import { APP_TIME_ZONE } from '../common/schemas/datetime.schema';

/**
 * The clock. Separated from CronService so the jobs can be tested, and run by
 * hand from the status page, without a scheduler being involved at all.
 *
 * Times are the ones in SRS §5.3, spaced so the day's work happens in order:
 * lateness is charged before anything is written off, and penalties expire
 * before the day's reminders go out.
 *
 * Nothing here runs under `NODE_ENV=test`. The notification service already
 * flagged the reason when it declined to add a scheduler: background writes in
 * every test run and on every developer's machine. Registration is skipped
 * entirely in AppModule rather than guarded inside each handler, so a test
 * suite never has a timer pointing at its database.
 */

/**
 * Passed to every decorator below.
 *
 * Named once rather than repeated: the failure mode this guards against is a
 * sixth job being added without it, which nothing would report - the job would
 * register, fire, and log successfully, seven hours from where it was meant to.
 * cron.scheduler.spec.ts asserts that every scheduled method carries it.
 */
const SCHEDULE = { timeZone: APP_TIME_ZONE } as const;

@Injectable()
export class CronScheduler {
  constructor(private readonly jobs: CronService) {}

  @Cron('1 0 * * *', SCHEDULE)
  markOverdue() {
    return this.jobs.runScheduled('markOverdue');
  }

  @Cron('15 0 * * *', SCHEDULE)
  markLost() {
    return this.jobs.runScheduled('markLost');
  }

  @Cron('0 1 * * *', SCHEDULE)
  expireDemerits() {
    return this.jobs.runScheduled('expireDemerits');
  }

  @Cron('0 8 * * *', SCHEDULE)
  dueSoonReminder() {
    return this.jobs.runScheduled('dueSoonReminder');
  }

  /** Hourly: a unit nobody collected is a unit nobody else can borrow. */
  @Cron('0 * * * *', SCHEDULE)
  expireStaleRequests() {
    return this.jobs.runScheduled('expireStaleRequests');
  }
}
