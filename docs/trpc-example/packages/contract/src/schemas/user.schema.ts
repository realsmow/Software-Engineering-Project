/**
 * วาระ ว-09 · output พูดภาษา frontend และห้ามส่ง Prisma model ตรง ๆ
 * ปลายทางจริง: packages/contract/src/schemas/user.schema.ts
 * (ทางเลือก ก. — schema ที่สองฝั่งใช้ร่วมกันอยู่ในแพ็กเกจกลาง ไม่ใช่ใน backend)
 *
 * เขียน schema กลางของแต่ละ entity ไว้ที่เดียว แล้ว procedure อื่น ๆ เอาไป
 * .pick() / .omit() / .extend() ต่อ — ไม่ต้องเขียนซ้ำทุก procedure
 */

import { z } from 'zod';
import { creditTier, userRole } from './status.schema';

/**
 * ผู้ใช้ในสายตาของ frontend
 *
 * เทียบกับตาราง AccountInfo ในฐานข้อมูล:
 *   AccountKey     -> id
 *   UserID         -> studentId
 *   UserFName      -> firstName
 *   UserLName      -> lastName
 *   UserCredit     -> creditScore
 *   HashedPassword -> ไม่มี และหลุดออกไปโดยบังเอิญไม่ได้ เพราะไม่ได้ประกาศไว้ที่นี่
 */
export const userOutput = z.object({
  id: z.number().int(),
  studentId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.email(),
  role: userRole,
  facultyName: z.string().nullable(),

  // ---- เครดิต ----
  // ส่ง "ค่าที่คำนวณแล้ว" ไม่ใช่วัตถุดิบ: frontend ต้องไม่เปิดตารางเทียบเอง
  // ว่าคะแนนเท่านี้ยืมได้กี่วัน เพราะนั่นคือกฎธุรกิจที่ต้องอยู่ฝั่ง backend ที่เดียว
  creditScore: z.number().int(),
  creditTier,
  /** เพดานวันยืมของระดับเครดิตปัจจุบัน (BorrowConstraints.MaxBorrowDate) */
  maxBorrowDays: z.number().int().positive(),
  /** จำนวนครั้งที่ต่ออายุได้ (BorrowConstraints.MaxExtendTime) */
  maxExtendTimes: z.number().int().min(0),
});

export type UserOutput = z.infer<typeof userOutput>;

/** ใช้ในรายการที่ต้องการแค่ชื่อ เช่น "ผู้อนุมัติ" ในหน้าประวัติ */
export const userSummaryOutput = userOutput.pick({
  id: true,
  firstName: true,
  lastName: true,
  role: true,
});

export type UserSummaryOutput = z.infer<typeof userSummaryOutput>;
