/**
 * วาระ ว-09 + ว-10 · ชั้นแปลงจากรูปร่างฐานข้อมูลเป็นรูปร่างของสัญญา
 * ปลายทางจริง: backend-preview/backend/src/common/mappers/user.mapper.ts
 *
 * ชั้นนี้ราคาไม่แพงแต่ซื้ออิสรภาพสองทาง:
 *   - เปลี่ยนชื่อคอลัมน์ในฐานข้อมูลได้โดยหน้าเว็บไม่พัง
 *   - คนทำ frontend ไม่ต้องรู้ว่าฐานข้อมูลตั้งชื่อยังไง
 *
 * ในรีโปนี้จำเป็นกว่าปกติ เพราะ schema ใช้ PascalCase และไม่มี enum เลยสักตัว
 */

import { mapStatus, userRole, type CreditTier } from '../schemas/status.schema';
import type { UserOutput } from '../schemas/user.schema';

/**
 * รูปร่างที่ mapper ต้องการ — ประกาศเองแทนที่จะ import type จาก Prisma
 *
 * ทำแบบนี้เพราะอยากให้ service เป็นคนเลือก select ให้พอดี ไม่ใช่ดึงทั้งแถวมา
 * (AccountInfo มี HashedPassword อยู่ในตารางเดียวกัน) และเพราะอยากให้เห็นชัด
 * ว่า mapper ต้องการข้อมูลอะไรบ้าง
 */
export interface AccountRow {
  AccountKey: number;
  UserID: string;
  UserFName: string;
  UserLName: string;
  Email: string;
  UserCredit: number;
  Role: { RoleName: string };
  Faculty?: { FacultyName: string } | null;
}

/** กฎการยืมที่ได้จาก CreditTier x BorrowRule — service เป็นคนไปหามาให้ */
export interface BorrowLimits {
  creditTier: CreditTier;
  /** BorrowConstraints.MaxBorrowDate */
  maxBorrowDays: number;
  /** BorrowConstraints.MaxExtendTime */
  maxExtendTimes: number;
}

export function toUserOutput(
  row: AccountRow,
  limits: BorrowLimits,
): UserOutput {
  return {
    id: row.AccountKey,
    studentId: row.UserID,
    firstName: row.UserFName,
    lastName: row.UserLName,
    email: row.Email,
    role: mapStatus(userRole, row.Role.RoleName, 'RoleInfo.RoleName'),
    facultyName: row.Faculty?.FacultyName ?? null,

    creditScore: row.UserCredit,
    creditTier: limits.creditTier,
    maxBorrowDays: limits.maxBorrowDays,
    maxExtendTimes: limits.maxExtendTimes,
  };
}
