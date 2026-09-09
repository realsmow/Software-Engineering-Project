import { ApiClientError } from "./api-client";

/**
 * แปลง error code จาก backend เป็นข้อความไทยที่ user เข้าใจ
 * Backend ส่ง code มา frontend แสดงข้อความ (i18n-friendly)
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Auth
  UNAUTHORIZED: "กรุณาเข้าสู่ระบบใหม่",
  FORBIDDEN: "คุณไม่มีสิทธิ์เข้าถึงส่วนนี้",
  INVALID_DOMAIN: "รองรับเฉพาะอีเมล @ku.th เท่านั้น",

  // Loan request
  CONFLICT_UNIT_TAKEN: "อุปกรณ์ชิ้นนี้ถูกยืมไปแล้ว กรุณาเลือกใหม่",
  INSUFFICIENT_CREDIT: "เครดิตของคุณไม่เพียงพอสำหรับการยืมนี้",
  ELIGIBILITY_NOT_MET: "คุณไม่ตรงเงื่อนไขการยืมอุปกรณ์นี้",
  MAX_CONCURRENT_EXCEEDED: "คุณมีของค้างอยู่เกินจำนวนที่กำหนด",
  ALREADY_HAS_PENDING: "คุณมีคำขอที่รออนุมัติอยู่แล้ว",

  // Booking / Reservation
  SLOT_UNAVAILABLE: "ช่วงเวลานี้ไม่ว่างแล้ว",
  RESERVATION_TOO_FAR: "จองล่วงหน้าได้ไม่เกิน 3 เดือน",

  // Renewal
  RENEWAL_LIMIT_REACHED: "คุณต่ออายุออนไลน์ครบแล้ว ต้องนำอุปกรณ์มาให้เจ้าหน้าที่ตรวจ",
  RENEWAL_REQUIRES_SUPERVISOR: "การต่ออายุนี้ต้องได้รับอนุมัติจากอาจารย์",

  // Pickup / Return
  PICKUP_EXPIRED: "หมดเวลารับของแล้ว คำขอถูกยกเลิก",
  ALREADY_RETURNED: "อุปกรณ์นี้ถูกคืนไปแล้ว",

  // Backend business error codes (ว-06). Aliased to the same user-facing copy
  // as the frontend codes above so either spelling resolves correctly.
  ITEM_UNAVAILABLE: "อุปกรณ์ชิ้นนี้ถูกยืมไปแล้ว กรุณาเลือกใหม่", // → CONFLICT_UNIT_TAKEN
  SLOT_TAKEN: "ช่วงเวลานี้ไม่ว่างแล้ว", // → SLOT_UNAVAILABLE
  WINDOW_NOT_AVAILABLE: "ช่วงเวลานี้ไม่ว่างแล้ว", // → SLOT_UNAVAILABLE
  TRANSACTION_CONFLICT: "ตอนนี้มีคนจองพร้อมกันหลายคน กรุณากดใหม่อีกครั้ง",
  SLOT_LIMIT_EXCEEDED: "จองห้อง/สล็อตพร้อมกันได้ไม่เกิน 2 รายการ",
  NOT_ELIGIBLE: "คุณไม่ตรงเงื่อนไขการยืมอุปกรณ์นี้", // → ELIGIBILITY_NOT_MET
  ALREADY_DECIDED: "คำขอนี้ถูกดำเนินการไปแล้ว ไม่สามารถแก้ไขได้",
  SERIAL_REQUIRED_FOR_TIER: "อุปกรณ์ระดับนี้ต้องระบุหมายเลขประจำอุปกรณ์",
  BULK_NOT_ALLOWED_FOR_TIER:
    "อุปกรณ์ระดับ T2 ลงทะเบียนได้ครั้งละ 1 ชิ้น เพราะแต่ละชิ้นผูกกับหมายเลขจริงบนตัวอุปกรณ์",
  LOAN_PERIOD_EXCEEDS_LIMIT: "ระยะเวลายืมเกินสิทธิ์ที่คุณได้รับ",
  EXTENSION_QUOTA_EXCEEDED: "คุณต่ออายุออนไลน์ครบแล้ว ต้องนำอุปกรณ์มาให้เจ้าหน้าที่ตรวจ", // → RENEWAL_LIMIT_REACHED
  APPEAL_WINDOW_CLOSED: "หมดเวลายื่นอุทธรณ์สำหรับรายการนี้แล้ว",

  // Staff counter (loan.*) - written for someone reading this with a student
  // standing in front of them, so each one says what to do next.
  WRONG_LOAN_STATE:
    "รายการนี้ถูกดำเนินการไปแล้ว (อาจมีเจ้าหน้าที่อีกคนทำไปก่อน) กรุณารีเฟรชคิว",
  LOAN_NOT_FOUND: "ไม่พบรายการยืมนี้ อาจถูกยกเลิกหรือดำเนินการไปแล้ว",
  RESERVATION_NOT_FOUND: "ไม่พบคำขอนี้ อาจถูกยกเลิกไปแล้ว",
  RESOURCE_NOT_FOUND: "ไม่พบอุปกรณ์ชิ้นนี้ในระบบ",
  NOT_APPROVED_YET: "คำขอนี้ยังไม่ผ่านการอนุมัติ จึงยังจัดเตรียมไม่ได้",
  NOT_YET_LOST: "ยังไม่ถึงกำหนดที่จะบันทึกว่าสูญหาย (ต้องเกินกำหนดคืน 2 สัปดาห์)",
  UNIT_DOES_NOT_MATCH_REQUEST: "หมายเลขอุปกรณ์ที่เลือกไม่ตรงกับที่ผู้ยืมขอไว้",
  UNIT_SWAP_NOT_ALLOWED: "อุปกรณ์ระดับนี้เปลี่ยนตัวเครื่องที่เคาน์เตอร์ไม่ได้",
  TIER_NOT_CONFIGURED: "ยังไม่ได้ตั้งค่าระดับการยืมของอุปกรณ์นี้ กรุณาแจ้งผู้ดูแลระบบ",
  NO_MANAGEMENT_SCOPE: "คุณไม่ได้ดูแลหน่วยงานที่เป็นเจ้าของอุปกรณ์นี้",

  // Approval desk (approval.*)
  CANNOT_APPROVE_OWN_REQUEST: "คุณอนุมัติคำขอของตัวเองไม่ได้",
  APPROVAL_NEEDS_SUPERVISOR: "คำขอนี้ต้องให้อาจารย์เป็นผู้อนุมัติ",
  // WINDOW_NOT_AVAILABLE is already defined above with the slot codes.
  BORROWING_SUSPENDED: "บัญชีของคุณถูกระงับสิทธิ์การยืมชั่วคราว กรุณาติดต่อเจ้าหน้าที่ภาควิชา",
  CREDIT_TOO_LOW: "เครดิตของผู้ยืมไม่ถึงเกณฑ์สำหรับรายการนี้",
  INVALID_BORROW_WINDOW: "ช่วงเวลาที่ขอยืมไม่ถูกต้อง",
  CANNOT_CANCEL: "คำขอนี้ยกเลิกไม่ได้แล้ว",
  EXTENSION_NOT_FOUND: "ไม่พบคำขอต่ออายุนี้",
  EXTENSION_NEEDS_SUPERVISOR: "การต่ออายุนี้ต้องได้รับอนุมัติจากอาจารย์",
  TOO_MANY_ATTEMPTS: "พยายามหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่",

  // File upload
  FILE_TOO_LARGE: "ไฟล์ใหญ่เกินไป (สูงสุด 5 MB)",
  INVALID_FILE_TYPE: "ไฟล์ต้องเป็นรูปภาพเท่านั้น (JPG, PNG)",

  // Session and account state
  NOT_AUTHENTICATED: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
  ROLE_NOT_ALLOWED: "บัญชีของคุณไม่มีสิทธิ์ใช้งานส่วนนี้",
  INVALID_CREDENTIALS: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
  ACCOUNT_DISABLED: "บัญชีนี้ถูกระงับการเข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ",

  // Accounts (admin)
  USER_NOT_FOUND: "ไม่พบบัญชีผู้ใช้นี้",
  AUDIT_EVENT_NOT_FOUND: "ไม่พบรายการบันทึกนี้",
  EMAIL_ALREADY_IN_USE: "อีเมลนี้ถูกใช้กับบัญชีอื่นแล้ว",
  USER_ID_ALREADY_IN_USE: "รหัสผู้ใช้นี้ถูกใช้กับบัญชีอื่นแล้ว",
  CANNOT_MODIFY_SELF: "คุณแก้ไขบทบาทหรือระงับบัญชีของตัวเองไม่ได้",

  // Departmental scope (staff)
  OUT_OF_MANAGEMENT_SCOPE: "อุปกรณ์ชิ้นนี้อยู่นอกหน่วยงานที่คุณดูแล",
  ITEM_NOT_FOUND: "ไม่พบอุปกรณ์นี้",
  ITEM_TYPE_NOT_FOUND: "ไม่พบประเภทอุปกรณ์นี้",
  ROOM_NOT_FOUND: "ไม่พบสถานที่นี้",
  BORROW_RULE_NOT_FOUND: "ไม่พบกฎการยืมนี้",
  SERIAL_ALREADY_IN_USE: "หมายเลขเครื่องนี้ถูกใช้กับอุปกรณ์ชิ้นอื่นแล้ว",
  RESOURCE_IN_USE: "อุปกรณ์อยู่กับผู้ยืม ต้องรับคืนก่อนจึงจะดำเนินการนี้ได้",

  // Inspection
  INSPECTION_NOT_FOUND: "ไม่พบผลการตรวจสภาพนี้",
  ALREADY_INSPECTED: "รายการนี้ถูกตรวจสภาพไปแล้ว หากไม่เห็นด้วยต้องยื่นอุทธรณ์",

  // Approval queue
  ALREADY_AUTO_APPROVED: "ระบบอนุมัติคำขอนี้ให้อัตโนมัติแล้ว ไม่ต้องตัดสินอีก",

  // Notifications
  NOTIFICATION_NOT_FOUND: "ไม่พบการแจ้งเตือนนี้",

  // File upload
  UPLOAD_TICKET_INVALID: "ลิงก์อัปโหลดหมดอายุหรือไม่ถูกต้อง กรุณาลองใหม่",
  UPLOAD_TYPE_MISMATCH: "ชนิดไฟล์ไม่ตรงกับที่ขออัปโหลดไว้",
  UPLOAD_TOO_LARGE: "ไฟล์ใหญ่เกินกว่าที่กำหนด",
  UPLOAD_EMPTY: "ไฟล์ว่างเปล่า",
  UPLOAD_ALREADY_STORED: "ไฟล์นี้ถูกอัปโหลดไปแล้ว",
  UPLOAD_NOT_AN_IMAGE: "ไฟล์นี้ไม่ใช่รูปภาพ",
  UPLOAD_REJECTED: "อัปโหลดไม่สำเร็จ กรุณาลองใหม่",

  // Configuration problems - not the user's fault, and they cannot fix them,
  // so each one says who can.
  ROLE_NOT_CONFIGURED: "ระบบยังไม่ได้ตั้งค่าบทบาทนี้ กรุณาแจ้งผู้ดูแลระบบ",
  CREDIT_TIER_NOT_CONFIGURED: "ระบบยังไม่ได้ตั้งค่าระดับเครดิตที่ครอบคลุมคะแนนนี้ กรุณาแจ้งผู้ดูแลระบบ",
  NOT_IMPLEMENTED: "ฟังก์ชันนี้ยังไม่เปิดใช้งาน",

  // TRANSACTION_CONFLICT is already defined above with the booking codes.

  // Generic
  VALIDATION_ERROR: "ข้อมูลที่กรอกไม่ถูกต้อง",
  NOT_FOUND: "ไม่พบข้อมูลที่ต้องการ",
  RATE_LIMIT: "คุณส่งคำขอถี่เกินไป กรุณารอสักครู่",
  SERVER_ERROR: "เกิดข้อผิดพลาดจากระบบ กรุณาลองใหม่",
  UNKNOWN_ERROR: "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ",
};

/**
 * Extract the business error code from any error shape we might receive:
 *   - ApiClientError (REST wrapper) → `.code`
 *   - TRPCClientError → business code carried in `.data.code` / `.data.businessCode`
 *     / `.shape.data.code`, or the tRPC status code (CONFLICT, NOT_FOUND, ...)
 *   - a bare string that is itself a known code
 * Duck-typed so we don't couple this module to @trpc/client types.
 */
export function extractErrorCode(error: unknown): string | undefined {
  if (error instanceof ApiClientError) return error.code;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const data = (e.data ?? (e.shape as Record<string, unknown>)?.data) as
      Record<string, unknown> | undefined;
    const candidate =
      (data?.businessCode as string | undefined) ??
      (data?.code as string | undefined) ??
      (e.code as string | undefined);
    if (typeof candidate === "string") return candidate;
  }
  return undefined;
}

/**
 * Structured payload attached to a business error (e.g. `{ itemId,
 * nextAvailableAt }`, `{ roomId, startTime }`, `{ decidedAt }`). Lets the UI
 * render specifics like the next-available time. Returns `undefined` if none.
 */
export function getErrorPayload(error: unknown): Record<string, unknown> | undefined {
  if (error instanceof ApiClientError) return error.details;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const data = (e.data ?? (e.shape as Record<string, unknown>)?.data) as
      Record<string, unknown> | undefined;
    const payload = (data?.payload ?? data?.cause ?? data) as
      Record<string, unknown> | undefined;
    return payload;
  }
  return undefined;
}

export function getErrorMessage(error: unknown): string {
  const code = extractErrorCode(error);
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (error instanceof ApiClientError) {
    return error.message || ERROR_MESSAGES.UNKNOWN_ERROR;
  }
  if (error instanceof Error) {
    return error.message || ERROR_MESSAGES.UNKNOWN_ERROR;
  }
  return ERROR_MESSAGES.UNKNOWN_ERROR;
}
