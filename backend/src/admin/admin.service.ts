import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { SessionService } from '../auth/session.service';
import { AuditService, type AuditActor } from '../common/audit/audit.service';
import { CreditTierService } from '../common/credit/credit-tier.service';
import { BusinessError, notImplemented } from '../common/errors/business-error';
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
import {
  toOrderBy,
  toPage,
  toSkipTake,
} from '../common/schemas/pagination.schema';
import { tryMapUserRole, type UserRole } from '../common/schemas/status.schema';
import { OK } from '../common/schemas/ok.schema';
import type {
  ChangeRoleInput,
  CreateUserInput,
  ListAuditInput,
  ListUsersInput,
  ResetPasswordInput,
  SetUserActiveInput,
  SetUserBanInput,
  UpdateLendingSettingsInput,
  UpdateUserInput,
} from './admin.schema';

/**
 * Sort keys the client may send, mapped to real columns.
 *
 * A whitelist rather than passing `sort` through: the value comes from a query
 * string, and Prisma's orderBy takes column names, so forwarding it unchecked
 * turns a UI control into a way to probe the schema.
 */
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
 * A static registry, not a table: nothing schedules these yet, and the status
 * page still needs to show which jobs are meant to exist. `implemented: false`
 * on every row is the honest answer until a scheduler lands.
 */
const CRON_REGISTRY = [
  { id: 'markOverdue', name: 'Mark overdue', schedule: '00:01 ทุกวัน' },
  { id: 'markLost', name: 'Mark lost', schedule: '00:15 ทุกวัน' },
  { id: 'expireDemerits', name: 'หมดอายุบทลงโทษ', schedule: '01:00 ทุกวัน' },
  {
    id: 'computeAvailability',
    name: 'คำนวณวันที่พร้อมให้ยืม',
    schedule: '02:00 ทุกวัน',
  },
  { id: 'rollupDailyStats', name: 'สรุปสถิติรายวัน', schedule: '03:00 ทุกวัน' },
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

/** Above this, the database is answering but not healthily. */
const DB_DEGRADED_MS = 250;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditTiers: CreditTierService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  // =========================================================================
  // Accounts
  // =========================================================================

  async listUsers(input: ListUsersInput) {
    // Typed, not a loose object: Prisma's where-input is the one place a
    // typo silently becomes "match everything" rather than an error.
    const where: Prisma.AccountInfoWhereInput = {};

    if (input.role) {
      // RoleInfo is seed data with free-text names, so the set of keys behind
      // one of our four roles has to be resolved, not assumed.
      where.RoleKey = { in: await this.roleKeysFor(input.role) };
    }

    if (input.status) {
      const active = activePenaltyWhere();
      where.Penalties =
        input.status === 'suspended' ? { some: active } : { none: active };
    }

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
          AccountKey: true,
          UserID: true,
          UserFName: true,
          UserLName: true,
          Email: true,
          UserCredit: true,
          IsActive: true,
          Role: { select: { RoleName: true } },
          Authorities: {
            take: 1,
            select: {
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
            },
          },
          Penalties: {
            // Existence is all the summary needs - one row answers "suspended?".
            where: activePenaltyWhere(),
            take: 1,
            select: {
              PenaltyKey: true,
              Reason: true,
              CreditDeducted: true,
              ActionTime: true,
              ExpirationTime: true,
              Appealed: true,
            },
          },
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
        UserCredit: input.initialCredit,
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

  async changeRole(input: ChangeRoleInput, actor: AuditActor) {
    // An admin demoting themselves locks everyone out of the admin pages if
    // they were the last one. Blocking self-demotion is cheaper than a
    // "count the remaining admins" rule and has no legitimate use case -
    // another admin can always do it.
    if (input.id === actor.accountKey && input.role !== 'admin') {
      throw new BusinessError('CANNOT_MODIFY_SELF', { action: 'changeRole' });
    }

    await this.assertAccountExists(input.id);

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

  async setUserBan(input: SetUserBanInput, actor: AuditActor) {
    if (input.id === actor.accountKey) {
      throw new BusinessError('CANNOT_MODIFY_SELF', { action: 'setUserBan' });
    }

    await this.assertAccountExists(input.id);

    if (!input.banned) {
      // Lift, don't delete: the row is the record that the ban happened.
      await this.prisma.penaltyInfo.updateMany({
        where: { AccountKey: input.id, ...activePenaltyWhere() },
        data: { InEffect: false },
      });

      await this.audit.record(
        actor,
        'update',
        `account/${input.id}`,
        'Borrowing ban lifted',
      );
      return OK;
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + input.days * 24 * 60 * 60 * 1000,
    );

    await this.prisma.penaltyInfo.create({
      data: {
        AccountKey: input.id,
        // No UsageKey: this penalty comes from an admin decision, not from a
        // specific loan going wrong.
        Reason: input.reason ?? 'ระงับสิทธิ์การยืมโดยผู้ดูแลระบบ',
        CreditDeducted: null,
        ActionTime: now,
        ExpirationTime: expiresAt,
        Appealed: false,
        InEffect: true,
      },
      select: { PenaltyKey: true },
    });

    await this.audit.record(
      actor,
      'update',
      `account/${input.id}`,
      `Borrowing banned for ${input.days} days${input.reason ? `: ${input.reason}` : ''}`,
    );

    return OK;
  }

  /**
   * Enable or disable an account.
   *
   * Disabling revokes every live session as well as flipping the flag.
   * Without that the person stays signed in until their cookie lapses, which
   * is exactly the window you are trying to close when you disable someone.
   *
   * Not the same as a borrowing ban: setUserBan stops them borrowing but
   * leaves them able to sign in and see their own history.
   */
  async setUserActive(input: SetUserActiveInput, actor: AuditActor) {
    // Disabling yourself locks you out of the tool you would need to undo it.
    if (input.id === actor.accountKey && !input.active) {
      throw new BusinessError('CANNOT_MODIFY_SELF', {
        action: 'setUserActive',
      });
    }

    await this.assertAccountExists(input.id);

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

  listCronJobs() {
    return CRON_REGISTRY.map((job) => ({
      id: job.id,
      name: job.name,
      schedule: job.schedule,
      // Nothing schedules these yet. Reporting `implemented: false` instead of
      // a null last-run keeps "not built" distinguishable from "built but
      // never fired", which the status page has to show differently.
      implemented: false,
      lastRunAt: null,
      lastResult: null,
      durationMs: null,
    }));
  }

  runCronJob(): never {
    return notImplemented(
      [
        'CronRunLog table (job, startedAt, finishedAt, result, detail)',
        '@nestjs/schedule',
      ],
      'None of the 8 jobs exist yet, and a manual run with nowhere to record the outcome is not observable. Build the jobs first.',
    );
  }

  // =========================================================================
  // Technical config
  // =========================================================================

  getConfig(): never {
    return notImplemented(
      ['SystemConfig table (key, value Json, updatedBy, updatedAt)'],
      'Auth/storage/email/polling settings are currently environment variables, which are read-only at runtime and per-instance. Editing them from the UI needs a table.',
    );
  }

  updateConfig(): never {
    return this.getConfig();
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
        AccountKey: true,
        UserID: true,
        UserFName: true,
        UserLName: true,
        Email: true,
        UserCredit: true,
        IsActive: true,
        Role: { select: { RoleName: true } },
        Authorities: {
          select: {
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
          },
        },
        Penalties: {
          where: activePenaltyWhere(),
          orderBy: { ExpirationTime: 'desc' },
          select: {
            PenaltyKey: true,
            Reason: true,
            CreditDeducted: true,
            ActionTime: true,
            ExpirationTime: true,
            Appealed: true,
          },
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
