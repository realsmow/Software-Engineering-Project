/**
 * ค่าคงที่ของระบบ ULMs
 * ตรงกับ business rules ในเอกสาร proposal
 */

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
  // Borrower
  CATALOG: "/catalog",
  EQUIPMENT_DETAIL: "/catalog/:id",
  MY_LOANS: "/my/loans",
  MY_HISTORY: "/my/history",
  MY_CREDIT: "/my/credit",
  APPEALS: "/my/appeals",
  // Staff
  STAFF_DASHBOARD: "/staff",
  STAFF_HANDOVER: "/staff/handover",
  STAFF_INSPECTION: "/staff/inspection",
  STAFF_INVENTORY: "/staff/inventory",
  // Supervisor
  SUPERVISOR_APPROVALS: "/supervisor/approvals",
  SUPERVISOR_APPEALS: "/supervisor/appeals",
  // Admin
  ADMIN_USERS: "/admin/users",
  ADMIN_SETTINGS: "/admin/settings",
  ADMIN_REPORTS: "/admin/reports",
} as const;
