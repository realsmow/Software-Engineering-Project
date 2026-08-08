/**
 * วาระ ว-10 · สถานะส่งออกเป็นสตริงคงที่ ไม่ใช่เลข key
 * ปลายทางจริง: packages/contract/src/schemas/status.schema.ts
 * (ทางเลือก ก. — schema ที่สองฝั่งใช้ร่วมกันอยู่ในแพ็กเกจกลาง ไม่ใช่ใน backend)
 *
 * บริบทที่ทำให้ไฟล์นี้จำเป็น:
 *   schema.prisma มี 32 model และ 0 enum — สถานะทุกชนิดเป็น "ตารางแยก"
 *   (ApproveStatus, ResourceStatus, ConditionType, NotificationType,
 *    PenaltyType, GroupType และแม้แต่ RoleInfo)
 *   ขณะที่ frontend/src/types/domain.ts นิยามไว้เป็นสตริง
 *
 * ทำไมห้ามส่งเลข key ออกไป:
 *   ApproveStatusKey = 2 หมายถึง "อนุมัติแล้ว" บนเครื่องหนึ่ง แต่ถ้าอีกเครื่อง
 *   seed คนละลำดับ เลข 2 อาจกลายเป็น "ปฏิเสธ" โค้ด if (status === 2) จะ
 *   compile ผ่านทุกครั้งและผิดเงียบ ๆ — เป็นบั๊กที่จะเจอตอนสาธิตงาน
 *
 * TODO(ที่ประชุม ว-10): ยืนยันรายการค่าของแต่ละสถานะให้ครบ frontend ต้องเขียน UI
 * ครอบคลุมทุกค่า ค่าที่อยู่ในไฟล์นี้เป็นร่างจาก types/domain.ts + ชื่อตารางใน schema
 */

import { z } from 'zod';

/** สถานะคำขอ/การอนุมัติ — มาจากตาราง ApproveStatus */
export const approveStatus = z.enum([
  'pending', // รออนุมัติ
  'approved', // อนุมัติแล้ว
  'rejected', // ปฏิเสธ
  'cancelled', // ผู้ขอยกเลิกเอง
  'expired', // คำขอหมดอายุ (cron รายชั่วโมง)
]);
export type ApproveStatus = z.infer<typeof approveStatus>;

/** สถานะของอุปกรณ์รายชิ้น — มาจากตาราง ResourceStatus */
export const resourceStatus = z.enum([
  'available',
  'reserved',
  'borrowed',
  'maintenance',
  'lost',
]);
export type ResourceStatus = z.infer<typeof resourceStatus>;

/** บทบาทผู้ใช้ — มาจากตาราง RoleInfo (ไม่ใช่ enum) */
export const userRole = z.enum(['borrower', 'staff', 'supervisor', 'admin']);
export type UserRole = z.infer<typeof userRole>;

/** ระดับเครดิต — มาจากตาราง CreditTier (CreditMin/CreditMax) */
export const creditTier = z.enum(['D0', 'D1', 'D2', 'D3']);
export type CreditTier = z.infer<typeof creditTier>;

/**
 * ตัวช่วยแปลงจากแถวในตารางเป็นสตริงคงที่
 *
 * ตั้งใจให้ throw เมื่อเจอค่าที่ไม่รู้จัก แทนที่จะคืนค่าปริยายเงียบ ๆ
 * เพราะถ้ามีคนเพิ่มแถวใหม่ในตารางสถานะแล้วลืมแก้ที่นี่ เราอยากรู้ทันที
 * ไม่ใช่ปล่อยให้ frontend ได้ค่าที่แสดงผลไม่ถูก
 */
export function mapStatus<T extends string>(
  schema: z.ZodEnum<Record<string, T>>,
  raw: string,
  field: string,
): T {
  const result = schema.safeParse(raw.toLowerCase());
  if (!result.success) {
    throw new Error(
      `ค่า "${raw}" ของ ${field} ไม่อยู่ในรายการที่สัญญากำหนด — ` +
        `เพิ่มค่านี้ใน status.schema.ts และแจ้ง frontend ก่อน (ดู ว-04)`,
    );
  }
  return result.data;
}
