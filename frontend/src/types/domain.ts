/**
 * Core domain types for ULMs
 * ตรงกับ schema ฝั่ง backend (Prisma) - sync กันเป็นระยะ
 */

// ==================== User & Role ====================
export type Role = "borrower" | "staff" | "supervisor" | "admin";

export interface User {
  id: string;
  studentId: string;
  name: string;
  email: string; // @ku.th
  role: Role;
  departmentId: string;
  creditScore: number;
  creditBand: CreditBand;
}

// ==================== Credit System ====================
export type CreditBand = "D0" | "D1" | "D2" | "D3";

export interface CreditBandConfig {
  band: CreditBand;
  min: number;
  max: number;
  loanDays: number;
  label: string; // "ดี", "เฝ้าระวัง", "เสี่ยง", "เสี่ยงสูง"
}

// ==================== Equipment ====================
export type Tier = "T0" | "T1" | "T2" | "T3";

export type UnitStatus =
  | "available"
  | "reserved"
  | "borrowed"
  | "maintenance"
  | "lost";

export interface EquipmentType {
  id: string;
  name: string;
  categoryId: string;
  tier: Tier;
  imageUrl?: string;
  creditWeight: number; // 0, 5, 10, 0
  prepDays: number;
  totalUnits: number;
  availableUnits: number;
  nextAvailableAt?: string; // ISO datetime
  /**
   * ResourceInfo.AllowBorrow - whether this item is open for borrowing at all
   * (distinct from ResourceStatus). Defaults to false backend-side; catalog
   * filters out `false`. Optional here until the backend supplies it.
   */
  allowBorrow?: boolean;
}

export interface EquipmentUnit {
  id: string;
  typeId: string;
  serialNo: string; // สำหรับ T1-T2
  status: UnitStatus;
  nextAvailableAt?: string;
}

// ==================== Loan Request & Loan ====================
export type RequestStatus =
  | "draft"
  | "requested"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired";

export type LoanStatus =
  | "allocated"
  | "borrowed"
  | "returned"
  | "overdue"
  | "lost";

export interface LoanRequest {
  id: string;
  borrowerId: string;
  status: RequestStatus;
  submittedAt: string;
  pickupDeadline: string;
  items: LoanRequestItem[];
}

export interface LoanRequestItem {
  id: string;
  requestId: string;
  typeId: string;
  quantity: number;
  serialNo?: string; // ถ้าเลือกเจาะจง (T2)
  slotStart?: string; // T3
  slotEnd?: string; // T3
  approvalStatus: "pending" | "approved" | "rejected";
}

export interface Loan {
  id: string;
  requestItemId: string;
  unitId: string;
  borrowerId: string;
  pickedUpAt: string;
  dueAt: string;
  returnedAt?: string;
  status: LoanStatus;
  onlineRenewLeft: number;
}

// ==================== Damage & Appeal ====================
export type DamageLevel = "B0" | "B1" | "B2" | "B3";

export interface DamageReport {
  id: string;
  loanId: string;
  level: DamageLevel;
  weight: number; // 0, 1, 3, 5
  photoUrls: string[];
  reportedBy: string; // staff user id
  reportedAt: string;
}

export interface Appeal {
  id: string;
  damageReportId: string;
  reason: string;
  status: "pending" | "accepted" | "rejected";
  decidedBy?: string;
  decidedAt?: string;
}

// ==================== Demerit (Credit Deduction) ====================
export type DemeritCause = "damage" | "late" | "lost";
export type DemeritStatus = "active" | "expired" | "revoked";

export interface DemeritEvent {
  id: string;
  userId: string;
  cause: DemeritCause;
  points: number;
  effectiveAt: string;
  startsCountingAt: string;
  expiresAt: string;
  status: DemeritStatus;
}

// ==================== Notification ====================
export type NotificationType =
  | "request_approved"
  | "request_rejected"
  | "pickup_reminder"
  | "due_soon"
  | "overdue"
  // The caution raised when a penalty docks the borrower's credit (§5.7).
  // Distinct from `overdue`: being late is the event, losing points is the
  // consequence, and they can arrive days apart - the penalty's clock only
  // starts once the item is actually back.
  | "credit_deducted"
  | "appeal_result";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
  linkTo?: string;
}

// ==================== API Response Envelope ====================
export interface PaginatedResponse<T> {
  data: T[];
  nextCursor?: string;
  total: number;
}

export interface ApiError {
  code: string; // เช่น "CONFLICT_UNIT_TAKEN", "INSUFFICIENT_CREDIT"
  message: string; // ข้อความไทย
  details?: Record<string, unknown>;
}
