import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import type { TrpcUser } from '../trpc/context';
import { SessionService } from '../auth/session.service';
import { AuditService, type AuditActor } from '../common/audit/audit.service';
import { CreditTierService } from '../common/credit/credit-tier.service';
import { StaffScopeService } from '../common/authority/staff-scope.service';
import { CronService } from '../cron/cron.service';
import { BusinessError } from '../common/errors/business-error';
import {
  generateTemporaryPassword,
  hashPassword,
} from '../common/crypto/password';
import {
  toAdminUserDetail,
  toAdminUserSummary,
  type AdminAccountRow,
} from '../common/mappers/admin-user.mapper';
import { activePenaltyWhere } from '../common/schemas/penalty.schema';
import { MAX_UPLOAD_BYTES } from '../common/schemas/image.schema';
import { allowedOrigins } from '../bootstrap';
import { BASE_CREDIT } from '../common/credit/recompute-credit';
import {
  toOrderBy,
  toPage,
  toSkipTake,
} from '../common/schemas/pagination.schema';
import {
  mapUserRole,
  tryMapUserRole,
  type UserRole,
} from '../common/schemas/status.schema';
import { UNAVAILABLE_USAGE_STATES } from '../common/usage/usage-states';
import { OK } from '../common/schemas/ok.schema';
import { workHours } from '../common/schemas/datetime.schema';
import { resourceName } from '../notification/notification.service';
import type {
  ChangeRoleInput,
  CreateUserInput,
  ListAuditInput,
  ListUsersInput,
  ResetPasswordInput,
  SetUserActiveInput,
  RunCronJobInput,
  UpdateLendingSettingsInput,
  UpdateUserInput,
  WorkHoursSetting,
} from './admin.schema';
import { workHoursSetting } from './admin.schema';

/**
 * Sort keys the client may send, mapped to real columns.
 *
 * A whitelist rather than passing `sort` through: the value comes from a query
 * string, and Prisma's orderBy takes column names, so forwarding it unchecked
 * turns a UI control into a way to probe the schema.
 */
/**
 * The account shape both admin reads return.
 *
 * listUsers and getUserById selected nearly the same 35 lines, differing only
 * in whether authorities and penalties are capped at one row. Keeping two
 * copies meant every new column had to be added twice - which is how IsActive
 * briefly went in three times, once with a duplicate key. Composed here so a
 * field is declared once.
 */
const ACCOUNT_SCALARS = {
  AccountKey: true,
  UserID: true,
  UserFName: true,
  UserLName: true,
  Email: true,
  UserCredit: true,
  IsActive: true,
  Role: { select: { RoleName: true } },
} satisfies Prisma.AccountInfoSelect;

/** Which management group an account holds authority in, and at what level. */
const AUTHORITY_SELECT = {
  ManageGroupKey: true,
  ManageGroup: {
    select: {
      GroupType: true,
      Branch: { select: { BranchName: true } },
      Club: { select: { ClubName: true } },
    },
  },
  AuthorityRole: {
    select: { AuthorityName: true, AuthorityLevel: true },
  },
} satisfies Prisma.AuthoritySelect;

/** Penalty fields the admin mappers read. */
const PENALTY_SELECT = {
  PenaltyKey: true,
  Reason: true,
  UsageKey: true,
  CreditDeducted: true,
  ActionTime: true,
  ExpirationTime: true,
  Appealed: true,
} satisfies Prisma.PenaltyInfoSelect;

/**
 * How far up the staff ladder each role sits.
 *
 * The ladder is auth.middleware.ts's, not a new idea: StaffMiddleware admits
 * staff/supervisor/admin and SupervisorMiddleware admits supervisor/admin, so
 * a higher rank can do everything a lower one can. Only the direction matters
 * here - a change that does not lower the rank cannot take cover away from a
 * department.
 */
const ROLE_RANK: Record<UserRole, number> = {
  borrower: 0,
  staff: 1,
  supervisor: 2,
  admin: 3,
};

/**
 * The cover levels a department can be left without, strongest first.
 *
 * Two, because those are the two gates that exist: supervisor-routed work (T2
 * approvals and T2 extensions, see common/approval/approval-policy.ts) needs a
 * supervisor, and everything else at the counter needs staff. `admin` is not a
 * level: an admin is unscoped, so losing one does not empty a group.
 */
const COVER_LEVELS = ['supervisor', 'staff'] as const;
type CoverLevel = (typeof COVER_LEVELS)[number];

const USER_SORT_COLUMNS = {
  id: 'AccountKey',
  studentId: 'UserID',
  firstName: 'UserFName',
  lastName: 'UserLName',
  email: 'Email',
  creditScore: 'UserCredit',
} as const;

/**
 * The daily/hourly jobs from "รายการเรียกใช้งานจาก Backend" group 3.
 *
 * A static registry, not a table: the list of jobs that are meant to exist is
 * a property of the code, not of the data, and the status page has to name a
 * job that has never run as well as the ones that have.
 *
 * `schedule` is the human-readable time shown to the administrator. The times
 * it states are Asia/Bangkok, which is what CronScheduler pins its @Cron
 * decorators to - if one moves, the other has to move with it.
 */
const CRON_REGISTRY = [
  { id: 'markOverdue', name: 'Mark overdue', schedule: '00:01 ทุกวัน' },
  { id: 'markLost', name: 'Mark lost', schedule: '00:15 ทุกวัน' },
  { id: 'expireDemerits', name: 'หมดอายุบทลงโทษ', schedule: '01:00 ทุกวัน' },
  {
    id: 'openT3InspectionRounds',
    name: 'สร้างรอบตรวจสถานที่ (T3)',
    schedule: '06:00 ทุกวัน',
  },
  {
    id: 'dueSoonReminder',
    name: 'เตือนใกล้ครบกำหนด',
    schedule: '08:00 ทุกวัน',
  },
  { id: 'expireStaleRequests', name: 'คำขอหมดอายุ', schedule: 'ทุกชั่วโมง' },
] as const;

/**
 * The jobs that do real work today. The other three need a table that does not
 * exist (see CronService for what each is missing).
 */
const IMPLEMENTED_JOBS: readonly string[] = [
  'markOverdue',
  'markLost',
  'expireDemerits',
  'dueSoonReminder',
  'expireStaleRequests',
  'openT3InspectionRounds',
];

/** Above this, the database is answering but not healthily. */
const DB_DEGRADED_MS = 250;

/**
 * Fallbacks matching the services that own these settings, so the reported
 * value equals the effective one when the variable is unset.
 * SessionService uses 12 hours; ImageService writes under ./media.
 */
const DEFAULT_SESSION_TTL_HOURS = 12;
const DEFAULT_MEDIA_ROOT = './media';

/**
 * The polling intervals the contract fixes (SRS). Reported, not enforced: the
 * client sets its own timers, so these are the agreed figures rather than a
 * setting this server applies.
 */
const POLLING_CONTRACT = {
  availabilitySeconds: 15,
  facilitySlotsSeconds: 15,
  requestStatusSeconds: 30,
  notificationsSeconds: 60,
  staffQueueSeconds: 30,
  supervisorQueueSeconds: 60,
} as const;

@Injectable()
export class AdminService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditTiers: CreditTierService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly staffScope: StaffScopeService,
    private readonly config: ConfigService,
    private readonly cron: CronService,
  ) {}

  /** Puts the saved working hours in force; the defaults stand until one is saved. */
  async onModuleInit() {
    // A setting that cannot be read leaves the defaults; it must not stop boot.
    const row = await this.prisma.systemSetting
      ?.findUnique({ where: { Key: 'workHours' } })
      .catch(() => null);
    const saved = workHoursSetting.safeParse(row?.Value);
    if (saved.success) Object.assign(workHours, saved.data);
  }

  async updateWorkHours(input: WorkHoursSetting, actor: AuditActor) {
    await this.prisma.systemSetting.upsert({
      where: { Key: 'workHours' },
      create: { Key: 'workHours', Value: input },
      update: { Value: input },
    });
    Object.assign(workHours, input);
    await this.audit.record(
      actor,
      'config',
      'setting/workHours',
      `Work hours set to ${input.start}:00-${input.end}:00`,
    );
    return this.getLendingSettings();
  }

  // =========================================================================
  // Accounts
  // =========================================================================

  /**
   * The same list, narrowed to the caller's own departments.
   *
   * Staff need to find a borrower to ban or look up, but SDS §7.3 scopes them
   * to the groups they hold an Authority in - `admin.listUsers` is unscoped
   * and admin-only for that reason. Without this, the ban screens sat behind a
   * list staff could not open: they could suspend an account they had no way
   * to search for.
   *
   * Scope is membership of the same ManagementGroup, which is the only link
   * between an account and a department the schema has.
   */
  async listUsersInScope(user: TrpcUser, input: ListUsersInput) {
    const groupKeys = await this.staffScope.resolveGroupKeys(user);
    return this.listUsers(
      input,
      // null means admin - unscoped, same as the admin-facing procedure.
      groupKeys === null
        ? undefined
        : { Authorities: { some: { ManageGroupKey: { in: groupKeys } } } },
    );
  }

  async listUsers(input: ListUsersInput, scope?: Prisma.AccountInfoWhereInput) {
    // Typed, not a loose object: Prisma's where-input is the one place a
    // typo silently becomes "match everything" rather than an error.
    const where: Prisma.AccountInfoWhereInput = { ...scope };

    if (input.role) {
      // RoleInfo is seed data with free-text names, so the set of keys behind
      // one of our four roles has to be resolved, not assumed.
      where.RoleKey = { in: await this.roleKeysFor(input.role) };
    }

    if (input.status) where.IsActive = input.status === 'active';

    if (input.q) {
      where.OR = [
        { Email: { contains: input.q, mode: 'insensitive' } },
        { UserID: { contains: input.q, mode: 'insensitive' } },
        { UserFName: { contains: input.q, mode: 'insensitive' } },
        { UserLName: { contains: input.q, mode: 'insensitive' } },
      ];
    }

    // One round trip for both halves - a separate count() can disagree with
    // the page it is supposed to describe if a row lands in between.
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.accountInfo.findMany({
        where,
        orderBy: toOrderBy(input, USER_SORT_COLUMNS, 'AccountKey'),
        ...toSkipTake(input),
        select: {
          ...ACCOUNT_SCALARS,
          Authorities: { take: 1, select: AUTHORITY_SELECT },
        },
      }),
      this.prisma.accountInfo.count({ where }),
    ]);

    return toPage(
      rows.map((row) => toAdminUserSummary(row)),
      total,
      input,
    );
  }

  async getUserById(accountKey: number) {
    const row = await this.findAccountDetail(accountKey);
    return toAdminUserDetail(
      row,
      await this.creditTiers.resolveBorrowLimits(row.UserCredit),
    );
  }

  // ponytail: last 100 loans, page it when someone has more worth reading.
  async getUserLoans(accountKey: number) {
    const rows = await this.prisma.usageLog.findMany({
      where: { AccountKey: accountKey },
      orderBy: { CheckoutTime: 'desc' },
      take: 100,
      select: {
        UsageKey: true,
        CurrentStatus: true,
        CheckoutTime: true,
        DueTime: true,
        CheckInTime: true,
        Resource: {
          select: {
            Item: { select: { Item: { select: { ItemName: true } } } },
            Room: { select: { RoomName: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      id: r.UsageKey,
      itemName: resourceName(r.Resource),
      status: r.CurrentStatus,
      checkoutTime: r.CheckoutTime.toISOString(),
      dueTime: r.DueTime.toISOString(),
      checkInTime: r.CheckInTime?.toISOString() ?? null,
    }));
  }

  async createUser(input: CreateUserInput, actor: AuditActor) {
    await this.assertIdentifiersFree(input.email, input.studentId, null);

    // A password the admin typed is theirs to communicate; a generated one is
    // returned once and never again, so it must be handed back to the caller.
    const generated = input.password ? null : generateTemporaryPassword();
    const password = input.password ?? generated!;

    const created = await this.prisma.accountInfo.create({
      data: {
        Email: input.email,
        HashedPassword: await hashPassword(password),
        UserID: input.studentId,
        UserFName: input.firstName,
        UserLName: input.lastName,
        // FR-CRD-01: everyone starts at 100 (no penalties yet).
        UserCredit: BASE_CREDIT,
        RoleKey: await this.roleKeyFor(input.role),
      },
      select: { AccountKey: true },
    });

    await this.audit.record(
      actor,
      'create',
      `account/${created.AccountKey}`,
      `Created ${input.email} as ${input.role}`,
    );

    return {
      user: await this.getUserById(created.AccountKey),
      temporaryPassword: generated,
    };
  }

  async updateUser(input: UpdateUserInput, actor: AuditActor) {
    await this.assertAccountExists(input.id);
    await this.assertIdentifiersFree(input.email, input.studentId, input.id);

    // Only the fields actually sent - Prisma treats an explicit `undefined` as
    // "leave alone", so a partial update needs no branching.
    await this.prisma.accountInfo.update({
      where: { AccountKey: input.id },
      data: {
        Email: input.email,
        UserID: input.studentId,
        UserFName: input.firstName,
        UserLName: input.lastName,
      },
      select: { AccountKey: true },
    });

    await this.audit.record(
      actor,
      'update',
      `account/${input.id}`,
      'Profile fields updated',
    );

    return this.getUserById(input.id);
  }

  /**
   * Move an account between roles, refusing the moves that strand a department.
   *
   * A role change writes one column and touches nothing else - in particular it
   * does not remove the account's Authority rows. So a demoted staff member
   * still reads as attached to their ManagementGroup while failing
   * StaffMiddleware on every procedure that group needs: nobody notices until
   * a borrower is standing at a counter that has no one behind it.
   *
   * Hence the check below. It is deliberately narrow - it refuses only the
   * moves that leave a group with no one at a level it used to have, not every
   * demotion - because a demotion where a colleague still covers the group is
   * ordinary administration and blocking it would make the screen useless.
   */
  async changeRole(input: ChangeRoleInput, actor: AuditActor) {
    // An admin demoting themselves locks everyone out of the admin pages if
    // they were the last one. Blocking self-demotion is cheaper than a
    // "count the remaining admins" rule and has no legitimate use case -
    // another admin can always do it.
    if (input.id === actor.accountKey && input.role !== 'admin') {
      throw new BusinessError('CANNOT_MODIFY_SELF', { action: 'changeRole' });
    }

    const current = await this.readAccountRole(input.id);
    await this.assertGroupsStayCovered(input.id, current, input.role);

    await this.prisma.accountInfo.update({
      where: { AccountKey: input.id },
      data: { RoleKey: await this.roleKeyFor(input.role) },
      select: { AccountKey: true },
    });

    await this.audit.record(
      actor,
      'role',
      `account/${input.id}`,
      `Role changed to ${input.role}`,
    );

    return this.getUserById(input.id);
  }

  async resetPassword(input: ResetPasswordInput, actor: AuditActor) {
    await this.assertAccountExists(input.id);

    const generated = input.newPassword ? null : generateTemporaryPassword();
    const password = input.newPassword ?? generated!;

    await this.prisma.accountInfo.update({
      where: { AccountKey: input.id },
      data: { HashedPassword: await hashPassword(password) },
      select: { AccountKey: true },
    });

    // A reset means the old password is no longer trusted, so anything signed
    // in with it must go too. Otherwise whoever prompted the reset keeps their
    // session and the reset achieves nothing.
    await this.sessions.revokeAllForAccount(input.id);

    await this.audit.record(
      actor,
      'update',
      `account/${input.id}`,
      generated
        ? 'Password reset, temporary password issued'
        : 'Password set by admin',
    );

    return { ...OK, temporaryPassword: generated };
  }

  /**
   * Enable or disable an account.
   *
   * Disabling revokes every live session as well as flipping the flag.
   * Without that the person stays signed in until their cookie lapses, which
   * is exactly the window you are trying to close when you disable someone.
   */
  async setUserActive(input: SetUserActiveInput, actor: AuditActor) {
    // Disabling yourself locks you out of the tool you would need to undo it.
    if (input.id === actor.accountKey && !input.active) {
      throw new BusinessError('CANNOT_MODIFY_SELF', {
        action: 'setUserActive',
      });
    }

    // Disabling is a demotion in everything but name: the account stops being
    // able to sign in, so it stops covering its departments. Modelled as a move
    // to borrower, which is the rank that covers nothing. Re-enabling only adds
    // cover, so it needs no check.
    if (!input.active) {
      const current = await this.readAccountRole(input.id);
      await this.assertGroupsStayCovered(
        input.id,
        current,
        'borrower',
        'disable',
      );
    } else {
      await this.assertAccountExists(input.id);
    }

    await this.prisma.accountInfo.update({
      where: { AccountKey: input.id },
      data: { IsActive: input.active },
    });

    if (!input.active) {
      await this.sessions.revokeAllForAccount(input.id);
    }

    await this.audit.record(
      actor,
      'update',
      `account/${input.id}`,
      input.active ? 'Account enabled' : 'Account disabled, sessions revoked',
    );

    return OK;
  }

  // =========================================================================
  // Lending settings
  // =========================================================================

  async getLendingSettings() {
    const [creditTiers, borrowRules] = await this.prisma.$transaction([
      this.prisma.creditTier.findMany({
        orderBy: { CreditMin: 'asc' },
        select: {
          CreditTierKey: true,
          CreditTierName: true,
          CreditMin: true,
          CreditMax: true,
        },
      }),
      this.prisma.borrowRule.findMany({
        orderBy: { BorrowRuleKey: 'asc' },
        select: {
          BorrowRuleKey: true,
          RuleName: true,
          BorrowConstraints: {
            select: {
              CreditTierKey: true,
              MinimumAuthorityLevel: true,
              MaxBorrowDate: true,
              MaxExtendTime: true,
              CreditTier: { select: { CreditTierName: true } },
            },
          },
          PenaltyRules: {
            select: {
              PenaltyReason: true,
              PenaltyAmount: true,
              PenaltyLength: true,
            },
          },
        },
      }),
    ]);

    return {
      workHours: { ...workHours },
      creditTiers: creditTiers.map((tier) => ({
        id: tier.CreditTierKey,
        name: tier.CreditTierName,
        min: tier.CreditMin,
        max: tier.CreditMax,
      })),
      borrowRules: borrowRules.map((rule) => ({
        id: rule.BorrowRuleKey,
        name: rule.RuleName,
        constraints: rule.BorrowConstraints.map((constraint) => ({
          creditTierKey: constraint.CreditTierKey,
          creditTierName: constraint.CreditTier.CreditTierName,
          minimumAuthorityLevel: constraint.MinimumAuthorityLevel,
          maxBorrowDays: constraint.MaxBorrowDate,
          maxExtendTimes: constraint.MaxExtendTime,
        })),
        penalties: rule.PenaltyRules.map((penalty) => ({
          reason: penalty.PenaltyReason,
          amount: penalty.PenaltyAmount,
          lengthDays: penalty.PenaltyLength,
        })),
      })),
    };
  }

  async updateLendingSettings(
    input: UpdateLendingSettingsInput,
    actor: AuditActor,
  ) {
    const rule = await this.prisma.borrowRule.findUnique({
      where: { BorrowRuleKey: input.borrowRuleKey },
      select: { BorrowRuleKey: true },
    });
    if (!rule) {
      throw new BusinessError('BORROW_RULE_NOT_FOUND', {
        id: input.borrowRuleKey,
      });
    }

    // Upserts, keyed on the @@unique pairs the schema already declares. All in
    // one transaction so a half-applied settings change is impossible.
    const writes = [
      ...(input.constraints ?? []).map((constraint) =>
        this.prisma.borrowConstraints.upsert({
          where: {
            BorrowRuleKey_CreditTierKey: {
              BorrowRuleKey: input.borrowRuleKey,
              CreditTierKey: constraint.creditTierKey,
            },
          },
          update: {
            MaxBorrowDate: constraint.maxBorrowDays,
            MaxExtendTime: constraint.maxExtendTimes,
            MinimumAuthorityLevel: constraint.minimumAuthorityLevel ?? null,
          },
          create: {
            BorrowRuleKey: input.borrowRuleKey,
            CreditTierKey: constraint.creditTierKey,
            MaxBorrowDate: constraint.maxBorrowDays,
            MaxExtendTime: constraint.maxExtendTimes,
            MinimumAuthorityLevel: constraint.minimumAuthorityLevel ?? null,
          },
          select: { ConstraintsKey: true },
        }),
      ),
      ...(input.penalties ?? []).map((penalty) =>
        this.prisma.penaltyRule.upsert({
          where: {
            BorrowRuleKey_PenaltyReason: {
              BorrowRuleKey: input.borrowRuleKey,
              PenaltyReason: penalty.reason,
            },
          },
          update: {
            PenaltyAmount: penalty.amount,
            PenaltyLength: penalty.lengthDays,
          },
          create: {
            BorrowRuleKey: input.borrowRuleKey,
            PenaltyReason: penalty.reason,
            PenaltyAmount: penalty.amount,
            PenaltyLength: penalty.lengthDays,
          },
          select: { PenaltyRuleKey: true },
        }),
      ),
    ];

    if (writes.length > 0) await this.prisma.$transaction(writes);

    await this.audit.record(
      actor,
      'config',
      `borrowRule/${input.borrowRuleKey}`,
      'Lending settings updated',
    );

    return this.getLendingSettings();
  }

  // =========================================================================
  // System status & cron
  // =========================================================================

  async getSystemStatus() {
    const startedAt = Date.now();
    let latencyMs: number | null = null;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      latencyMs = Date.now() - startedAt;
    } catch {
      // Deliberately swallowed: "the database is down" is this procedure's
      // answer, not its failure mode. The status page must still render.
      latencyMs = null;
    }

    const state =
      latencyMs === null
        ? 'down'
        : latencyMs > DB_DEGRADED_MS
          ? 'degraded'
          : 'operational';

    const counts =
      latencyMs === null
        ? { accounts: 0, resources: 0, activeLoans: 0, pendingReservations: 0 }
        : await this.countEntities();

    return {
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      database: {
        state: state,
        latencyMs,
      },
      counts,
    };
  }

  /**
   * The jobs, with what actually happened last time.
   *
   * `implemented` stays in the output even though every job in the registry
   * now runs: a job with no last run and a job that does not exist look
   * identical otherwise, and the flag is what tells an administrator which
   * they are looking at.
   */
  async listCronJobs() {
    const last = await this.cron.lastRuns();

    return CRON_REGISTRY.map((job) => {
      const run = last.get(job.id);
      return {
        id: job.id,
        name: job.name,
        schedule: job.schedule,
        implemented: IMPLEMENTED_JOBS.includes(job.id),
        lastRunAt: run ? run.at.toISOString() : null,
        lastResult: run
          ? (run.result as 'success' | 'failed' | 'pending')
          : null,
        durationMs: run?.durationMs ?? null,
      };
    });
  }

  /**
   * Runs one job now.
   *
   * Every job in the registry runs. Two that were listed here only as
   * NOT_IMPLEMENTED stubs are gone: availability is computed live by the
   * catalogue queries, and report.summary counts from UsageLog on demand, so
   * neither had anything to precompute.
   */
  async runCronJob(input: RunCronJobInput, actor: AuditActor) {
    const outcome = await this.cron.run(input.job);
    await this.audit.record(
      actor,
      'update',
      `cron/${input.job}`,
      `Ran manually: ${outcome.detail}`,
    );
    return OK;
  }

  // =========================================================================
  // Technical config
  // =========================================================================

  /**
   * What this server is actually running with, read from the live process.
   *
   * Read-only, and that is the point rather than a limitation. Every value
   * below comes from an environment variable or a compiled-in constant, so it
   * is per-instance and fixed for the lifetime of the process; there is no
   * SystemConfig table and adding one would be the wrong answer for most of
   * these. An SMTP host or a storage root changed in a web form would not take
   * effect until a redeploy, and a UI that accepts an edit which silently does
   * nothing is worse than one that refuses it.
   *
   * There is deliberately no `updateConfig` to pair with this. It existed as a
   * procedure that only ever threw, which is a worse answer than not offering
   * the verb at all: the page is a read-only record of what is deployed, which
   * is the question an administrator actually arrives with.
   */
  getConfig() {
    const env = (key: string) => this.config.get<string>(key);
    const isProduction = env('NODE_ENV') === 'production';
    const mediaRoot = env('MEDIA_ROOT') ?? DEFAULT_MEDIA_ROOT;

    return {
      auth: {
        // No OIDC integration exists yet; see docs/adr-001-authentication.md.
        googleOauthEnabled: false,
        localFallbackEnabled: true,
        // Not enforced by a list: `auth.login` accepts any account row, and
        // the KU-email path is a frontend affordance. Reported empty rather
        // than inventing a restriction the server does not apply.
        allowedEmailDomains: [],
        sessionTimeoutMinutes:
          Number(env('SESSION_TTL_HOURS') ?? DEFAULT_SESSION_TTL_HOURS) * 60,
      },
      storage: {
        provider: 'local-disk',
        bucket: mediaRoot,
        maxUploadMb: Math.round(MAX_UPLOAD_BYTES / (1024 * 1024)),
        presignedUploads: true,
      },
      email: {
        // Read from the same place the senders read it (common/mail/mailer.ts),
        // so this page cannot drift from what actually goes out. The defaults
        // point at the MailHog container in docker-compose.
        smtpHost: env('SMTP_HOST') ?? 'localhost',
        // MAIL_FROM is a header value ("ULMs <no-reply@ku.th>"); the page
        // reports the address, which is what the schema declares.
        fromAddress: mailAddress(env('MAIL_FROM') ?? 'ULMs <no-reply@ku.th>'),
        // Mail is sent for password resets and registration confirmations.
        // Due-soon reminders are not among them: dueSoonReminder writes in-app
        // notifications, so there is no email to enable or disable.
        dueReminderEnabled: false,
      },
      // The polling intervals the contract fixes (SRS §"ช่วงเวลา polling").
      // The server does not enforce them - the client sets its own timers - so
      // these are reported as the agreed figures, not as a live setting.
      polling: POLLING_CONTRACT,
      security: {
        cookieSecure: env('COOKIE_SECURE') === 'true' || isProduction,
        cookieSameSite: env('COOKIE_SAMESITE') ?? 'lax',
        allowedOrigins: allowedOrigins(),
        nodeEnv: env('NODE_ENV') ?? 'development',
      },
    };
  }

  // =========================================================================
  // Audit
  // =========================================================================

  listAudit(input: ListAuditInput) {
    return this.audit.list(input);
  }

  async getAuditById(input: { id: number }) {
    const event = await this.audit.getById(input.id);
    if (!event)
      throw new BusinessError('AUDIT_EVENT_NOT_FOUND', { id: input.id });
    return event;
  }

  // =========================================================================
  // Internals
  // =========================================================================

  private async countEntities() {
    const [accounts, resources, activeLoans, pendingReservations] =
      await this.prisma.$transaction([
        this.prisma.accountInfo.count(),
        this.prisma.resourceInfo.count(),
        this.prisma.usageLog.count({ where: { CurrentStatus: 'Lended' } }),
        this.prisma.reservations.count({ where: { ApproveStatus: 'Pending' } }),
      ]);

    return { accounts, resources, activeLoans, pendingReservations };
  }

  private async assertAccountExists(accountKey: number): Promise<void> {
    const found = await this.prisma.accountInfo.findUnique({
      where: { AccountKey: accountKey },
      select: { AccountKey: true },
    });
    if (!found) throw new BusinessError('USER_NOT_FOUND', { id: accountKey });
  }

  /** The account's role today. Doubles as the existence check. */
  private async readAccountRole(accountKey: number): Promise<UserRole> {
    const found = await this.prisma.accountInfo.findUnique({
      where: { AccountKey: accountKey },
      select: { Role: { select: { RoleName: true } } },
    });
    if (!found) throw new BusinessError('USER_NOT_FOUND', { id: accountKey });
    // mapUserRole, not tryMapUserRole: an account whose RoleName maps to
    // nothing cannot be listed either (the admin mapper throws on it), so
    // silently treating it as a borrower here would guess at the very fact the
    // guard is about to reason from.
    return mapUserRole(found.Role.RoleName);
  }

  /**
   * Refuses a role change that would leave one of the account's departments
   * with nobody at a level it currently has.
   *
   * Scope is the Authority table, the same link StaffScopeService uses: an
   * account covers exactly the ManagementGroups it holds an Authority row in.
   * Cover is counted from *other* holders of that group who are still enabled -
   * a disabled account cannot sign in, so it is not cover, and the demotion
   * being requested has not happened yet so this account cannot cover itself.
   *
   * Admins outside the group are not counted. They are unscoped and can indeed
   * act anywhere (StaffScopeService returns null for them), but that is the
   * lever for repairing a department that has lost its staff, not its day-to-day
   * cover; counting them would mean this guard never fires, since a system
   * without an admin cannot reach this procedure at all. An admin who *does*
   * hold an Authority row in the group is counted, because attaching themselves
   * to it is exactly the statement that they cover it.
   */
  private async assertGroupsStayCovered(
    accountKey: number,
    from: UserRole,
    to: UserRole,
    intent: 'role' | 'disable' = 'role',
  ): Promise<void> {
    // A promotion, or the same role again, can only add cover.
    if (ROLE_RANK[to] >= ROLE_RANK[from]) return;

    const held = await this.prisma.authority.findMany({
      where: { AccountKey: accountKey },
      select: {
        ManageGroupKey: true,
        ManageGroup: {
          select: {
            GroupType: true,
            Branch: { select: { BranchName: true } },
            Club: { select: { ClubName: true } },
          },
        },
      },
    });
    // No Authority row means no department depends on this account.
    if (held.length === 0) return;

    const peers = await this.prisma.authority.findMany({
      where: {
        ManageGroupKey: { in: held.map((row) => row.ManageGroupKey) },
        AccountKey: { not: accountKey },
        Account: { IsActive: true },
      },
      select: {
        ManageGroupKey: true,
        Account: { select: { Role: { select: { RoleName: true } } } },
      },
    });

    // The strongest role anyone else still brings to each group.
    const bestPeerRank = new Map<number, number>();
    for (const peer of peers) {
      // tryMapUserRole here, unlike readAccountRole: a hand-added RoleName is
      // not proof that somebody can cover the group, so it counts as nothing
      // rather than stopping the check.
      const role = tryMapUserRole(peer.Account.Role.RoleName);
      if (role === null) continue;
      const rank = ROLE_RANK[role];
      if (rank > (bestPeerRank.get(peer.ManageGroupKey) ?? -1)) {
        bestPeerRank.set(peer.ManageGroupKey, rank);
      }
    }

    const orphaned = held.flatMap((row) => {
      const peerRank = bestPeerRank.get(row.ManageGroupKey) ?? -1;
      // The strongest level this account covered that the move takes away and
      // nobody left in the group can supply.
      const losing = COVER_LEVELS.find(
        (level) =>
          ROLE_RANK[from] >= ROLE_RANK[level] &&
          ROLE_RANK[to] < ROLE_RANK[level] &&
          peerRank < ROLE_RANK[level],
      );
      return losing === undefined ? [] : [{ row, losing }];
    });

    if (orphaned.length === 0) return;

    const groups = await Promise.all(
      orphaned.map(async ({ row, losing }) => ({
        manageGroupKey: row.ManageGroupKey,
        groupName:
          row.ManageGroup.Branch?.BranchName ??
          row.ManageGroup.Club?.ClubName ??
          null,
        groupType: row.ManageGroup.GroupType,
        losing: losing satisfies CoverLevel,
        openWork: await this.countOpenWork(row.ManageGroupKey),
      })),
    );

    if (intent === 'disable') {
      throw new BusinessError('DISABLE_WOULD_ORPHAN_GROUP', {
        accountKey,
        from,
        groups,
      });
    }
    throw new BusinessError('ROLE_CHANGE_WOULD_ORPHAN_GROUP', {
      accountKey,
      from,
      to,
      groups,
    });
  }

  /**
   * What is actually sitting in a group right now, so the refusal names
   * consequences rather than only a rule.
   *
   * Every count is keyed on ResourceInfo.ManagedBy, the one column that says
   * which department owns a unit - the work items themselves record who did
   * something, never which group owns the job.
   */
  private async countOpenWork(manageGroupKey: number) {
    const owned = { Resource: { ManagedBy: manageGroupKey } };

    const [pendingRequests, pendingExtensions, openLoans, openRepairs] =
      await this.prisma.$transaction([
        this.prisma.reservations.count({
          where: { ApproveStatus: 'Pending', ...owned },
        }),
        this.prisma.extensionRequest.count({
          where: { ApproveStatus: 'Pending', Usage: owned },
        }),
        // Anything not yet graded: Prepared and Lended are still out, Returned
        // is back on the shelf but still waiting for an inspection.
        this.prisma.usageLog.count({
          where: { CurrentStatus: { in: UNAVAILABLE_USAGE_STATES }, ...owned },
        }),
        this.prisma.repairLog.count({
          where: { EndRepairDate: null, ...owned },
        }),
      ]);

    return { pendingRequests, pendingExtensions, openLoans, openRepairs };
  }

  /**
   * AccountInfo declares no unique constraint on Email or UserID, so duplicates
   * are checked here. This is a race, not a guarantee - two admins creating the
   * same email at once both pass. The real fix is a unique index; see
   * docs/auth-admin.md.
   */
  private async assertIdentifiersFree(
    email: string | undefined,
    studentId: string | undefined,
    exceptAccountKey: number | null,
  ): Promise<void> {
    const notSelf =
      exceptAccountKey === null
        ? {}
        : { NOT: { AccountKey: exceptAccountKey } };

    if (email) {
      const clash = await this.prisma.accountInfo.findFirst({
        where: { Email: { equals: email, mode: 'insensitive' }, ...notSelf },
        select: { AccountKey: true },
      });
      if (clash) throw new BusinessError('EMAIL_ALREADY_IN_USE', { email });
    }

    if (studentId) {
      const clash = await this.prisma.accountInfo.findFirst({
        where: { UserID: studentId, ...notSelf },
        select: { AccountKey: true },
      });
      if (clash)
        throw new BusinessError('USER_ID_ALREADY_IN_USE', { studentId });
    }
  }

  private async findAccountDetail(
    accountKey: number,
  ): Promise<AdminAccountRow> {
    const row = await this.prisma.accountInfo.findUnique({
      where: { AccountKey: accountKey },
      select: {
        ...ACCOUNT_SCALARS,
        // Detail shows every authority and every live penalty, not just one.
        Authorities: { select: AUTHORITY_SELECT },
        Penalties: {
          where: activePenaltyWhere(),
          orderBy: { ExpirationTime: 'desc' },
          select: PENALTY_SELECT,
        },
      },
    });

    if (!row) throw new BusinessError('USER_NOT_FOUND', { id: accountKey });
    return row;
  }

  /**
   * RoleInfo rows are seed data with free-text names, and mapUserRole already
   * owns the name-to-role mapping. Rather than hardcode the reverse ("staff"
   * means a row named exactly 'Staff'), read the table and run every name
   * through the same mapping. A hand-added row that maps to nothing is simply
   * skipped instead of breaking the query.
   *
   * The table has a handful of rows, so reading all of it is cheaper than
   * being clever.
   */
  private async roleKeysFor(role: UserRole): Promise<number[]> {
    const rows = await this.prisma.roleInfo.findMany({
      select: { RoleKey: true, RoleName: true },
    });

    return rows
      .filter((row) => tryMapUserRole(row.RoleName) === role)
      .map((row) => row.RoleKey);
  }

  private async roleKeyFor(role: UserRole): Promise<number> {
    const [key] = await this.roleKeysFor(role);
    if (key === undefined) {
      throw new BusinessError('ROLE_NOT_CONFIGURED', { role });
    }
    return key;
  }
}

/** The bare address from a From header value, or the value itself if it has no brackets. */
function mailAddress(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1].trim() ?? from.trim();
}
