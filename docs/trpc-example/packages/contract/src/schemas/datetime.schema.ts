/**
 * วาระ ว-08 · รูปแบบของวันที่และเวลา
 * ปลายทางจริง: packages/contract/src/schemas/datetime.schema.ts
 * (ทางเลือก ก. - schema ที่สองฝั่งใช้ร่วมกันอยู่ในแพ็กเกจกลาง ไม่ใช่ใน backend)
 *
 * สมมติว่าที่ประชุมเลือกตามข้อเสนอ: ส่งเป็น "สตริง ISO 8601 ใน UTC"
 *   ไม่ใช้ superjson เพราะต้องตั้งค่าให้ตรงกันเป๊ะสองฝั่ง ถ้าตั้งข้างเดียวจะพัง
 *   แบบอ่านสาเหตุไม่ออก ส่วนสตริง ISO เปิด Network tab แล้วอ่านออกทันที
 *   และ frontend มี date-fns อยู่แล้ว
 *
 * สิ่งที่สำคัญกว่าการเลือกแบบไหน คือ "ห้ามมีข้อยกเว้น" - procedure ที่ส่ง Date จริง
 * ปนกับ procedure ที่ส่งสตริง คือสถานการณ์ที่แย่ที่สุด เพราะ type จะบอกว่าถูกทั้งคู่
 *
 * ระบบนี้ "เวลา" คือแก่นของตรรกะธุรกิจ (กำหนดคืน การเลยกำหนด การหักเครดิตรายวัน
 * อายุบทลงโทษ) schema.prisma มีฟิลด์ DateTime กระจายอยู่ 9 ตารางหลัก
 */

import { z } from 'zod';

/**
 * เวลาแบบมีทั้งวันและเวลา เก็บและส่งเป็น UTC เสมอ แปลงเป็นเวลาไทยตอนแสดงผลเท่านั้น
 * ใช้กับ: CheckoutTime, CheckInTime, DueTime, ExpirationTime, ActionTime, SentTime
 */
export const isoDateTime = z.iso.datetime({ offset: false });

/** เวลาที่อาจว่างได้ เช่น CheckInTime ของรายการที่ยังไม่คืน */
export const isoDateTimeNullable = isoDateTime.nullable();

/**
 * วันล้วนไม่มีเวลา รูปแบบ YYYY-MM-DD
 * ใช้กับค่าที่ผู้ใช้เลือกจากปฏิทิน เช่น "อยากยืมวันไหนถึงวันไหน"
 *
 * เหตุผลที่แยกจาก isoDateTime: ถ้าให้ผู้ใช้ส่งเวลามาด้วย จะเกิดคำถามว่า
 * "ยืมวันที่ 20" หมายถึงกี่โมง แล้วแต่ละหน้าจะตอบไม่เหมือนกัน
 */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'ต้องอยู่ในรูปแบบ YYYY-MM-DD');

/**
 * เวลาตัดของ "ครบกำหนดคืน" - ต้องตกลงในที่ประชุมและใช้ค่าเดียวกันทั้งระบบ
 * cron "mark overdue" กับหน้าจอที่นับถอยหลังต้องใช้ค่านี้ตัวเดียวกัน
 * ไม่งั้นผู้ใช้จะเห็นว่า "ยังไม่เลยกำหนด" ขณะที่ระบบหักเครดิตไปแล้ว
 */
export const DUE_TIME_OF_DAY_UTC = '10:00:00'; // 17:00 น. เวลาไทย

/** แปลง Date ของ Prisma เป็นสตริงที่สัญญากำหนด ใช้ในทุก mapper */
export function toIso(value: Date): string {
  return value.toISOString();
}

export function toIsoNullable(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

/** แปลงวันล้วนที่รับจาก input ให้เป็นเวลาครบกำหนดที่ระบบใช้จริง */
export function toDueDate(isoDateOnly: string): Date {
  return new Date(`${isoDateOnly}T${DUE_TIME_OF_DAY_UTC}Z`);
}
