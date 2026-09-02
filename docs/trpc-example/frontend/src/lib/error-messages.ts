/**
 * วาระ ว-06 (+ ว-14 ล่วงหน้า) · แปลรหัสธุรกิจเป็นข้อความที่ผู้ใช้อ่านรู้เรื่อง
 * ปลายทางจริง: frontend/src/lib/error-messages.ts (รวมกับไฟล์เดิม)
 *
 * ทำไมข้อความอยู่ฝั่งนี้: โปรเจกต์ลง i18next + react-i18next ไว้แล้ว แปลว่า
 * ตั้งใจรองรับหลายภาษา ถ้า backend ส่งประโยคภาษาไทยมาให้แสดงตรง ๆ
 * ระบบหลายภาษาจะใช้ไม่ได้ทันที และข้อความจะกระจายอยู่ในโค้ดสองที่
 *
 * ประโยชน์ของการผูกกับ BusinessErrorCode: ถ้า backend เพิ่มรหัสใหม่แล้ว
 * frontend ยังไม่ได้เขียนข้อความรองรับ Record<> ตัวนี้จะ compile ไม่ผ่าน
 * - เป็นตัวอย่างที่ชัดที่สุดว่าสัญญาช่วยอะไร
 */

import type { BusinessErrorCode } from '@ulms/contract';

/** ข้อความคงที่ที่ไม่ต้องใช้ข้อมูลประกอบ */
const STATIC_MESSAGES: Record<BusinessErrorCode, string> = {
  NOT_AUTHENTICATED: 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง',
  ROLE_NOT_ALLOWED: 'บัญชีของคุณไม่มีสิทธิ์ทำรายการนี้',
  NOT_ELIGIBLE: 'สังกัดหรือบทบาทของคุณยืมอุปกรณ์ชิ้นนี้ไม่ได้',
  ITEM_UNAVAILABLE: 'อุปกรณ์ชิ้นนี้ถูกยืมหรือถูกจองไปแล้ว',
  SLOT_TAKEN: 'ช่วงเวลานี้เพิ่งถูกจองไป กรุณาเลือกช่วงเวลาใหม่',
  LOAN_PERIOD_EXCEEDS_LIMIT: 'จำนวนวันที่ขอยืมเกินสิทธิ์ของคุณ',
  EXTENSION_QUOTA_EXCEEDED: 'คุณใช้สิทธิ์ต่ออายุครบแล้ว',
  ALREADY_DECIDED: 'คำขอนี้ถูกตัดสินไปแล้ว',
  APPEAL_WINDOW_CLOSED: 'พ้นกำหนดยื่นอุทธรณ์แล้ว',
};

/**
 * ประกอบข้อความจากรหัส + ข้อมูลประกอบ
 *
 * สังเกตว่าข้อความของ LOAN_PERIOD_EXCEEDS_LIMIT ไม่ได้บอกว่า "ยืมไม่ได้"
 * แต่บอกว่า "ยืมได้กี่วัน" เพราะเครดิตต่ำไม่ได้ทำให้ยืมไม่ได้
 * มันทำให้ยืมได้สั้นลงเท่านั้น - ข้อความต้องสะท้อนกฎจริง ไม่งั้นผู้ใช้จะเข้าใจผิด
 * ว่าตัวเองถูกแบน
 */
export function formatBusinessError(
  code: BusinessErrorCode,
  data?: unknown,
): string {
  switch (code) {
    case 'LOAN_PERIOD_EXCEEDS_LIMIT': {
      const d = data as { maxDays: number; requestedDays: number } | undefined;
      if (!d) return STATIC_MESSAGES[code];
      return `ระดับเครดิตปัจจุบันของคุณยืมได้สูงสุด ${d.maxDays} วัน แต่คุณเลือกมา ${d.requestedDays} วัน กรุณาเลือกวันคืนใหม่`;
    }
    case 'EXTENSION_QUOTA_EXCEEDED': {
      const d = data as { used: number; maxTimes: number } | undefined;
      if (!d) return STATIC_MESSAGES[code];
      return `คุณต่ออายุไปแล้ว ${d.used} จาก ${d.maxTimes} ครั้งที่ระดับเครดิตของคุณอนุญาต`;
    }
    case 'ITEM_UNAVAILABLE': {
      const d = data as { nextAvailableAt: string | null } | undefined;
      if (!d?.nextAvailableAt) return STATIC_MESSAGES[code];
      return `อุปกรณ์ชิ้นนี้ถูกยืมอยู่ จะพร้อมให้ยืมอีกครั้งวันที่ ${formatThaiDate(d.nextAvailableAt)}`;
    }
    default:
      return STATIC_MESSAGES[code];
  }
}

/** เวลาที่มาจาก backend เป็นสตริง ISO ใน UTC เสมอ (ว-08) แปลงตอนแสดงผลเท่านั้น */
function formatThaiDate(iso: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(iso));
}
