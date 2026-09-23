/**
 * Mock data for the admin feature pages. No backend is wired yet, so these
 * stand in for the eventual API responses. Content stays Thai (DB content is
 * Thai-only per the i18n decision); enum-ish values use codes that the UI maps
 * to translation keys.
 *
 * ⚠️ Replace with real endpoints when the admin API lands.
 */
import type { Role } from "@/types/domain";

export interface Faculty {
  id: string;
  name: string;
}

/**
 * Faculties. The system currently serves one faculty (Engineering), but the
 * faculty → department hierarchy is modeled explicitly so more faculties can
 * be added later without reworking the UI. Add entries here and tag their
 * departments with the matching `facultyId`.
 */
export const FACULTIES: Faculty[] = [
  { id: "eng", name: "คณะวิศวกรรมศาสตร์" },
];

export function facultyName(id: string): string {
  return FACULTIES.find((f) => f.id === id)?.name ?? id;
}

export interface Department {
  id: string;
  name: string;
  facultyId: string;
}

export const DEPARTMENTS: Department[] = [
  { id: "cpe", name: "วิศวกรรมคอมพิวเตอร์", facultyId: "eng" },
  { id: "ee", name: "วิศวกรรมไฟฟ้า", facultyId: "eng" },
  { id: "me", name: "วิศวกรรมเครื่องกล", facultyId: "eng" },
  { id: "ce", name: "วิศวกรรมโยธา", facultyId: "eng" },
  { id: "che", name: "วิศวกรรมเคมี", facultyId: "eng" },
  { id: "ie", name: "วิศวกรรมอุตสาหการ", facultyId: "eng" },
  { id: "it", name: "สำนักงาน IT / สารสนเทศ", facultyId: "eng" },
];

export function deptName(id: string): string {
  return DEPARTMENTS.find((d) => d.id === id)?.name ?? id;
}

/** Departments belonging to a faculty (for cascading faculty → department selects). */
export function departmentsByFaculty(facultyId: string): Department[] {
  return DEPARTMENTS.filter((d) => d.facultyId === facultyId);
}

export type AuthMethod = "ku" | "local";
/**
 * Mirrors the server's accountStatus enum (backend/src/admin/admin.schema.ts).
 *
 * There is no "disabled": AccountInfo records nothing about an account whose
 * password was never set, so the server cannot report it and inventing it here
 * would put a state in the UI that no query can ever return.
 */
export type AccountStatus = "active" | "suspended" | "disabled";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  govId: string; // student / staff id
  role: Role;
  departmentId: string;
  auth: AuthMethod;
  status: AccountStatus;
  lastActiveAt: string; // ISO
  createdAt: string; // ISO
}

/** Two-letter Thai avatar initials from a full name. */
export function initials(name: string): string {
  const clean = name.replace(/^(ผศ\.|รศ\.|ศ\.|ดร\.|นาย|นาง|นางสาว)\s*/g, "").trim();
  const parts = clean.split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return (first + second) || "?";
}

export const ADMIN_USERS: AdminUser[] = [
  { id: "u-1001", name: "ณัฐวุฒิ ศรีสุวรรณ", email: "natthawut.s@ku.th", govId: "6410501234", role: "borrower", departmentId: "cpe", auth: "ku", status: "active", lastActiveAt: "2026-08-06T09:12:00Z", createdAt: "2024-06-01T02:00:00Z" },
  { id: "u-1002", name: "ปิยะดา วัฒนกุล", email: "piyada.w@ku.th", govId: "6410502211", role: "borrower", departmentId: "ee", auth: "ku", status: "active", lastActiveAt: "2026-08-05T14:40:00Z", createdAt: "2024-06-01T02:00:00Z" },
  { id: "u-1003", name: "สมชาย พร้อมเจริญ", email: "somchai.p@ku.th", govId: "EMP20481", role: "staff", departmentId: "cpe", auth: "local", status: "active", lastActiveAt: "2026-08-06T08:02:00Z", createdAt: "2024-05-12T02:00:00Z" },
  { id: "u-1004", name: "ผศ.ดร. อรวรรณ ภักดี", email: "orawan.p@ku.th", govId: "EMP10233", role: "supervisor", departmentId: "cpe", auth: "ku", status: "active", lastActiveAt: "2026-08-06T07:30:00Z", createdAt: "2023-11-02T02:00:00Z" },
  { id: "u-1005", name: "ธนพล เจ้าหน้าที่ IT", email: "thanapon.it@ku.th", govId: "EMP00012", role: "admin", departmentId: "it", auth: "ku", status: "active", lastActiveAt: "2026-08-06T09:50:00Z", createdAt: "2023-08-01T02:00:00Z" },
  { id: "u-1006", name: "กิตติพงษ์ แซ่ลิ้ม", email: "kittipong.s@ku.th", govId: "6410503980", role: "borrower", departmentId: "me", auth: "ku", status: "suspended", lastActiveAt: "2026-07-20T11:15:00Z", createdAt: "2024-06-01T02:00:00Z" },
  { id: "u-1007", name: "ชมรมหุ่นยนต์ วิศวฯ", email: "robotics.club@ku.th", govId: "CLUB0031", role: "staff", departmentId: "cpe", auth: "local", status: "active", lastActiveAt: "2026-08-04T16:22:00Z", createdAt: "2024-01-15T02:00:00Z" },
  { id: "u-1008", name: "รศ.ดร. วิชัย ตั้งมั่น", email: "wichai.t@ku.th", govId: "EMP10871", role: "supervisor", departmentId: "ee", auth: "ku", status: "active", lastActiveAt: "2026-08-05T10:05:00Z", createdAt: "2023-09-10T02:00:00Z" },
  { id: "u-1009", name: "สุนิสา แก้วประเสริฐ", email: "sunisa.k@ku.th", govId: "EMP20997", role: "staff", departmentId: "me", auth: "local", status: "active", lastActiveAt: "2026-08-06T06:48:00Z", createdAt: "2024-03-01T02:00:00Z" },
  { id: "u-1010", name: "อนุชา ไกรทอง", email: "anucha.k@ku.th", govId: "6410504455", role: "borrower", departmentId: "ce", auth: "ku", status: "active", lastActiveAt: "2026-08-03T13:00:00Z", createdAt: "2024-06-01T02:00:00Z" },
  { id: "u-1011", name: "พรทิพย์ ชัยมงคล", email: "pornthip.c@ku.th", govId: "6410505566", role: "borrower", departmentId: "che", auth: "ku", status: "active", lastActiveAt: "2026-08-06T08:33:00Z", createdAt: "2024-06-01T02:00:00Z" },
  { id: "u-1012", name: "เจษฎา รุ่งเรือง", email: "jessada.r@ku.th", govId: "EMP21044", role: "staff", departmentId: "ce", auth: "local", status: "disabled", lastActiveAt: "-", createdAt: "2026-08-01T02:00:00Z" },
  { id: "u-1013", name: "มานพ สุขสวัสดิ์", email: "manop.s@ku.th", govId: "6410506677", role: "borrower", departmentId: "ie", auth: "ku", status: "active", lastActiveAt: "2026-08-02T09:20:00Z", createdAt: "2024-06-01T02:00:00Z" },
  { id: "u-1014", name: "ผศ. ดารณี พงษ์ไพบูลย์", email: "daranee.p@ku.th", govId: "EMP10555", role: "supervisor", departmentId: "me", auth: "ku", status: "active", lastActiveAt: "2026-08-05T15:41:00Z", createdAt: "2023-10-20T02:00:00Z" },
  { id: "u-1015", name: "ชมรมอิเล็กทรอนิกส์", email: "electron.club@ku.th", govId: "CLUB0042", role: "staff", departmentId: "ee", auth: "local", status: "active", lastActiveAt: "2026-08-01T12:10:00Z", createdAt: "2024-02-05T02:00:00Z" },
  { id: "u-1016", name: "วรรณพร ทองดี", email: "wannaporn.t@ku.th", govId: "6410507788", role: "borrower", departmentId: "cpe", auth: "ku", status: "active", lastActiveAt: "2026-08-06T09:01:00Z", createdAt: "2024-06-01T02:00:00Z" },
  { id: "u-1017", name: "ภาคภูมิ เลิศวิไล", email: "pakpoom.l@ku.th", govId: "6410508899", role: "borrower", departmentId: "ee", auth: "ku", status: "suspended", lastActiveAt: "2026-07-11T10:00:00Z", createdAt: "2024-06-01T02:00:00Z" },
  { id: "u-1018", name: "สิริพร ศรีมงคล", email: "siriporn.s@ku.th", govId: "EMP21188", role: "staff", departmentId: "che", auth: "local", status: "active", lastActiveAt: "2026-08-06T07:15:00Z", createdAt: "2024-04-10T02:00:00Z" },
  { id: "u-1019", name: "ธีรภัทร คงทน", email: "teerapat.k@ku.th", govId: "6410509900", role: "borrower", departmentId: "ie", auth: "ku", status: "active", lastActiveAt: "2026-08-04T11:45:00Z", createdAt: "2024-06-01T02:00:00Z" },
  { id: "u-1020", name: "ศ.ดร. ประสิทธิ์ วงศ์ใหญ่", email: "prasit.w@ku.th", govId: "EMP10099", role: "supervisor", departmentId: "ce", auth: "ku", status: "active", lastActiveAt: "2026-08-05T09:30:00Z", createdAt: "2023-07-01T02:00:00Z" },
  { id: "u-1021", name: "จิราภา แสนสุข", email: "jirapa.s@ku.th", govId: "6410510011", role: "borrower", departmentId: "cpe", auth: "ku", status: "disabled", lastActiveAt: "-", createdAt: "2026-08-05T02:00:00Z" },
  { id: "u-1022", name: "นพดล ยิ่งยง", email: "noppadol.y@ku.th", govId: "EMP21290", role: "staff", departmentId: "ie", auth: "local", status: "active", lastActiveAt: "2026-08-06T08:55:00Z", createdAt: "2024-05-01T02:00:00Z" },
  { id: "u-1023", name: "อารยา สถิตย์", email: "araya.s@ku.th", govId: "6410511122", role: "borrower", departmentId: "che", auth: "ku", status: "active", lastActiveAt: "2026-08-01T14:12:00Z", createdAt: "2024-06-01T02:00:00Z" },
  { id: "u-1024", name: "เอกชัย ประเสริฐศรี", email: "ekachai.p@ku.th", govId: "EMP00027", role: "admin", departmentId: "it", auth: "ku", status: "active", lastActiveAt: "2026-08-06T09:44:00Z", createdAt: "2023-08-01T02:00:00Z" },
];
export type ServiceState = "operational" | "degraded" | "down";
export type CronResult = "success" | "failed" | "pending";

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  lastRunAt: string;
  result: CronResult;
  durationMs: number;
}

export const CRON_JOBS: CronJob[] = [
  { id: "overdue", name: "Mark Overdue", schedule: "00:01 ทุกวัน", lastRunAt: "2026-08-06T00:01:00Z", result: "success", durationMs: 1420 },
  { id: "lost", name: "Mark Lost", schedule: "00:15 ทุกวัน", lastRunAt: "2026-08-06T00:15:00Z", result: "success", durationMs: 880 },
  { id: "expire-demerit", name: "Expire Demerit", schedule: "01:00 ทุกวัน", lastRunAt: "2026-08-06T01:00:00Z", result: "success", durationMs: 2110 },
  { id: "availability", name: "Update Availability", schedule: "02:00 ทุกวัน", lastRunAt: "2026-08-06T02:00:00Z", result: "success", durationMs: 1650 },
  { id: "stats", name: "Daily Stats Rollup", schedule: "03:00 ทุกวัน", lastRunAt: "2026-08-06T03:00:00Z", result: "success", durationMs: 4300 },
  { id: "t3-inspect", name: "T3 Inspection Task", schedule: "06:00 ทุกวัน", lastRunAt: "2026-08-06T06:00:00Z", result: "success", durationMs: 540 },
  { id: "due-reminder", name: "Due Reminder", schedule: "08:00 ทุกวัน", lastRunAt: "2026-08-06T08:00:00Z", result: "failed", durationMs: 300 },
  { id: "release-noshow", name: "Release No-show", schedule: "ทุกชั่วโมง", lastRunAt: "2026-08-06T09:00:00Z", result: "success", durationMs: 210 },
];

// ==================== Audit log ====================
export type AuditAction = "login" | "create" | "update" | "delete" | "role" | "config";

export interface AuditEvent {
  id: string;
  at: string;
  /** Account key behind `actorName`. Null for a cron job, which has no actor. */
  actorId: number | null;
  actorName: string;
  actorRole: Role;
  action: AuditAction;
  target: string;
  ip: string;
  userAgent: string;
  detail: string;
}