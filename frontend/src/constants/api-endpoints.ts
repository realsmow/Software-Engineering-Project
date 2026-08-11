/**
 * ULMs — tRPC API endpoint catalogue (frontend → backend contract)
 * ===================================================================
 *
 * Every tRPC procedure the ULMs frontend needs to call, as agreed in the
 * tRPC contract meeting (trpc-meeting.pdf).
 *
 *  - Grouping is by DOMAIN, not by role (ว-05). Auth/jurisdiction is enforced
 *    by backend middleware — the same `loan.list` serves a borrower (their own
 *    loans) and a staff member (their department queue), scoped by ctx.user.
 *  - Standard verbs (ว-05): list · getById · create · update · cancel · decide
 *    · confirm. Feature-specific verbs are added only where a standard verb does
 *    not fit (e.g. loan.confirmPickup, notification.markAllRead).
 *    Forbidden names: getAll, fetchList, findMany.
 *  - Domains (ว-05): auth, item, loan, reservation, approval, appeal, credit,
 *    inspection, notification, report, admin.
 *  - List procedures take the shared page input `{ page, pageSize, sort, q }`
 *    and return `{ items, total, page, pageSize }` (ว-07; pageSize default 20,
 *    max 100).
 *  - ctx.user carries `{ accountKey, role, facultyKey, creditScore }` (ว-03).
 *  - Business errors map to tRPC codes (ว-06) — noted per procedure below.
 *
 * Usage:
 *   trpc[splitDomain(API.loan.create)] ...  // with a real client,
 *   trpc.loan.create.useMutation()          // the names below are the paths.
 */

export const API = {
  // ── auth ──────────────────────────────────────────────────────────────
  // Session & identity. Google OAuth (@ku.ac.th, @ku.th) + local-account
  // fallback for staff without a KU email.
  auth: {
    /** Current user: profile + role + faculty + creditScore (ctx.user). Called once on shell load. */
    me: "auth.me",
    /** Local-account sign-in (username + password). Errors: UNAUTHORIZED. */
    login: "auth.login",
    /** End the session. */
    logout: "auth.logout",
  },

  // ── item ──────────────────────────────────────────────────────────────
  // Equipment catalogue (types + units) and staff inventory management.
  item: {
    /** Catalogue: search + filter + paginate equipment types. Page: Catalog. */
    list: "item.list",
    /** One equipment type with tier, units, prep days, next-available. Page: Equipment detail. */
    getById: "item.getById",
    /** Live remaining count + next-available for a type. POLLED — POLLING.AVAILABILITY (15s). */
    getAvailability: "item.getAvailability",
    /** Long-cached master data: categories + tiers (staleTime 1h). */
    listCategories: "item.listCategories",
    /** Units of a type (serials, status) — staff prepare / inventory. */
    listUnits: "item.listUnits",
    /** Create a new equipment type. Staff inventory. */
    create: "item.create",
    /** Edit an equipment type. Staff inventory. */
    update: "item.update",
    /** Set a unit status (available/maintenance/lost). Staff inventory. Error: ITEM_UNAVAILABLE→CONFLICT. */
    updateUnitStatus: "item.updateUnitStatus",
  },

  // ── loan ──────────────────────────────────────────────────────────────
  // Loan-request lifecycle + active loans + history. Serves borrower (own),
  // staff (department queue) via middleware scoping.
  loan: {
    /**
     * List requests/loans, filter by status. POLLED for pending borrower
     * requests (POLLING.REQUEST_STATUS 30s) and the staff queue
     * (POLLING.STAFF_QUEUE 30s). Pages: My requests, Loan history, Staff queue.
     */
    list: "loan.list",
    /** One loan/request: items, pickup photo, online-renew remaining. */
    getById: "loan.getById",
    /**
     * Submit a loan request (submitLoanRequestSchema). Page: Catalog / cart.
     * Errors: NOT_ELIGIBLE→FORBIDDEN, ITEM_UNAVAILABLE→CONFLICT,
     * LOAN_PERIOD_EXCEEDS_LIMIT→BAD_REQUEST.
     */
    create: "loan.create",
    /** Cancel a pending request. Page: My requests. */
    cancel: "loan.cancel",
    /** Staff: allocate/select specific units for an approved request. Staff queue. */
    allocate: "loan.allocate",
    /** Confirm pickup + upload receipt photo. Staff handover. */
    confirmPickup: "loan.confirmPickup",
    /** Record a return + upload return photo. Staff handover. Kicks off inspection. */
    return: "loan.return",
    /**
     * Request an online extension/renewal. Page: My requests.
     * Error: EXTENSION_QUOTA_EXCEEDED→FORBIDDEN.
     */
    requestExtension: "loan.requestExtension",
  },

  // ── reservation ───────────────────────────────────────────────────────
  // T3 facility/room slot booking (real-time, first-come).
  reservation: {
    /** My reservations. Page: My requests. */
    list: "reservation.list",
    /** Free/taken time slots for a room. POLLED — POLLING.FACILITY_SLOTS (15s). */
    getSlots: "reservation.getSlots",
    /** Book a slot. Error: SLOT_TAKEN→CONFLICT. */
    create: "reservation.create",
    /** Cancel a booking. */
    cancel: "reservation.cancel",
  },

  // ── approval ──────────────────────────────────────────────────────────
  // Supervisor approvals (T2 items, low-credit borrowers, extensions).
  approval: {
    /** Approval queue. POLLED — POLLING.SUPERVISOR_QUEUE (60s). Page: Approvals. */
    list: "approval.list",
    /** One request pending approval, with borrower context. */
    getById: "approval.getById",
    /** Approve or reject. Page: Approvals. Error: ALREADY_DECIDED→CONFLICT. */
    decide: "approval.decide",
  },

  // ── appeal ────────────────────────────────────────────────────────────
  // Damage-report appeals.
  appeal: {
    /** Appeals list — borrower's own + supervisor review queue. Pages: Appeals, Appeals review. */
    list: "appeal.list",
    /** One appeal: reason, damage report, status, decision. */
    getById: "appeal.getById",
    /** File an appeal against a damage report. Error: APPEAL_WINDOW_CLOSED→FORBIDDEN. */
    create: "appeal.create",
    /** Supervisor decision (accept/reject). Error: ALREADY_DECIDED→CONFLICT. */
    decide: "appeal.decide",
  },

  // ── credit ────────────────────────────────────────────────────────────
  // Credit score, band, and active demerit deductions.
  credit: {
    /** My credit: score + band + active deductions. Page: Credit score. */
    me: "credit.me",
    /** A given user's credit (staff/supervisor viewing a borrower). */
    getById: "credit.getById",
  },

  // ── inspection ────────────────────────────────────────────────────────
  // Staff damage assessment on return + daily T3 room inspection rounds.
  inspection: {
    /** Inspection queue: returns awaiting assessment + T3 room rounds. Page: Inspection. */
    list: "inspection.list",
    /** One inspection task. */
    getById: "inspection.getById",
    /** Record a damage report (level B0–B3 + photos). Page: Inspection. */
    create: "inspection.create",
    /** Close an inspection (return accepted / room checked). */
    confirm: "inspection.confirm",
  },

  // ── notification ──────────────────────────────────────────────────────
  // In-app notifications (topbar bell).
  notification: {
    /** Notifications for the bell dropdown. POLLED — POLLING.NOTIFICATIONS (60s). */
    list: "notification.list",
    /** Mark a single notification read. */
    markRead: "notification.markRead",
    /** Mark all read. */
    markAllRead: "notification.markAllRead",
  },

  // ── report ────────────────────────────────────────────────────────────
  // Dashboards, analytics, exports, and consolidated (admin) reporting.
  report: {
    /** KPI cards for staff / admin dashboards. Pages: Staff dashboard, Admin overview. */
    dashboard: "report.dashboard",
    /** Chart aggregates: loans by dept, trend, utilization. Page: Analytics. */
    analytics: "report.analytics",
    /** Generate an export (CSV/XLSX). Page: Export data. */
    export: "report.export",
    /** System-wide, cross-department statistics. Page: Consolidated reports. */
    consolidated: "report.consolidated",
  },

  // ── admin ─────────────────────────────────────────────────────────────
  // Management domain. System-level (IT admin) + department-level (staff)
  // procedures, separated by middleware jurisdiction. Admin handles accounts
  // and technical settings; staff own lending rules and behavioural bans.
  admin: {
    // Accounts (system users + department users, jurisdiction-scoped)
    /** List user accounts. Pages: System users, User management. */
    listUsers: "admin.listUsers",
    /** One account's details. */
    getUserById: "admin.getUserById",
    /** Create an account (sends set-password invite). */
    createUser: "admin.createUser",
    /** Update an account. */
    updateUser: "admin.updateUser",
    /** Activate / deactivate an account. */
    setUserActive: "admin.setUserActive",
    /** Send a password reset. */
    resetPassword: "admin.resetPassword",
    /** Change an account's role. */
    changeRole: "admin.changeRole",

    // Permissions / behavioural ban (department staff)
    /** Apply or lift a borrowing ban. Page: Permissions / ban. */
    setUserBan: "admin.setUserBan",

    // Lending rules (department staff — business config, not technical)
    /** Read department lending settings (periods, quotas, tiers). Page: Lending settings. */
    getLendingSettings: "admin.getLendingSettings",
    /** Update department lending settings. Page: Lending settings. */
    updateLendingSettings: "admin.updateLendingSettings",

    // Technical config (IT admin)
    /** Read technical config (auth/storage/email/polling). Page: Technical config. */
    getConfig: "admin.getConfig",
    /** Update technical config. Page: Technical config. */
    updateConfig: "admin.updateConfig",

    // System status & cron (IT admin)
    /** Service/DB/cron health. POLLED. Page: System status, Admin overview. */
    getSystemStatus: "admin.getSystemStatus",
    /** Scheduled-job list + last-run results. Page: System status. */
    listCronJobs: "admin.listCronJobs",
    /** Trigger a scheduled job now. Page: System status. */
    runCronJob: "admin.runCronJob",

    // Audit (IT admin)
    /** Audit log (filter by action type). Page: Audit log. */
    listAudit: "admin.listAudit",
    /** One audit event's full detail. */
    getAuditById: "admin.getAuditById",
  },
} as const;

/**
 * Endpoints the frontend POLLS, with the interval constant (see POLLING in
 * constants/index.ts). Everything else is fetch-once + refetch-after-action.
 */
export const POLLED_ENDPOINTS = {
  [API.item.getAvailability]: "AVAILABILITY", // 15s
  [API.reservation.getSlots]: "FACILITY_SLOTS", // 15s
  [API.loan.list]: "REQUEST_STATUS/STAFF_QUEUE", // 30s (context-dependent)
  [API.approval.list]: "SUPERVISOR_QUEUE", // 60s
  [API.notification.list]: "NOTIFICATIONS", // 60s
  [API.admin.getSystemStatus]: "DEFAULT_STALE", // status page
} as const;

/**
 * Backend-only daily/​hourly cron jobs (ว, group 3). NOT called by the frontend
 * except `admin.runCronJob` (manual "run now"). Listed for contract completeness:
 *   markOverdue · markLost · expireDemerits · dueSoonReminder ·
 *   computeAvailability · openT3InspectionRounds · rollupDailyStats ·
 *   expireStaleRequests (hourly).
 */
export const CRON_JOBS = [
  "markOverdue",
  "markLost",
  "expireDemerits",
  "dueSoonReminder",
  "computeAvailability",
  "openT3InspectionRounds",
  "rollupDailyStats",
  "expireStaleRequests",
] as const;

/** Flat list of every callable endpoint path. */
export const ALL_ENDPOINTS = Object.values(API).flatMap((domain) =>
  Object.values(domain),
) as readonly string[];

type DomainMap = typeof API;
/** e.g. "loan.create" | "item.list" | … */
export type ApiEndpoint = {
  [D in keyof DomainMap]: DomainMap[D][keyof DomainMap[D]];
}[keyof DomainMap];
