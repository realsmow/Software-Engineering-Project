/**
 * ปลายทางจริง: backend-preview/backend/src/auth/auth.service.ts
 *
 * แสดงสองอย่าง:
 *   1. select เฉพาะฟิลด์ที่ต้องใช้ ไม่ดึงทั้งแถว (AccountInfo มี HashedPassword)
 *   2. กฎเครดิตอยู่ที่นี่ที่เดียว — frontend ได้รับ "เพดานวันยืม" เป็นค่าสำเร็จรูป
 *      ไม่ใช่ได้คะแนนดิบไปเปิดตารางเทียบเอง
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { toUserOutput, type BorrowLimits } from '../common/mappers/user.mapper';
import type { UserOutput } from '../common/schemas/user.schema';
import type { CreditTier } from '../common/schemas/status.schema';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(accountKey: number): Promise<UserOutput> {
    const row = await this.prisma.accountInfo.findUniqueOrThrow({
      where: { AccountKey: accountKey },
      select: {
        AccountKey: true,
        UserID: true,
        UserFName: true,
        UserLName: true,
        Email: true,
        UserCredit: true,
        Role: { select: { RoleName: true } },
        // HashedPassword ไม่ได้ถูก select — หลุดออกไปไม่ได้แม้จะเผลอ
      },
    });

    return toUserOutput(row, await this.resolveBorrowLimits(row.UserCredit));
  }

  /**
   * แปลงคะแนนเครดิตเป็นเพดานการยืม
   *
   * เครดิตต่ำไม่ได้แปลว่า "ยืมไม่ได้" แต่แปลว่า "ยืมได้สั้นลง" — ในสคีมา
   * CreditTier (CreditMin/CreditMax) จับคะแนนเป็นระดับ แล้วระดับไปคู่กับกฎการยืม
   * ในตาราง BorrowConstraints ซึ่งเก็บ MaxBorrowDate กับ MaxExtendTime
   *
   * สิ่งที่กันไม่ให้ยืมเป็นคนละกลไก คือตาราง Eligibility และ MinimumAuthorityLevel
   */
  private async resolveBorrowLimits(creditScore: number): Promise<BorrowLimits> {
    const tier = await this.prisma.creditTier.findFirstOrThrow({
      where: {
        CreditMin: { lte: creditScore },
        CreditMax: { gte: creditScore },
      },
      select: {
        CreditTierName: true,
        BorrowConstraints: {
          // TODO(backend): กฎการยืมต่างกันตามประเภทของ ดังนั้นค่าที่คืนตรงนี้เป็น
          // "ค่าทั่วไป" สำหรับแสดงในหน้าโปรไฟล์ ส่วนตอนยืมจริงต้องหาตาม
          // BorrowRuleKey ของของชิ้นนั้น
          take: 1,
          select: { MaxBorrowDate: true, MaxExtendTime: true },
        },
      },
    });

    const constraint = tier.BorrowConstraints[0];
    return {
      creditTier: (tier.CreditTierName ?? 'D0') as CreditTier,
      maxBorrowDays: constraint?.MaxBorrowDate ?? 7,
      maxExtendTimes: constraint?.MaxExtendTime ?? 0,
    };
  }
}
