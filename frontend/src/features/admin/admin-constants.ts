/**
 * Shared admin view types and small lookups: departments (client-side name
 * lookup for the users table), account/audit shapes mirroring the server's
 * enums, and the avatar-initials helper.
 */
import type { Role } from "@/types/domain";

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

/**
 * Mirrors the server's accountStatus enum (backend/src/admin/admin.schema.ts).
 *
 * There is no "disabled": AccountInfo records nothing about an account whose
 * password was never set, so the server cannot report it and inventing it here
 * would put a state in the UI that no query can ever return.
 */
export type AccountStatus = "active" | "disabled";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  govId: string; // student / staff id
  role: Role;
  departmentId: string;
  auth: "ku" | "local";
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
