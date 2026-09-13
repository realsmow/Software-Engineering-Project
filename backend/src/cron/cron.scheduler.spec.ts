import 'reflect-metadata';
import { CronScheduler } from './cron.scheduler';

/**
 * The key `@Cron` writes its options under. Not exported from the package
 * root, and the literal is the value @nestjs/schedule uses.
 */
const SCHEDULE_CRON_OPTIONS = 'SCHEDULE_CRON_OPTIONS';

interface CronMetadata {
  cronTime: string;
  timeZone?: string;
}

function scheduled(): Map<string, CronMetadata> {
  const found = new Map<string, CronMetadata>();
  const prototype = CronScheduler.prototype as unknown as Record<
    string,
    unknown
  >;
  for (const key of Object.getOwnPropertyNames(prototype)) {
    const method = prototype[key];
    if (typeof method !== 'function') continue;
    const meta = Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, method) as
      | CronMetadata
      | undefined;
    if (meta) found.set(key, meta);
  }
  return found;
}

/**
 * The clock, checked without starting it.
 *
 * Both halves of a scheduled job can be wrong in a way nothing else notices: a
 * cron expression that no longer matches SRS §5.3, and a missing timezone. The
 * second is the quiet one - `cron` falls back to the host's timezone, so the
 * jobs keep firing and keep logging, just seven hours out on a UTC server,
 * which looks like working software until somebody compares the times.
 *
 * Read off the decorator metadata rather than by booting ScheduleModule: the
 * suite must not acquire timers pointing at a database (see AppModule).
 */
describe('CronScheduler', () => {
  const EXPECTED: Record<string, string> = {
    markOverdue: '1 0 * * *',
    markLost: '15 0 * * *',
    expireDemerits: '0 1 * * *',
    dueSoonReminder: '0 8 * * *',
    expireStaleRequests: '0 * * * *',
  };

  it('schedules exactly the five implemented jobs, at the SRS §5.3 times', () => {
    const jobs = scheduled();

    expect([...jobs.keys()].sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const [name, expression] of Object.entries(EXPECTED)) {
      expect(jobs.get(name)?.cronTime).toBe(expression);
    }
  });

  it('states every one of those times in Asia/Bangkok', () => {
    for (const [name, meta] of scheduled()) {
      // Named per job so a failure says which decorator lost the option.
      expect(`${name}:${meta.timeZone ?? 'host default'}`).toBe(
        `${name}:Asia/Bangkok`,
      );
    }
  });
});
