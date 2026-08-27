import { TRPCClientError } from "@trpc/client";
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
  INVALID_CREDENTIALS: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
  EMAIL_ALREADY_REGISTERED: "อีเมลนี้ถูกใช้ลงทะเบียนแล้ว",
  NOT_AUTHENTICATED: "กรุณาเข้าสู่ระบบใหม่",
  ROLE_NOT_ALLOWED: "คุณไม่มีสิทธิ์เข้าถึงส่วนนี้",

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

  // File upload
  FILE_TOO_LARGE: "ไฟล์ใหญ่เกินไป (สูงสุด 5 MB)",
  INVALID_FILE_TYPE: "ไฟล์ต้องเป็นรูปภาพเท่านั้น (JPG, PNG)",

  // Generic
  VALIDATION_ERROR: "ข้อมูลที่กรอกไม่ถูกต้อง",
  NOT_FOUND: "ไม่พบข้อมูลที่ต้องการ",
  RATE_LIMIT: "คุณส่งคำขอถี่เกินไป กรุณารอสักครู่",
  SERVER_ERROR: "เกิดข้อผิดพลาดจากระบบ กรุณาลองใหม่",
  UNKNOWN_ERROR: "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ",
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return ERROR_MESSAGES[error.code] || error.message || ERROR_MESSAGES.UNKNOWN_ERROR;
  }
  /**
   * tRPC puts the backend's machine code in `message` (the routers throw
   * TRPCError with codes like INVALID_CREDENTIALS) and the HTTP-ish code in
   * `data.code`. Prefer the specific one, then fall back to the generic.
   */
  if (error instanceof TRPCClientError) {
    return (
      ERROR_MESSAGES[error.message] ||
      ERROR_MESSAGES[error.data?.code as string] ||
      ERROR_MESSAGES.UNKNOWN_ERROR
    );
  }
  if (error instanceof Error) {
    return error.message;
  }
  return ERROR_MESSAGES.UNKNOWN_ERROR;
}
