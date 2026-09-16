/**
 * วาระ ว-07 + ว-08 + ว-09 + ว-10 มาบรรจบกันในไฟล์เดียว
 * ปลายทางจริง: backend/src/loan/loan.schema.ts
 *
 * ไฟล์นี้คือตัวอย่างว่า "สัญญาของหนึ่งโดเมน" หน้าตาเป็นอย่างไรเมื่อทุกมติถูกนำมาใช้:
 *   ว-07 แบ่งหน้าตามเลขหน้า           -> paginationInput / paginated()
 *   ว-08 เวลาเป็นสตริง ISO ใน UTC      -> isoDateTime / isoDate
 *   ว-09 output พูดภาษา frontend       -> camelCase ทั้งไฟล์
 *   ว-10 สถานะเป็นสตริงคงที่           -> approveStatus / resourceStatus
 */

import { z } from 'zod';
import {
  approveStatus,
  isoDate,
  isoDateTime,
  isoDateTimeNullable,
  paginated,
  paginationInput,
} from '@ulms/contract';

// ---------------------------------------------------------------------------
//  INPUT
// ---------------------------------------------------------------------------

/**
 * ขอยืมของ
 *
 * รับ "วันล้วน" ไม่ใช่เวลาเต็ม เพราะผู้ใช้เลือกจากปฏิทิน ส่วนเวลาครบกำหนดจริง
 * backend เป็นคนกำหนดด้วย DUE_TIME_OF_DAY_UTC - ห้ามให้ frontend ตัดสินใจ
 */
export const createLoanInput = z.object({
  itemId: z.number().int().positive(),
  startDate: isoDate,
  endDate: isoDate,
  note: z.string().trim().max(500).optional(),
});
export type CreateLoanInput = z.infer<typeof createLoanInput>;

/** รายการการยืมของตัวเอง - ต่อยอดจากรูปแบบแบ่งหน้ากลาง */
export const listLoansInput = paginationInput.extend({
  status: approveStatus.optional(),
  sort: z.enum(['dueAt', 'createdAt']).default('dueAt'),
});
export type ListLoansInput = z.infer<typeof listLoansInput>;

// ---------------------------------------------------------------------------
//  OUTPUT
// ---------------------------------------------------------------------------

export const loanSummaryOutput = z.object({
  id: z.number().int(),
  itemName: z.string(),
  serialNo: z.string().nullable(),
  status: approveStatus,
  checkoutAt: isoDateTimeNullable,
  dueAt: isoDateTime,
  returnedAt: isoDateTimeNullable,
  isOverdue: z.boolean(),
});
export type LoanSummaryOutput = z.infer<typeof loanSummaryOutput>;

export const listLoansOutput = paginated(loanSummaryOutput);

/**
 * ผลของการยืม
 *
 * จุดสำคัญ: ต้องคืน dueAt ที่ระบบให้จริง ไม่ใช่คืนแค่ "สำเร็จ" แล้วให้ frontend
 * เอาจำนวนวันของระดับเครดิตไปบวกเอง เพราะถ้า cron หักเครดิตระหว่างทาง
 * สองฝั่งจะคำนวณได้คนละคำตอบ แล้วผู้ใช้จะคืนของสาย
 *
 * grantedDays / requestedDays มีไว้รองรับกรณีที่ที่ประชุมเลือกทางเลือก ข. ของ ว-06
 * (ตัดวันยืมให้อัตโนมัติแทนที่จะปฏิเสธ) - ถ้าเลือกทางเลือก ก. สองฟิลด์นี้จะเท่ากันเสมอ
 * แต่คงไว้เพื่อให้ frontend แสดงผลได้เหมือนกันทั้งสองกรณี
 */
export const loanOutput = loanSummaryOutput.extend({
  requestedDays: z.number().int().positive(),
  grantedDays: z.number().int().positive(),
  extendTimesLeft: z.number().int().min(0),
});
export type LoanOutput = z.infer<typeof loanOutput>;
