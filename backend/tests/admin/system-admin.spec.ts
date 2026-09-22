import { AdminService } from '../../src/admin/admin.service';
import {
  auditEventIdInput,
  auditEventOutput,
  cronJobOutput,
  listAuditInput,
  runCronJobInput,
  systemStatusOutput,
  technicalConfigOutput,
} from '../../src/admin/admin.schema';
import { BusinessError } from '../../src/common/errors/business-error';

const ACTOR = {
  id: 7,
  accountKey: 7,
  role: 'Admin' as const,
  name: 'System admin',
};

function serviceWith(overrides: Record<string, unknown> = {}) {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
    accountInfo: { count: jest.fn().mockResolvedValue(12) },
    resourceInfo: { count: jest.fn().mockResolvedValue(8) },
    usageLog: { count: jest.fn().mockResolvedValue(3) },
    reservations: { count: jest.fn().mockResolvedValue(2) },
  };
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
    list: jest.fn(),
    getById: jest.fn(),
  };
  const cron = {
    lastRuns: jest.fn().mockResolvedValue(new Map()),
    run: jest.fn().mockResolvedValue({ ok: true }),
  };
  const config = { get: jest.fn() };

  const service = new AdminService(
    prisma as never,
    {} as never,
    {} as never,
    audit as never,
    {} as never,
    config as never,
    cron as never,
  );

  return { service, prisma, audit, cron, config, ...overrides };
}

describe('IT admin system status, cron, config, and audit procedures', () => {
  it('returns an operational status with entity counts and validates its output', async () => {
    const { service, prisma } = serviceWith();

    const status = await service.getSystemStatus();

    expect(status.database.state).toBe('operational');
    expect(status.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(status.counts).toEqual({
      accounts: 12,
      resources: 8,
      activeLoans: 3,
      pendingReservations: 2,
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(systemStatusOutput.parse(status)).toEqual(status);
  });

  it('marks a slow database as degraded', async () => {
    const { service } = serviceWith();
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_260);

    try {
      const status = await service.getSystemStatus();
      expect(status.database).toEqual({ state: 'degraded', latencyMs: 260 });
    } finally {
      now.mockRestore();
    }
  });

  it('marks the database down and does not report stale entity counts', async () => {
    const { service, prisma } = serviceWith();
    prisma.$queryRaw.mockRejectedValue(new Error('database unavailable'));

    const status = await service.getSystemStatus();

    expect(status.database).toEqual({ state: 'down', latencyMs: null });
    expect(status.counts).toEqual({
      accounts: 0,
      resources: 0,
      activeLoans: 0,
      pendingReservations: 0,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lists all eight cron jobs and distinguishes implemented jobs', async () => {
    const { service, cron } = serviceWith();
    const lastRunAt = new Date('2026-09-20T02:00:00.000Z');
    cron.lastRuns.mockResolvedValue(
      new Map([
        ['markOverdue', { at: lastRunAt, result: 'success', durationMs: 41 }],
      ]),
    );

    const jobs = await service.listCronJobs();

    expect(jobs).toHaveLength(8);
    expect(jobs.filter((job) => job.implemented)).toHaveLength(5);
    expect(jobs.filter((job) => !job.implemented)).toHaveLength(3);
    expect(jobs.find((job) => job.id === 'markOverdue')).toMatchObject({
      lastRunAt: lastRunAt.toISOString(),
      lastResult: 'success',
      durationMs: 41,
    });
    expect(cron.lastRuns).toHaveBeenCalledTimes(1);
    jobs.forEach((job) => cronJobOutput.parse(job));
  });

  it('runs an implemented cron job and records the audit event', async () => {
    const { service, cron, audit } = serviceWith();

    await expect(
      service.runCronJob(runCronJobInput.parse({ job: 'markOverdue' }), ACTOR),
    ).resolves.toEqual({ ok: true });

    expect(cron.run).toHaveBeenCalledWith('markOverdue');
    expect(audit.record).toHaveBeenCalledWith(
      ACTOR,
      'update',
      'cron/markOverdue',
      expect.stringContaining('Ran manually'),
    );
  });

  it('preserves the typed NOT_IMPLEMENTED error for an unavailable cron job', async () => {
    const { service, cron, audit } = serviceWith();
    const error = new BusinessError('NOT_IMPLEMENTED', {
      missing: ['DailyStats table'],
      note: 'The job is not available yet.',
    });
    cron.run.mockRejectedValue(error);

    await expect(
      service.runCronJob(
        runCronJobInput.parse({ job: 'rollupDailyStats' }),
        ACTOR,
      ),
    ).rejects.toBe(error);
    expect(audit.record).not.toHaveBeenCalled();
    expect(() => runCronJobInput.parse({ job: 'unknownJob' })).toThrow();
  });

  it('returns read-only technical configuration that conforms to its schema', () => {
    const { service, config } = serviceWith();
    const values: Record<string, string | undefined> = {
      NODE_ENV: 'production',
      COOKIE_SECURE: 'false',
      COOKIE_SAMESITE: 'strict',
      SESSION_TTL_HOURS: '8',
      MEDIA_ROOT: '/srv/media',
    };
    config.get.mockImplementation((key: string) => values[key]);

    const technicalConfig = service.getConfig();

    expect(technicalConfig.auth.sessionTimeoutMinutes).toBe(480);
    expect(technicalConfig.storage.provider).toBe('local-disk');
    expect(technicalConfig.storage.bucket).toBe('/srv/media');
    expect(technicalConfig.security).toMatchObject({
      cookieSecure: true,
      cookieSameSite: 'strict',
      nodeEnv: 'production',
    });
    expect(technicalConfigOutput.parse(technicalConfig)).toEqual(
      technicalConfig,
    );
  });

  /**
   * There is no setter, and that is the design rather than a gap.
   *
   * Every value getConfig reports comes from an environment variable or a
   * compiled-in constant, fixed for the life of the process, so a setter could
   * only ever accept an edit that changed nothing until a redeploy. This used
   * to be a procedure that threw NOT_IMPLEMENTED; it is now absent, and this
   * asserts it stays absent rather than coming back as a no-op.
   */
  it('exposes no way to write the technical configuration', () => {
    const { service } = serviceWith();

    expect('updateConfig' in service).toBe(false);
    expect(
      Object.getOwnPropertyNames(Object.getPrototypeOf(service)).filter((name) =>
        /^(update|set|save|write).*Config$/i.test(name),
      ),
    ).toEqual([]);
  });

  it('rejects malformed admin inputs at the schema boundary', () => {
    const { service } = serviceWith();
    const config = service.getConfig();
    config.auth.sessionTimeoutMinutes = 0;

    expect(runCronJobInput.safeParse({ job: 'not-a-job' }).success).toBe(false);
    expect(auditEventIdInput.safeParse({ id: 0 }).success).toBe(false);
    expect(technicalConfigOutput.safeParse(config).success).toBe(false);
    expect(
      technicalConfigOutput.safeParse({
        ...config,
        email: { ...config.email, fromAddress: 'invalid' },
      }).success,
    ).toBe(false);
  });

  it('delegates audit listing and returns an audit event by id', async () => {
    const { service, audit } = serviceWith();
    const input = listAuditInput.parse({
      page: 1,
      pageSize: 10,
      action: 'config',
    });
    const result = { items: [], page: 1, pageSize: 10, total: 0 };
    audit.list.mockResolvedValue(result);
    const event = auditEventOutput.parse({
      id: 10,
      at: '2026-09-20T02:00:00.000Z',
      actorId: 7,
      actorName: 'System admin',
      actorRole: 'admin',
      action: 'config',
      target: 'system/config',
      ip: null,
      userAgent: null,
      detail: 'Viewed technical configuration',
    });
    audit.getById.mockResolvedValue(event);

    await expect(service.listAudit(input)).resolves.toBe(result);
    await expect(service.getAuditById({ id: 10 })).resolves.toBe(event);
    expect(audit.list).toHaveBeenCalledWith(input);
    expect(audit.getById).toHaveBeenCalledWith(10);
  });

  it('returns a typed error when an audit event is missing', async () => {
    const { service, audit } = serviceWith();
    audit.getById.mockResolvedValue(null);

    await expect(service.getAuditById({ id: 999 })).rejects.toMatchObject({
      businessCode: 'AUDIT_EVENT_NOT_FOUND',
      details: { id: 999 },
    });
  });
});
