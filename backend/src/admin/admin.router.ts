import { z } from 'zod';
import {
  Ctx,
  Input,
  Mutation,
  Query,
  Router,
  UseMiddlewares,
} from 'nestjs-trpc';
import { AdminMiddleware, StaffMiddleware } from '../trpc/auth.middleware';
import type { TrpcContext } from '../trpc/context';
import { okOutput } from '../common/schemas/ok.schema';
import {
  accountIdInput,
  adminUserDetail,
  auditEventIdInput,
  auditEventOutput,
  changeRoleInput,
  createUserInput,
  createUserOutput,
  cronJobOutput,
  lendingSettingsOutput,
  listAuditInput,
  listUsersInput,
  paginatedAdminUsers,
  paginatedAuditEvents,
  resetPasswordInput,
  resetPasswordOutput,
  runCronJobInput,
  setUserActiveInput,
  setUserBanInput,
  systemStatusOutput,
  technicalConfigOutput,
  updateLendingSettingsInput,
  updateTechnicalConfigInput,
  updateUserInput,
  type ChangeRoleInput,
  type CreateUserInput,
  type ListAuditInput,
  type ListUsersInput,
  type ResetPasswordInput,
  type SetUserActiveInput,
  type SetUserBanInput,
  type UpdateLendingSettingsInput,
  type UpdateUserInput,
} from './admin.schema';
import { AdminService } from './admin.service';

/**
 * The management domain (ว-05: grouped by domain, gated by middleware).
 *
 * Two jurisdictions share this router:
 *   - IT admin owns accounts, technical config, system status and audit
 *   - department staff own lending rules and borrowing bans
 *
 * NOTE ON SCOPING: the contract says a staff member acts only within their own
 * department. That cannot be enforced yet - AccountInfo has no faculty/branch
 * relation, so ctx.user.facultyKey is always null. Until it exists, the
 * staff-level procedures below are department-wide in name only. Listed as a
 * gap in docs/auth-admin.md; do not treat it as done.
 */
@Router({ alias: 'admin' })
export class AdminRouter {
  constructor(private readonly adminService: AdminService) {}

  // ── Accounts ────────────────────────────────────────────────────────────
  // Admin-only for now. The contract intends staff to see their own
  // department's users too, but without scoping that would mean every staff
  // member sees every account - so it stays closed until scoping lands.

  /** `q` matches email, user ID, first name or last name. */
  @UseMiddlewares(AdminMiddleware)
  @Query({ input: listUsersInput, output: paginatedAdminUsers })
  listUsers(@Input() input: ListUsersInput) {
    return this.adminService.listUsers(input);
  }

  @UseMiddlewares(AdminMiddleware)
  @Query({ input: accountIdInput, output: adminUserDetail })
  getUserById(@Input() input: { id: number }) {
    return this.adminService.getUserById(input.id);
  }

  /** Returns the generated password once, when the caller did not supply one. */
  @UseMiddlewares(AdminMiddleware)
  @Mutation({ input: createUserInput, output: createUserOutput })
  createUser(@Input() input: CreateUserInput) {
    return this.adminService.createUser(input);
  }

  @UseMiddlewares(AdminMiddleware)
  @Mutation({ input: updateUserInput, output: adminUserDetail })
  updateUser(@Input() input: UpdateUserInput) {
    return this.adminService.updateUser(input);
  }

  @UseMiddlewares(AdminMiddleware)
  @Mutation({ input: changeRoleInput, output: adminUserDetail })
  changeRole(@Input() input: ChangeRoleInput, @Ctx() ctx: TrpcContext) {
    // The actor is needed to refuse self-demotion, which is why this one
    // takes ctx rather than just the input.
    return this.adminService.changeRole(input, ctx.user!.accountKey);
  }

  @UseMiddlewares(AdminMiddleware)
  @Mutation({ input: resetPasswordInput, output: resetPasswordOutput })
  resetPassword(@Input() input: ResetPasswordInput) {
    return this.adminService.resetPassword(input);
  }

  /** Not implemented - AccountInfo has no enabled/disabled column. */
  @UseMiddlewares(AdminMiddleware)
  @Mutation({ input: setUserActiveInput, output: okOutput })
  setUserActive(@Input() input: SetUserActiveInput) {
    return this.adminService.setUserActive(input);
  }

  // ── Borrowing ban (department staff) ────────────────────────────────────

  /** Recorded as a PenaltyInfo row, so the ban and its history share one table. */
  @UseMiddlewares(StaffMiddleware)
  @Mutation({ input: setUserBanInput, output: okOutput })
  setUserBan(@Input() input: SetUserBanInput, @Ctx() ctx: TrpcContext) {
    return this.adminService.setUserBan(input, ctx.user!.accountKey);
  }

  // ── Lending rules (department staff) ────────────────────────────────────

  @UseMiddlewares(StaffMiddleware)
  @Query({ output: lendingSettingsOutput })
  getLendingSettings() {
    return this.adminService.getLendingSettings();
  }

  /** Rows listed are upserted; anything omitted is left alone. */
  @UseMiddlewares(StaffMiddleware)
  @Mutation({
    input: updateLendingSettingsInput,
    output: lendingSettingsOutput,
  })
  updateLendingSettings(@Input() input: UpdateLendingSettingsInput) {
    return this.adminService.updateLendingSettings(input);
  }

  // ── Technical config (IT admin) ─────────────────────────────────────────

  /** Not implemented - needs a SystemConfig table; today these are env vars. */
  @UseMiddlewares(AdminMiddleware)
  @Query({ output: technicalConfigOutput })
  getConfig() {
    return this.adminService.getConfig();
  }

  /** Not implemented - see getConfig. */
  @UseMiddlewares(AdminMiddleware)
  @Mutation({ input: updateTechnicalConfigInput, output: okOutput })
  updateConfig() {
    return this.adminService.updateConfig();
  }

  // ── System status & cron (IT admin) ─────────────────────────────────────

  /** Polled by the status page. Answers even when the database is unreachable. */
  @UseMiddlewares(AdminMiddleware)
  @Query({ output: systemStatusOutput })
  getSystemStatus() {
    return this.adminService.getSystemStatus();
  }

  /** The 8 planned jobs. All report `implemented: false` until a scheduler exists. */
  @UseMiddlewares(AdminMiddleware)
  @Query({ output: z.array(cronJobOutput) })
  listCronJobs() {
    return this.adminService.listCronJobs();
  }

  /** Not implemented - there are no jobs to run yet. */
  @UseMiddlewares(AdminMiddleware)
  @Mutation({ input: runCronJobInput, output: okOutput })
  runCronJob() {
    return this.adminService.runCronJob();
  }

  // ── Audit (IT admin) ────────────────────────────────────────────────────

  /** Not implemented - needs an AuditLog table. */
  @UseMiddlewares(AdminMiddleware)
  @Query({ input: listAuditInput, output: paginatedAuditEvents })
  listAudit(@Input() input: ListAuditInput) {
    return this.adminService.listAudit(input);
  }

  /** Not implemented - see listAudit. */
  @UseMiddlewares(AdminMiddleware)
  @Query({ input: auditEventIdInput, output: auditEventOutput })
  getAuditById() {
    return this.adminService.getAuditById();
  }
}
