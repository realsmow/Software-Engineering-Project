/**
 * ค่าคงที่ของระบบ ULMs
 * ตรงกับ business rules ในเอกสาร proposal
 */
import type { CreditBand, Role } from "@/types/domain";

// ==================== Polling Intervals (ms) ====================
export const POLLING = {
  AVAILABILITY: 15_000, // ของคงเหลือ + วันที่พร้อมให้ยืม
  FACILITY_SLOTS: 15_000, // สล็อต T3
  REQUEST_STATUS: 30_000, // สถานะคำขอที่รออนุมัติ
  NOTIFICATIONS: 60_000, // แจ้งเตือน in-app
  STAFF_QUEUE: 30_000, // คิวงาน staff
  SUPERVISOR_QUEUE: 60_000, // คิวรออนุมัติ supervisor
} as const;

// ==================== Cache Config ====================
export const CACHE = {
  MASTER_DATA_MS: 60 * 60 * 1000, // 1 ชม. สำหรับ tier/category/damage-level
  USER_PROFILE_MS: 5 * 60 * 1000, // 5 นาที
  DEFAULT_STALE_MS: 30 * 1000, // 30 วิ (default)
} as const;

// ==================== Business Rules ====================
export const BUSINESS = {
  MAX_LOAN_DAYS: 14,
  MIN_LOAN_DAYS: 1,
  PICKUP_DEADLINE_DAYS: 1,
  LOST_THRESHOLD_DAYS: 14, // เกินกำหนดกี่วันถือว่าหาย
  MAX_T3_CONCURRENT_SLOTS: 2, // จองสล็อต T3 พร้อมกันได้สูงสุด
  RESERVATION_MAX_DAYS: 90, // จองล่วงหน้าสูงสุด 3 เดือน
  RETURN_CUTOFF_HOUR: 17, // 17:00 หลังจากนี้นับช้า 1 วัน
} as const;

// ==================== File Upload (client-side guard) ====================
// First line of defense before the pre-signed PUT - the backend re-validates.
// Matches the FILE_TOO_LARGE / INVALID_FILE_TYPE copy in error-messages.ts.
export const UPLOAD = {
  MAX_MB: 5,
  MAX_BYTES: 5 * 1024 * 1024,
  ALLOWED_MIME: ["image/jpeg", "image/png"],
  ALLOWED_EXT: [".jpg", ".jpeg", ".png"],
} as const;

// ==================== Tier Config ====================
export const TIER_CONFIG = {
  T0: { label: "ยืมง่าย", creditWeight: 0, priceMax: 100 },
  T1: { label: "ยืมได้", creditWeight: 5, priceMax: 1000 },
  T2: { label: "ยืมยาก", creditWeight: 10, priceMax: Infinity },
  T3: { label: "ของติดที่", creditWeight: 0, priceMax: 0 },
} as const;

// ==================== Credit Band Config ====================
export const CREDIT_BANDS = [
  { band: "D0", min: 80, max: 100, loanDays: 14, label: "ดี" },
  { band: "D1", min: 50, max: 79, loanDays: 7, label: "เฝ้าระวัง" },
  { band: "D2", min: 30, max: 49, loanDays: 7, label: "เสี่ยง" },
  { band: "D3", min: 0, max: 29, loanDays: 5, label: "เสี่ยงสูง" },
] as const;

/**
 * What each credit band is allowed to do when opening a request.
 * - `needsSupervisor`: D2/D3 must get supervisor sign-off on T1 items too, not
 *   just the usual T2 ones.
 * - `blocked`: D3 cannot open a new request until outstanding items are cleared.
 * Kept beside CREDIT_BANDS rather than inside it so the band table stays the
 * plain score → loan-days lookup that other screens already read.
 */
export const CREDIT_BAND_POLICY: Record<
  CreditBand,
  { needsSupervisor: boolean; blocked: boolean }
> = {
  D0: { needsSupervisor: false, blocked: false },
  D1: { needsSupervisor: false, blocked: false },
  D2: { needsSupervisor: true, blocked: false },
  D3: { needsSupervisor: true, blocked: true },
};

// ==================== Damage Level Config ====================
export const DAMAGE_LEVELS = {
  B0: { label: "ตามการใช้งานปรกติ", weight: 0 },
  B1: { label: "เกินการใช้งานปรกติ ระดับเล็กน้อย", weight: 1 },
  B2: { label: "เกินการใช้งานปรกติ ระดับปานกลาง", weight: 3 },
  B3: { label: "เกินการใช้งานปรกติ ระดับรุนแรง", weight: 5 },
} as const;

// ==================== Routes ====================
export const ROUTES = {
  LOGIN: "/login",
  HOME: "/",
  // Account (any authenticated role)
  PROFILE: "/profile",
  // Borrower
  CATALOG: "/catalog",
  EQUIPMENT_DETAIL: "/catalog/:id",
  ROOMS: "/rooms",
  ROOM_BOOKING: "/rooms/:id/book",
  REQUEST: "/request",
  MY_LOANS: "/my/loans",
  MY_HISTORY: "/my/history",
  MY_CREDIT: "/my/credit",
  APPEALS: "/my/appeals",
  // Staff
  STAFF_DASHBOARD: "/staff",
  STAFF_HANDOVER: "/staff/handover",
  STAFF_INSPECTION: "/staff/inspection",
  STAFF_INVENTORY: "/staff/inventory",
  // Department management (shared by staff + supervisor, jurisdiction-scoped)
  STAFF_USERS: "/staff/users",
  STAFF_PERMISSIONS: "/staff/permissions",
  STAFF_SETTINGS: "/staff/settings",
  // Reports (shared by staff + supervisor)
  REPORT_ANALYTICS: "/reports/analytics",
  REPORT_EXPORT: "/reports/export",
  // Supervisor
  SUPERVISOR_APPROVALS: "/supervisor/approvals",
  SUPERVISOR_APPEALS: "/supervisor/appeals",
  // Admin
  ADMIN_DASHBOARD: "/admin",
  ADMIN_USERS: "/admin/users",
  ADMIN_STATUS: "/admin/status",
  ADMIN_AUDIT: "/admin/audit",
  ADMIN_CONFIG: "/admin/config",
  ADMIN_SETTINGS: "/admin/settings",
  ADMIN_REPORTS: "/admin/reports",
} as const;

/**
 * Role → set of ROUTES the role may access.
 * Borrower routes are the shared base for every authenticated role.
 * Used by both the router guards and the sidebar nav.
 */
export const ROLE_ROUTES = {
  borrower: [
    ROUTES.HOME,
    ROUTES.CATALOG,
    ROUTES.EQUIPMENT_DETAIL,
    ROUTES.ROOMS,
    ROUTES.ROOM_BOOKING,
    ROUTES.REQUEST,
    ROUTES.MY_LOANS,
    ROUTES.MY_HISTORY,
    ROUTES.MY_CREDIT,
    ROUTES.APPEALS,
  ],
  staff: [
    ROUTES.STAFF_DASHBOARD,
    ROUTES.STAFF_HANDOVER,
    ROUTES.STAFF_INSPECTION,
    ROUTES.STAFF_INVENTORY,
    ROUTES.STAFF_USERS,
    ROUTES.STAFF_PERMISSIONS,
    ROUTES.STAFF_SETTINGS,
    ROUTES.REPORT_ANALYTICS,
    ROUTES.REPORT_EXPORT,
  ],
  supervisor: [
    ROUTES.SUPERVISOR_APPROVALS,
    ROUTES.SUPERVISOR_APPEALS,
    ROUTES.STAFF_USERS,
    ROUTES.STAFF_PERMISSIONS,
    ROUTES.STAFF_SETTINGS,
    ROUTES.REPORT_ANALYTICS,
    ROUTES.REPORT_EXPORT,
  ],
  admin: [
    ROUTES.ADMIN_DASHBOARD,
    ROUTES.ADMIN_USERS,
    ROUTES.ADMIN_STATUS,
    ROUTES.ADMIN_AUDIT,
    ROUTES.ADMIN_CONFIG,
    ROUTES.ADMIN_SETTINGS,
    ROUTES.ADMIN_REPORTS,
  ],
} as const;

/**
 * Role → landing route after login (and the target of the breadcrumb root).
 * Each role starts on its own home instead of the shared borrower Home page.
 */
export const HOME_ROUTE_BY_ROLE: Record<Role, string> = {
  borrower: ROUTES.HOME,
  staff: ROUTES.STAFF_DASHBOARD,
  supervisor: ROUTES.SUPERVISOR_APPROVALS,
  admin: ROUTES.ADMIN_DASHBOARD,
};
