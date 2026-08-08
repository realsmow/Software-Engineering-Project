/**
 * วาระ ว-03 · รูปร่างของ ctx.user และวิธีส่งข้อมูลยืนยันตัวตน
 * ปลายทางจริง: backend/src/trpc/context.ts
 *
 * สมมติว่าที่ประชุมเลือกตามข้อเสนอ:
 *   - ใช้ httpOnly cookie (frontend/src/lib/api-client.ts ตั้ง credentials:"include" ไว้แล้ว)
 *   - ctx.user มี 4 ฟิลด์: accountKey, role, facultyKey, creditScore
 *   - creditScore ใน ctx ใช้ "แสดงผล" เท่านั้น procedure ที่คำนวณวันยืมจริงต้องอ่านสดจาก DB
 *
 * ถ้าที่ประชุมตัดสินต่างจากนี้ ให้แก้ TrpcUser ที่นี่ที่เดียว แล้วทั้งระบบจะ compile ฟ้อง
 * ทุกจุดที่ต้องตามแก้ — นั่นคือประโยชน์ของการมีสัญญา
 */

import { Injectable } from '@nestjs/common';
import type { ContextOptions, TRPCContext } from 'nestjs-trpc';
import type { Request, Response } from 'express';
import type { UserRole } from '@ulms/contract';
import { PrismaService } from '../prisma.service';

/** ผู้ใช้ที่ล็อกอินแล้ว — รูปร่างนี้คือสิ่งที่ทุก procedure พึ่งพา */
export interface TrpcUser {
  /** AccountInfo.AccountKey */
  accountKey: number;
  /**
   * RoleInfo.RoleName แปลงเป็นสตริงคงที่แล้ว
   * ชนิดมาจาก @ulms/contract ไม่ประกาศซ้ำที่นี่ — ถ้าเพิ่มบทบาทใหม่ในสัญญา
   * ไฟล์นี้กับ middleware จะ compile ฟ้องให้เองว่ายังจัดการไม่ครบ
   */
  role: UserRole;
  /** FacultyInfo.FacultyKey — ใช้กับกฎการยืมที่ผูกกับสังกัด */
  facultyKey: number | null;
  /**
   * AccountInfo.UserCredit — ใช้แสดงผลเท่านั้น
   *
   * เครดิตไม่ได้กำหนดว่า "ยืมได้หรือไม่" แต่กำหนดว่า "ยืมได้กี่วัน" ผ่าน
   * CreditTier -> BorrowConstraints.MaxBorrowDate  ดังนั้น procedure ที่คำนวณ
   * วันครบกำหนดจริงต้องอ่านคะแนนสดจาก DB เพราะ cron อาจหักเครดิตระหว่างที่
   * ผู้ใช้กำลังกรอกคำขออยู่
   */
  creditScore: number;
}

export interface TrpcContext {
  req: Request;
  res: Response;
  /** null = ยังไม่ล็อกอิน — middleware เป็นคนตัดสินว่า procedure ไหนยอมให้ null ได้ */
  user: TrpcUser | null;
}

@Injectable()
export class AppContext implements TRPCContext {
  constructor(private readonly prisma: PrismaService) {}

  async create(opts: ContextOptions): Promise<TrpcContext> {
    const req = opts.req as Request;
    const res = opts.res as Response;

    return {
      req,
      res,
      user: await this.resolveUser(req),
    };
  }

  /**
   * แปลง "สิ่งที่มากับ HTTP" เป็น "สิ่งที่ตรรกะธุรกิจใช้ได้"
   * นี่คือด่านเดียวที่รู้จัก cookie — ที่อื่นในระบบเห็นแค่ ctx.user
   */
  private async resolveUser(req: Request): Promise<TrpcUser | null> {
    const token = req.cookies?.['ulms_session'];
    if (!token) return null;

    const accountKey = await this.verifySessionToken(token);
    if (accountKey === null) return null;

    const account = await this.prisma.accountInfo.findUnique({
      where: { AccountKey: accountKey },
      // เลือกเฉพาะฟิลด์ที่ ctx ต้องใช้ — ห้ามดึงทั้งแถว เพราะ AccountInfo
      // มี HashedPassword อยู่ในตารางเดียวกัน
      select: {
        AccountKey: true,
        UserCredit: true,
        Role: { select: { RoleName: true } },
      },
    });
    if (!account) return null;

    return {
      accountKey: account.AccountKey,
      role: mapRoleName(account.Role.RoleName),
      facultyKey: null, // TODO(ว-03): ต่อกับ FacultyInfo เมื่อ schema ฝั่งนั้นนิ่ง
      creditScore: account.UserCredit,
    };
  }

  /** TODO(backend): แทนที่ด้วยการตรวจ session/JWT จริง */
  private async verifySessionToken(_token: string): Promise<number | null> {
    return null;
  }
}

/**
 * RoleInfo เป็น "ตาราง" ไม่ใช่ enum (schema.prisma ไม่มี enum เลยสักตัว)
 * จึงต้องแปลงเป็นสตริงคงที่ตรงนี้ ห้ามปล่อยเลข RoleKey ออกไปนอกชั้นนี้ — ดู ว-10
 */
function mapRoleName(roleName: string): UserRole {
  switch (roleName.toLowerCase()) {
    case 'student':
    case 'borrower':
      return 'borrower';
    case 'staff':
      return 'staff';
    case 'professor':
    case 'supervisor':
      return 'supervisor';
    case 'admin':
      return 'admin';
    default:
      throw new Error(`ไม่รู้จัก RoleName "${roleName}" — เพิ่มการแปลงใน mapRoleName`);
  }
}
