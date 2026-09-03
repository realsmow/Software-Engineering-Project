import { z } from 'zod';
import { dbId } from '../common/schemas/id.schema';
import {
  paginated,
  paginationInput,
} from '../common/schemas/pagination.schema';
import { activePenalty } from '../common/schemas/penalty.schema';
import { creditTier, userRole } from '../common/schemas/status.schema';

/** Every admin procedure that addresses one account takes this. */
export const accountIdInput = z.object({ id: dbId });

/**
 * Account status.
 *
 * Three values, all provable from the database:
 *   disabled  - AccountInfo.IsActive is false. Cannot sign in at all.
 *   suspended - holds a PenaltyInfo row still InEffect and not yet expired.
 *               Can sign in, cannot borrow.
 *   active    - neither of the above.
 *
 * Checked in that order, because a disabled account that also has a penalty
 * is disabled first and foremost.
 *
 * The frontend's mock data also has `invited` (account created, password never
 * set). Nothing in AccountInfo records that, so it is not offered here rather
 * than being faked - see docs/auth-admin.md.
 */
export const accountStatus = z.enum(['active', 'suspended', 'disabled']);
export type AccountStatus = z.infer<typeof accountStatus>;

/** Mirrors the PenaltyReason enum in schema.prisma (ว-10: fixed strings, never keys). */
export const penaltyReason = z.enum([
  'DamagedItem',
  'BrokenItem',
  'LostItem',
  'DidntReturn',
  'ReturnLate',
]);

/**
 * The group an account holds authority in.
 *
 * Not called "department": the schema models this as ManagementGroup, which is
 * either a BranchInfo (ภาควิชา) or a ClubInfo (ชมรม). Flattening both into a
 * "departmentId" would lose the distinction the schema went out of its way to
 * keep.
 */
export const managementGroupRef = z.object({
  id: z.number().int(),
  name: z.string().nullable(),
  type: z.enum(['Club', 'Faculty']),
});

export const adminUserSummary = z.object({
  id: z.number().int(),
  /** AccountInfo.UserID - student ID or employee ID depending on the role */
  studentId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.email(),
  role: userRole,
  status: accountStatus,
  creditScore: z.number().int(),
  /** First group the account holds an Authority in; null for plain borrowers. */
  managementGroup: managementGroupRef.nullable(),
});

/** Re-exported: `credit.me` returns the same rows, so the shape lives in common. */
export { activePenalty };

export const authorityGrant = z.object({
  manageGroupKey: z.number().int(),
  groupName: z.string().nullable(),
  groupType: z.enum(['Club', 'Faculty']),
  authorityName: z.string(),
  authorityLevel: z.number().int().nullable(),
});

/** One account in full. Costs several joins, so it is the detail view only. */
export const adminUserDetail = adminUserSummary.extend({
  creditTier,
  maxBorrowDays: z.number().int().positive(),
  maxExtendTimes: z.number().int().min(0),
  authorities: z.array(authorityGrant),
  activePenalties: z.array(activePenalty),
});

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const listUsersInput = paginationInput.extend({
  role: userRole.optional(),
  status: accountStatus.optional(),
});
/** `q` matches email, user ID, first name or last name, case-insensitively. */
export const paginatedAdminUsers = paginated(adminUserSummary);

export const createUserInput = z.object({
  email: z.email(),
  studentId: z.string().trim().min(1).max(50),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  role: userRole,
  /** Omit to have the server generate one and return it once. */
  password: z.string().min(8).max(200).optional(),
  /**
   * Starting credit. Defaults to 100, which must fall inside some CreditTier's
   * CreditMin..CreditMax range or the account cannot be shown - the tiers are
   * seed data, so this default is a convention, not a rule in the schema.
   */
  initialCredit: z.number().int().min(0).default(100),
});

/**
 * The generated password is returned exactly once, at creation. It is not
 * stored anywhere in readable form, so there is no second chance to see it -
 * only `admin.resetPassword`, which issues a new one.
 */
export const createUserOutput = z.object({
  user: adminUserDetail,
  temporaryPassword: z.string().nullable(),
});

export const updateUserInput = accountIdInput.extend({
  email: z.email().optional(),
  studentId: z.string().trim().min(1).max(50).optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
});

export const changeRoleInput = accountIdInput.extend({ role: userRole });

export const resetPasswordInput = accountIdInput.extend({
  /** Omit to generate one. */
  newPassword: z.string().min(8).max(200).optional(),
});

export const resetPasswordOutput = z.object({
  ok: z.literal(true),
  temporaryPassword: z.string().nullable(),
});

/**
 * Borrowing ban.
 *
 * Recorded as a PenaltyInfo row rather than a flag on the account, because
 * that is the mechanism the schema already has for "this person may not borrow
 * until a date". Lifting a ban sets InEffect false on the rows currently in
 * force; it does not delete them, so the history survives.
 */
export const setUserBanInput = accountIdInput.extend({
  banned: z.boolean(),
  reason: z.string().trim().max(500).optional(),
  /** Ban length in days. Ignored when lifting. */
  days: z.number().int().positive().max(3650).default(30),
});

export const setUserActiveInput = accountIdInput.extend({
  active: z.boolean(),
});

// ---------------------------------------------------------------------------
// Lending settings (department staff - business config, not technical)
// ---------------------------------------------------------------------------

export const creditTierSetting = z.object({
  id: z.number().int(),
  name: z.string().nullable(),
  min: z.number().int(),
  max: z.number().int(),
});

export const borrowConstraintSetting = z.object({
  creditTierKey: z.number().int(),
  creditTierName: z.string().nullable(),
  minimumAuthorityLevel: z.number().int().nullable(),
  maxBorrowDays: z.number().int(),
  maxExtendTimes: z.number().int(),
});

export const penaltyRuleSetting = z.object({
  reason: penaltyReason,
  /** Credit points deducted */
  amount: z.number().int(),
  /** How long the penalty stays in effect, in days */
  lengthDays: z.number().int(),
});

export const borrowRuleSetting = z.object({
  id: z.number().int(),
  name: z.string().nullable(),
  constraints: z.array(borrowConstraintSetting),
  penalties: z.array(penaltyRuleSetting),
});

export const lendingSettingsOutput = z.object({
  creditTiers: z.array(creditTierSetting),
  borrowRules: z.array(borrowRuleSetting),
});

/**
 * Partial update of one borrow rule. Rows listed are upserted; rows left out
 * are untouched, so a client can send just the one line the user edited.
 */
/**
 * Ceilings on the lending rules.
 *
 * Every one of these was unbounded, which let a mistyped figure become policy
 * silently: a 999999999-day borrow window and a penalty larger than the whole
 * credit scale were both accepted and stored. These are not the real limits a
 * department would choose, they are the point past which the number is
 * certainly a typo rather than a decision.
 *
 * The audit-range input in this same file already caps at 3650 days, so a
 * decade is the established outer bound for a duration here.
 */
const MAX_BORROW_DAYS = 365;
const MAX_EXTEND_TIMES = 50;
/** Credit runs 0-100 (CreditTier.CreditMin/CreditMax), so a bigger deduction is meaningless. */
const MAX_PENALTY_AMOUNT = 100;
const MAX_PENALTY_DAYS = 3650;

export const updateLendingSettingsInput = z.object({
  borrowRuleKey: dbId,
  constraints: z
    .array(
      z.object({
        creditTierKey: dbId,
        maxBorrowDays: z.number().int().positive().max(MAX_BORROW_DAYS),
        maxExtendTimes: z.number().int().min(0).max(MAX_EXTEND_TIMES),
        minimumAuthorityLevel: z
          .number()
          .int()
          .min(0)
          .max(100)
          .nullable()
          .optional(),
      }),
    )
    .optional(),
  penalties: z
    .array(
      z.object({
        reason: penaltyReason,
        amount: z.number().int().min(0).max(MAX_PENALTY_AMOUNT),
        lengthDays: z.number().int().min(0).max(MAX_PENALTY_DAYS),
      }),
    )
    .optional(),
});

// ---------------------------------------------------------------------------
// System status & cron (IT admin)
// ---------------------------------------------------------------------------

export const serviceState = z.enum(['operational', 'degraded', 'down']);

export const systemStatusOutput = z.object({
  checkedAt: z.iso.datetime(),
  uptimeSeconds: z.number().int().min(0),
  nodeVersion: z.string(),
  database: z.object({
    state: serviceState,
    /** null when the check failed outright */
    latencyMs: z.number().int().nullable(),
  }),
  counts: z.object({
    accounts: z.number().int(),
    resources: z.number().int(),
    /** UsageLog rows currently in the Lended state */
    activeLoans: z.number().int(),
    /** Reservations still awaiting a decision */
    pendingReservations: z.number().int(),
  }),
});

/** The eight backend jobs listed in "รายการเรียกใช้งานจาก Backend" group 3. */
export const cronJobId = z.enum([
  'markOverdue',
  'markLost',
  'expireDemerits',
  'dueSoonReminder',
  'computeAvailability',
  'openT3InspectionRounds',
  'rollupDailyStats',
  'expireStaleRequests',
]);

export const cronJobOutput = z.object({
  id: cronJobId,
  name: z.string(),
  schedule: z.string(),
  /**
   * False while the job has no implementation. The status page should show
   * these as "ยังไม่เปิดใช้งาน" rather than as jobs that have never run -
   * the two look identical if this flag is missing.
   */
  implemented: z.boolean(),
  lastRunAt: z.iso.datetime().nullable(),
  lastResult: z.enum(['success', 'failed', 'pending']).nullable(),
  durationMs: z.number().int().nullable(),
});

export const runCronJobInput = z.object({ job: cronJobId });

// ---------------------------------------------------------------------------
// Technical config (IT admin)
// ---------------------------------------------------------------------------

export const technicalConfigOutput = z.object({
  auth: z.object({
    googleOauthEnabled: z.boolean(),
    localFallbackEnabled: z.boolean(),
    allowedEmailDomains: z.array(z.string()),
    sessionTimeoutMinutes: z.number().int().positive(),
  }),
  storage: z.object({
    provider: z.string(),
    bucket: z.string(),
    maxUploadMb: z.number().int().positive(),
    presignedUploads: z.boolean(),
  }),
  email: z.object({
    smtpHost: z.string(),
    fromAddress: z.email(),
    dueReminderEnabled: z.boolean(),
  }),
  polling: z.object({
    availabilitySeconds: z.number().int().positive(),
    facilitySlotsSeconds: z.number().int().positive(),
    requestStatusSeconds: z.number().int().positive(),
    notificationsSeconds: z.number().int().positive(),
    staffQueueSeconds: z.number().int().positive(),
    supervisorQueueSeconds: z.number().int().positive(),
  }),
});

/** Send only the groups being changed. */
export const updateTechnicalConfigInput = technicalConfigOutput.partial();

// ---------------------------------------------------------------------------
// Audit (IT admin)
// ---------------------------------------------------------------------------

export const auditAction = z.enum([
  'login',
  'create',
  'update',
  'delete',
  'role',
  'config',
]);

export const auditEventOutput = z.object({
  id: z.number().int(),
  at: z.iso.datetime(),
  actorId: z.number().int().nullable(),
  actorName: z.string(),
  actorRole: userRole,
  action: auditAction,
  /** What was acted on, as "domain/identifier" */
  target: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  detail: z.string(),
});

export const listAuditInput = paginationInput.extend({
  action: auditAction.optional(),
});
export const paginatedAuditEvents = paginated(auditEventOutput);
export const auditEventIdInput = z.object({ id: dbId });

// ---------------------------------------------------------------------------
// Inferred types, so services state their inputs without repeating the shapes
// ---------------------------------------------------------------------------

export type ListUsersInput = z.infer<typeof listUsersInput>;
export type CreateUserInput = z.infer<typeof createUserInput>;
export type UpdateUserInput = z.infer<typeof updateUserInput>;
export type ChangeRoleInput = z.infer<typeof changeRoleInput>;
export type ResetPasswordInput = z.infer<typeof resetPasswordInput>;
export type SetUserBanInput = z.infer<typeof setUserBanInput>;
export type SetUserActiveInput = z.infer<typeof setUserActiveInput>;
export type UpdateLendingSettingsInput = z.infer<
  typeof updateLendingSettingsInput
>;
export type ListAuditInput = z.infer<typeof listAuditInput>;
export type AuditAction = z.infer<typeof auditAction>;
export type AuditEvent = z.infer<typeof auditEventOutput>;
export type AdminUserSummary = z.infer<typeof adminUserSummary>;
export type AdminUserDetail = z.infer<typeof adminUserDetail>;
