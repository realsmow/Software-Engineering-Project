/**
 * วาระ ว-06 · รายการรหัสข้อผิดพลาดทางธุรกิจ
 * ปลายทางจริง: packages/contract/src/errors/error-codes.ts
 * (อยู่ในแพ็กเกจกลางเพราะ frontend ต้องใช้ map เป็นข้อความไทย — ดู error-messages.ts)
 *
 * ไฟล์นี้คือ "สัญญาอีกครึ่งหนึ่ง" ที่ทีมมักลืม — frontend ต้องเขียน UI รองรับ
 * แต่ละกรณี ถ้าไม่มีรายการตั้งแต่ต้น frontend จะเขียนได้แค่ "เกิดข้อผิดพลาด"
 * แล้วต้องกลับมาแก้ทีหลังทุกหน้า
 *
 * โครงสร้างสองชั้นตามข้อเสนอ ว-06:
 *   ชั้นนอก = รหัสมาตรฐานของ tRPC (UNAUTHORIZED / FORBIDDEN / NOT_FOUND /
 *             CONFLICT / BAD_REQUEST) — บอกว่า "ผิดประเภทไหน"
 *   ชั้นใน  = รหัสธุรกิจของเรา — บอกว่า "ผิดเรื่องอะไร" และพา data มาด้วย
 *
 * สิ่งที่ห้ามเด็ดขาด: backend ส่งข้อความภาษาไทยมาให้แสดงตรง ๆ
 * โปรเจกต์ลง i18next ไว้แล้ว ข้อความต้องอยู่ฝั่ง frontend ที่เดียว (ดู ว-14)
 */

/**
 * รหัสธุรกิจทั้งหมดของระบบ — เพิ่มที่นี่ที่เดียว แล้ว frontend จะ compile ฟ้อง
 * ทันทีว่ายังไม่มีข้อความรองรับรหัสใหม่ (ดู frontend/src/lib/error-messages.ts)
 *
 * หมายเหตุสำคัญ: ไม่มีรหัส "เครดิตต่ำจนยืมไม่ได้" เพราะกฎแบบนั้นไม่มีในระบบ
 * เครดิตกำหนดแค่ "จำนวนวันยืมสูงสุด" ผ่าน CreditTier -> BorrowConstraints
 * สิ่งที่กันไม่ให้ยืมคือ Eligibility (สังกัด x บทบาท x ของ) กับ MinimumAuthorityLevel
 */
export const BUSINESS_ERROR = {
  /** ยังไม่ได้ล็อกอิน หรือ session หมดอายุ */
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  /** ล็อกอินแล้วแต่บทบาทไม่มีสิทธิ์เรียก procedure นี้ */
  ROLE_NOT_ALLOWED: 'ROLE_NOT_ALLOWED',
  /** สังกัด/บทบาทนี้ยืมของชิ้นนี้ไม่ได้ (ตาราง Eligibility) */
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  /** ของหมด หรือถูกจองไปแล้ว */
  ITEM_UNAVAILABLE: 'ITEM_UNAVAILABLE',
  /** สล็อตเวลาของห้อง (T3) ถูกคนอื่นจองตัดหน้า */
  SLOT_TAKEN: 'SLOT_TAKEN',
  /** ขอยืมนานเกินเพดานของระดับเครดิตปัจจุบัน — ดู ว-06 ทางเลือก ก. */
  LOAN_PERIOD_EXCEEDS_LIMIT: 'LOAN_PERIOD_EXCEEDS_LIMIT',
  /** ต่ออายุครบจำนวนครั้งที่ระดับเครดิตอนุญาต (BorrowConstraints.MaxExtendTime) */
  EXTENSION_QUOTA_EXCEEDED: 'EXTENSION_QUOTA_EXCEEDED',
  /** มีคนตัดสินคำขอนี้ไปก่อนแล้ว */
  ALREADY_DECIDED: 'ALREADY_DECIDED',
  /** พ้นกำหนดยื่นอุทธรณ์ */
  APPEAL_WINDOW_CLOSED: 'APPEAL_WINDOW_CLOSED',
} as const;

export type BusinessErrorCode =
  (typeof BUSINESS_ERROR)[keyof typeof BUSINESS_ERROR];

/**
 * ข้อมูลประกอบที่แนบไปกับแต่ละรหัส
 *
 * นี่คือส่วนที่ทำให้ frontend ประกอบประโยคที่มีประโยชน์ได้ แทนที่จะบอกแค่
 * "ยืมไม่ได้" — เช่น "ระดับเครดิตของคุณยืมได้สูงสุด 7 วัน แต่คุณขอมา 14 วัน"
 *
 * การประกาศเป็น type ตรงนี้ทำให้ลืมแนบข้อมูลไม่ได้ compiler จะฟ้อง
 */
export interface BusinessErrorData {
  NOT_AUTHENTICATED: undefined;
  ROLE_NOT_ALLOWED: undefined;
  NOT_ELIGIBLE: { itemId: number };
  ITEM_UNAVAILABLE: { itemId: number; nextAvailableAt: string | null };
  SLOT_TAKEN: { roomId: number; startTime: string };
  LOAN_PERIOD_EXCEEDS_LIMIT: {
    /** เพดานวันยืมของระดับเครดิตปัจจุบัน (BorrowConstraints.MaxBorrowDate) */
    maxDays: number;
    /** จำนวนวันที่ผู้ใช้ขอมา */
    requestedDays: number;
    /** ระดับเครดิตที่ใช้คำนวณ เอาไว้อธิบายให้ผู้ใช้เข้าใจว่าทำไมถึงได้เท่านี้ */
    creditTier: string;
  };
  EXTENSION_QUOTA_EXCEEDED: { used: number; maxTimes: number };
  ALREADY_DECIDED: { decidedAt: string };
  APPEAL_WINDOW_CLOSED: { closedAt: string };
}
