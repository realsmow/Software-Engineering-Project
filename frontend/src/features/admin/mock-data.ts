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
export type AccountStatus = "active" | "suspended" | "invited";

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
  { id: "u-1012", name: "เจษฎา รุ่งเรือง", email: "jessada.r@ku.th", govId: "EMP21044", role: "staff", departmentId: "ce", auth: "local", status: "invited", lastActiveAt: "-", createdAt: "2026-08-01T02:00:00Z" },
  { id: "u-1013", name: "มานพ สุขสวัสดิ์", email: "manop.s@ku.th", govId: "6410506677", role: "borrower", departmentId: "ie", auth: "ku", status: "active", lastActiveAt: "2026-08-02T09:20:00Z", createdAt: "2024-06-01T02:00:00Z" },
  { id: "u-1014", name: "ผศ. ดารณี พงษ์ไพบูลย์", email: "daranee.p@ku.th", govId: "EMP10555", role: "supervisor", departmentId: "me", auth: "ku", status: "active", lastActiveAt: "2026-08-05T15:41:00Z", createdAt: "2023-10-20T02:00:00Z" },
  { id: "u-1015", name: "ชมรมอิเล็กทรอนิกส์", email: "electron.club@ku.th", govId: "CLUB0042", role: "staff", departmentId: "ee", auth: "local", status: "active", lastActiveAt: "2026-08-01T12:10:00Z", createdAt: "2024-02-05T02:00:00Z" },
  { id: "u-1016", name: "วรรณพร ทองดี", email: "wannaporn.t@ku.th", govId: "6410507788", role: "borrower", departmentId: "cpe", auth: "ku", status: "active", lastActiveAt: "2026-08-06T09:01:00Z", createdAt: "2024-06-01T02:00:00Z" },
  { id: "u-1017", name: "ภาคภูมิ เลิศวิไล", email: "pakpoom.l@ku.th", govId: "6410508899", role: "borrower", departmentId: "ee", auth: "ku", status: "suspended", lastActiveAt: "2026-07-11T10:00:00Z", createdAt: "2024-06-01T02:00:00Z" },
  { id: "u-1018", name: "สิริพร ศรีมงคล", email: "siriporn.s@ku.th", govId: "EMP21188", role: "staff", departmentId: "che", auth: "local", status: "active", lastActiveAt: "2026-08-06T07:15:00Z", createdAt: "2024-04-10T02:00:00Z" },
  { id: "u-1019", name: "ธีรภัทร คงทน", email: "teerapat.k@ku.th", govId: "6410509900", role: "borrower", departmentId: "ie", auth: "ku", status: "active", lastActiveAt: "2026-08-04T11:45:00Z", createdAt: "2024-06-01T02:00:00Z" },
  { id: "u-1020", name: "ศ.ดร. ประสิทธิ์ วงศ์ใหญ่", email: "prasit.w@ku.th", govId: "EMP10099", role: "supervisor", departmentId: "ce", auth: "ku", status: "active", lastActiveAt: "2026-08-05T09:30:00Z", createdAt: "2023-07-01T02:00:00Z" },
  { id: "u-1021", name: "จิราภา แสนสุข", email: "jirapa.s@ku.th", govId: "6410510011", role: "borrower", departmentId: "cpe", auth: "ku", status: "invited", lastActiveAt: "-", createdAt: "2026-08-05T02:00:00Z" },
  { id: "u-1022", name: "นพดล ยิ่งยง", email: "noppadol.y@ku.th", govId: "EMP21290", role: "staff", departmentId: "ie", auth: "local", status: "active", lastActiveAt: "2026-08-06T08:55:00Z", createdAt: "2024-05-01T02:00:00Z" },
  { id: "u-1023", name: "อารยา สถิตย์", email: "araya.s@ku.th", govId: "6410511122", role: "borrower", departmentId: "che", auth: "ku", status: "active", lastActiveAt: "2026-08-01T14:12:00Z", createdAt: "2024-06-01T02:00:00Z" },
  { id: "u-1024", name: "เอกชัย ประเสริฐศรี", email: "ekachai.p@ku.th", govId: "EMP00027", role: "admin", departmentId: "it", auth: "ku", status: "active", lastActiveAt: "2026-08-06T09:44:00Z", createdAt: "2023-08-01T02:00:00Z" },
];

export function roleCounts(): Record<Role, number> {
  return ADMIN_USERS.reduce(
    (acc, u) => {
      acc[u.role] += 1;
      return acc;
    },
    { borrower: 0, staff: 0, supervisor: 0, admin: 0 } as Record<Role, number>,
  );
}

// ==================== System status ====================
export type ServiceState = "operational" | "degraded" | "down";

export interface ServiceHealth {
  id: string;
  name: string;
  state: ServiceState;
  latencyMs: number;
  checkedAt: string;
}

export const SERVICES: ServiceHealth[] = [
  { id: "api", name: "API Gateway (NestJS)", state: "operational", latencyMs: 42, checkedAt: "2026-08-06T09:50:00Z" },
  { id: "web", name: "Web Client (Vite)", state: "operational", latencyMs: 18, checkedAt: "2026-08-06T09:50:00Z" },
  { id: "pg", name: "PostgreSQL", state: "operational", latencyMs: 6, checkedAt: "2026-08-06T09:50:00Z" },
  { id: "mongo", name: "MongoDB", state: "operational", latencyMs: 11, checkedAt: "2026-08-06T09:50:00Z" },
  { id: "storage", name: "Object Storage (S3)", state: "degraded", latencyMs: 320, checkedAt: "2026-08-06T09:50:00Z" },
  { id: "mail", name: "Email (SMTP)", state: "operational", latencyMs: 88, checkedAt: "2026-08-06T09:50:00Z" },
  { id: "scheduler", name: "Cron Scheduler", state: "operational", latencyMs: 3, checkedAt: "2026-08-06T09:50:00Z" },
];

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
  actorName: string;
  actorRole: Role;
  action: AuditAction;
  target: string;
  ip: string;
  userAgent: string;
  detail: string;
}

export const AUDIT_EVENTS: AuditEvent[] = [
  { id: "ev-5001", at: "2026-08-06T09:50:12Z", actorName: "ธนพล เจ้าหน้าที่ IT", actorRole: "admin", action: "config", target: "config/storage.maxUpload", ip: "10.4.12.8", userAgent: "Chrome 128 · macOS", detail: "เปลี่ยนขนาดอัปโหลดสูงสุด 10 → 20 MB" },
  { id: "ev-5002", at: "2026-08-06T09:44:03Z", actorName: "เอกชัย ประเสริฐศรี", actorRole: "admin", action: "role", target: "u-1012 เจษฎา รุ่งเรือง", ip: "10.4.12.9", userAgent: "Firefox 129 · Windows", detail: "กำหนดบทบาท borrower → staff" },
  { id: "ev-5003", at: "2026-08-06T09:12:40Z", actorName: "ณัฐวุฒิ ศรีสุวรรณ", actorRole: "borrower", action: "login", target: "session", ip: "158.108.7.21", userAgent: "Safari 18 · iOS", detail: "เข้าสู่ระบบด้วยอีเมล KU" },
  { id: "ev-5004", at: "2026-08-06T08:55:11Z", actorName: "นพดล ยิ่งยง", actorRole: "staff", action: "update", target: "equipment/มัลติมิเตอร์ Fluke 87V", ip: "158.108.3.44", userAgent: "Chrome 128 · Windows", detail: "แก้ไขจำนวนหน่วยคงเหลือ" },
  { id: "ev-5005", at: "2026-08-06T08:33:59Z", actorName: "วรรณพร ทองดี", actorRole: "borrower", action: "create", target: "request/REQ-2026-0881", ip: "158.108.7.90", userAgent: "Chrome 128 · Android", detail: "สร้างคำขอยืม 2 รายการ" },
  { id: "ev-5006", at: "2026-08-06T08:02:22Z", actorName: "สมชาย พร้อมเจริญ", actorRole: "staff", action: "login", target: "session", ip: "10.4.20.5", userAgent: "Edge 128 · Windows", detail: "เข้าสู่ระบบด้วยบัญชีภายใน" },
  { id: "ev-5007", at: "2026-08-06T07:30:05Z", actorName: "ผศ.ดร. อรวรรณ ภักดี", actorRole: "supervisor", action: "update", target: "request/REQ-2026-0879", ip: "158.108.9.12", userAgent: "Safari 18 · macOS", detail: "อนุมัติคำขอยืมระดับ T2" },
  { id: "ev-5008", at: "2026-08-05T16:22:48Z", actorName: "ชมรมหุ่นยนต์ วิศวฯ", actorRole: "staff", action: "create", target: "equipment/บอร์ด Arduino Mega", ip: "10.4.20.9", userAgent: "Chrome 127 · Windows", detail: "เพิ่มครุภัณฑ์ใหม่ 5 หน่วย" },
  { id: "ev-5009", at: "2026-08-05T15:41:10Z", actorName: "ผศ. ดารณี พงษ์ไพบูลย์", actorRole: "supervisor", action: "update", target: "appeal/APL-2026-0044", ip: "158.108.9.31", userAgent: "Chrome 128 · macOS", detail: "ตัดสินอุทธรณ์: ยอมรับ" },
  { id: "ev-5010", at: "2026-08-05T14:40:33Z", actorName: "ปิยะดา วัฒนกุล", actorRole: "borrower", action: "login", target: "session", ip: "158.108.7.55", userAgent: "Chrome 128 · Windows", detail: "เข้าสู่ระบบด้วยอีเมล KU" },
  { id: "ev-5011", at: "2026-08-05T11:20:19Z", actorName: "ธนพล เจ้าหน้าที่ IT", actorRole: "admin", action: "create", target: "u-1021 จิราภา แสนสุข", ip: "10.4.12.8", userAgent: "Chrome 128 · macOS", detail: "สร้างบัญชีผู้ใช้ใหม่ (ส่งคำเชิญ)" },
  { id: "ev-5012", at: "2026-08-05T10:05:47Z", actorName: "รศ.ดร. วิชัย ตั้งมั่น", actorRole: "supervisor", action: "login", target: "session", ip: "158.108.9.77", userAgent: "Firefox 129 · Linux", detail: "เข้าสู่ระบบด้วยอีเมล KU" },
  { id: "ev-5013", at: "2026-08-05T09:31:02Z", actorName: "ธนพล เจ้าหน้าที่ IT", actorRole: "admin", action: "delete", target: "u-0912 (บัญชีทดสอบ)", ip: "10.4.12.8", userAgent: "Chrome 128 · macOS", detail: "ปิดใช้งานบัญชีทดสอบถาวร" },
  { id: "ev-5014", at: "2026-08-05T08:14:55Z", actorName: "สุนิสา แก้วประเสริฐ", actorRole: "staff", action: "update", target: "loan/LN-2026-0431", ip: "10.4.21.3", userAgent: "Edge 128 · Windows", detail: "บันทึกการรับคืน + ระดับความเสียหาย B1" },
  { id: "ev-5015", at: "2026-08-04T16:48:12Z", actorName: "เอกชัย ประเสริฐศรี", actorRole: "admin", action: "config", target: "config/auth.sessionTimeout", ip: "10.4.12.9", userAgent: "Firefox 129 · Windows", detail: "เปลี่ยนหมดเวลาเซสชัน 60 → 120 นาที" },
  { id: "ev-5016", at: "2026-08-04T13:00:41Z", actorName: "อนุชา ไกรทอง", actorRole: "borrower", action: "create", target: "request/REQ-2026-0860", ip: "158.108.7.19", userAgent: "Chrome 128 · Android", detail: "สร้างคำขอจองสล็อต T3" },
  { id: "ev-5017", at: "2026-08-04T11:45:23Z", actorName: "ธีรภัทร คงทน", actorRole: "borrower", action: "login", target: "session", ip: "158.108.7.88", userAgent: "Safari 18 · iOS", detail: "เข้าสู่ระบบด้วยอีเมล KU" },
  { id: "ev-5018", at: "2026-08-04T09:20:00Z", actorName: "นพดล ยิ่งยง", actorRole: "staff", action: "role", target: "u-1015 ชมรมอิเล็กทรอนิกส์", ip: "10.4.20.7", userAgent: "Chrome 128 · Windows", detail: "แก้สิทธิ์ในขอบเขตภาควิชา" },
  { id: "ev-5019", at: "2026-08-03T15:10:34Z", actorName: "ธนพล เจ้าหน้าที่ IT", actorRole: "admin", action: "update", target: "u-1006 กิตติพงษ์ แซ่ลิ้ม", ip: "10.4.12.8", userAgent: "Chrome 128 · macOS", detail: "ระงับบัญชีชั่วคราว (คำขอฝ่ายวินัย)" },
  { id: "ev-5020", at: "2026-08-03T10:02:57Z", actorName: "ศ.ดร. ประสิทธิ์ วงศ์ใหญ่", actorRole: "supervisor", action: "login", target: "session", ip: "158.108.9.5", userAgent: "Chrome 128 · macOS", detail: "เข้าสู่ระบบด้วยอีเมล KU" },
  { id: "ev-5021", at: "2026-08-02T14:22:08Z", actorName: "สิริพร ศรีมงคล", actorRole: "staff", action: "create", target: "equipment/กล้องจุลทรรศน์", ip: "10.4.22.2", userAgent: "Edge 128 · Windows", detail: "เพิ่มครุภัณฑ์ใหม่ 2 หน่วย" },
  { id: "ev-5022", at: "2026-08-02T09:20:44Z", actorName: "มานพ สุขสวัสดิ์", actorRole: "borrower", action: "login", target: "session", ip: "158.108.7.61", userAgent: "Chrome 128 · Windows", detail: "เข้าสู่ระบบด้วยอีเมล KU" },
];

// ==================== Consolidated reports ====================
export interface DeptReport {
  departmentId: string;
  loans: number;
  overdue: number;
  utilization: number; // percent
}

export const DEPT_REPORTS: DeptReport[] = [
  { departmentId: "cpe", loans: 412, overdue: 18, utilization: 74 },
  { departmentId: "ee", loans: 366, overdue: 22, utilization: 68 },
  { departmentId: "me", loans: 298, overdue: 12, utilization: 61 },
  { departmentId: "ce", loans: 187, overdue: 9, utilization: 52 },
  { departmentId: "che", loans: 154, overdue: 7, utilization: 47 },
  { departmentId: "ie", loans: 141, overdue: 5, utilization: 44 },
];

export interface TopEquipment {
  name: string;
  tier: "T0" | "T1" | "T2" | "T3";
  count: number;
}

export const TOP_EQUIPMENT: TopEquipment[] = [
  { name: "มัลติมิเตอร์ Fluke 87V", tier: "T1", count: 214 },
  { name: "บอร์ด Arduino Uno", tier: "T0", count: 198 },
  { name: "ออสซิลโลสโคป Rigol", tier: "T2", count: 143 },
  { name: "หัวแร้งบัดกรี", tier: "T0", count: 132 },
  { name: "ห้องปฏิบัติการ CAD (ห้อง 204)", tier: "T3", count: 121 },
  { name: "กล้องถ่ายภาพความร้อน", tier: "T2", count: 88 },
  { name: "ชุดทดลอง PLC", tier: "T1", count: 76 },
];

// ==================== Chart / time-series data ====================
// Aggregates for the embedded drill-down charts. Shaped the way the reporting
// endpoints are expected to return them so the charts can be re-pointed at the
// real API with minimal changes.

/** Audit events bucketed by hour of day (0–23) — reveals peak-activity windows. */
export interface HourBucket {
  hour: number;
  events: number;
}
export const AUDIT_BY_HOUR: HourBucket[] = [
  { hour: 0, events: 6 },
  { hour: 1, events: 3 },
  { hour: 2, events: 2 },
  { hour: 3, events: 1 },
  { hour: 4, events: 0 },
  { hour: 5, events: 1 },
  { hour: 6, events: 4 },
  { hour: 7, events: 12 },
  { hour: 8, events: 31 },
  { hour: 9, events: 44 },
  { hour: 10, events: 38 },
  { hour: 11, events: 27 },
  { hour: 12, events: 15 },
  { hour: 13, events: 33 },
  { hour: 14, events: 41 },
  { hour: 15, events: 36 },
  { hour: 16, events: 25 },
  { hour: 17, events: 14 },
  { hour: 18, events: 8 },
  { hour: 19, events: 5 },
  { hour: 20, events: 4 },
  { hour: 21, events: 3 },
  { hour: 22, events: 2 },
  { hour: 23, events: 2 },
];

/** Audit events grouped by action type (last 30 days). */
export interface ActionCount {
  action: AuditAction;
  count: number;
}
export const AUDIT_BY_ACTION: ActionCount[] = [
  { action: "login", count: 486 },
  { action: "create", count: 213 },
  { action: "update", count: 341 },
  { action: "delete", count: 27 },
  { action: "role", count: 34 },
  { action: "config", count: 19 },
];

/** Hourly API latency (ms) and error rate (%) over the last 24h. */
export interface HealthPoint {
  hour: number;
  latencyMs: number;
  errorRate: number;
}
export const HEALTH_TIMELINE: HealthPoint[] = [
  { hour: 0, latencyMs: 38, errorRate: 0.05 },
  { hour: 2, latencyMs: 35, errorRate: 0.04 },
  { hour: 4, latencyMs: 34, errorRate: 0.03 },
  { hour: 6, latencyMs: 40, errorRate: 0.06 },
  { hour: 8, latencyMs: 58, errorRate: 0.12 },
  { hour: 10, latencyMs: 74, errorRate: 0.18 },
  { hour: 12, latencyMs: 61, errorRate: 0.10 },
  { hour: 13, latencyMs: 96, errorRate: 0.31 },
  { hour: 14, latencyMs: 128, errorRate: 0.44 },
  { hour: 16, latencyMs: 71, errorRate: 0.15 },
  { hour: 18, latencyMs: 49, errorRate: 0.08 },
  { hour: 20, latencyMs: 44, errorRate: 0.06 },
  { hour: 22, latencyMs: 41, errorRate: 0.05 },
];

/** Daily cron outcomes over the last 7 days + average run duration (ms). */
export interface CronDay {
  date: string; // ISO date
  success: number;
  failed: number;
  avgMs: number;
}
export const CRON_HISTORY: CronDay[] = [
  { date: "2026-07-31", success: 8, failed: 0, avgMs: 1490 },
  { date: "2026-08-01", success: 8, failed: 0, avgMs: 1360 },
  { date: "2026-08-02", success: 7, failed: 1, avgMs: 1720 },
  { date: "2026-08-03", success: 8, failed: 0, avgMs: 1280 },
  { date: "2026-08-04", success: 8, failed: 0, avgMs: 1550 },
  { date: "2026-08-05", success: 8, failed: 0, avgMs: 1410 },
  { date: "2026-08-06", success: 7, failed: 1, avgMs: 1630 },
];

/** Daily action volume split by actor role over the last 7 days. */
export interface ActivityDay {
  date: string; // ISO date
  borrower: number;
  staff: number;
  supervisor: number;
  admin: number;
}
export const ACTIVITY_BY_ROLE: ActivityDay[] = [
  { date: "2026-07-31", borrower: 62, staff: 41, supervisor: 12, admin: 8 },
  { date: "2026-08-01", borrower: 55, staff: 38, supervisor: 9, admin: 6 },
  { date: "2026-08-02", borrower: 34, staff: 22, supervisor: 5, admin: 4 },
  { date: "2026-08-03", borrower: 71, staff: 45, supervisor: 14, admin: 9 },
  { date: "2026-08-04", borrower: 88, staff: 52, supervisor: 17, admin: 11 },
  { date: "2026-08-05", borrower: 79, staff: 48, supervisor: 15, admin: 10 },
  { date: "2026-08-06", borrower: 94, staff: 57, supervisor: 19, admin: 13 },
];

/** Most active accounts by action count (last 30 days). */
export interface UserActivity {
  name: string;
  role: Role;
  actions: number;
}
export const TOP_ACTIVE_USERS: UserActivity[] = [
  { name: "ธนพล เจ้าหน้าที่ IT", role: "admin", actions: 142 },
  { name: "นพดล ยิ่งยง", role: "staff", actions: 118 },
  { name: "สมชาย พร้อมเจริญ", role: "staff", actions: 103 },
  { name: "ผศ.ดร. อรวรรณ ภักดี", role: "supervisor", actions: 87 },
  { name: "วรรณพร ทองดี", role: "borrower", actions: 64 },
  { name: "สุนิสา แก้วประเสริฐ", role: "staff", actions: 59 },
];

/** Monthly loan activity across the semester. */
export interface LoanTrendPoint {
  month: string; // short label, e.g. "มี.ค."
  loans: number;
  returns: number;
  overdue: number;
}
export const LOANS_TREND: LoanTrendPoint[] = [
  { month: "มี.ค.", loans: 182, returns: 171, overdue: 11 },
  { month: "เม.ย.", loans: 143, returns: 138, overdue: 9 },
  { month: "พ.ค.", loans: 96, returns: 94, overdue: 4 },
  { month: "มิ.ย.", loans: 214, returns: 198, overdue: 16 },
  { month: "ก.ค.", loans: 276, returns: 249, overdue: 21 },
  { month: "ส.ค.", loans: 231, returns: 205, overdue: 18 },
];
