import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CronService } from './cron.service';

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
@Injectable()
export class CronScheduler {
  constructor(private readonly jobs: CronService) {}

  @Cron('1 0 * * *')
  markOverdue() {
    return this.jobs.runScheduled('markOverdue');
  }

  @Cron('15 0 * * *')
  markLost() {
    return this.jobs.runScheduled('markLost');
  }

  @Cron('0 1 * * *')
  expireDemerits() {
    return this.jobs.runScheduled('expireDemerits');
  }

  @Cron('0 8 * * *')
  dueSoonReminder() {
    return this.jobs.runScheduled('dueSoonReminder');
  }

  /** Hourly: a unit nobody collected is a unit nobody else can borrow. */
  @Cron('0 * * * *')
  expireStaleRequests() {
    return this.jobs.runScheduled('expireStaleRequests');
  }
}
