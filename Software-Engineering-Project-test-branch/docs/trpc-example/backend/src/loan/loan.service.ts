/**
 * ตัวอย่าง "stub ที่คืนค่า mock ตาม output schema"
 * ปลายทางจริง: backend/src/loan/loan.service.ts
 *
 * นี่คือประโยชน์ที่แท้จริงของการทำสัญญาก่อน:
 *   หลังตกลง output schema แล้ว backend เขียนไฟล์นี้แบบคืนข้อมูลปลอมได้ทันที
 *   frontend ต่อหน้าจอได้เลยโดยไม่ต้องรอฐานข้อมูล และเมื่อ backend เปลี่ยนมาใช้
 *   ของจริง frontend ไม่ต้องแก้อะไรเลยถ้า output schema ไม่เปลี่ยน
 *
 * กติกาของ stub:
 *   1. ต้องคืนค่าที่ผ่าน output schema จริง ๆ ไม่ใช่ค่ามั่ว
 *   2. ต้องมี TODO ระบุว่าใครจะมาแทน และแทนด้วยอะไร
 *   3. ต้องจำลอง error ทางธุรกิจอย่างน้อยหนึ่งกรณี ไม่งั้น frontend จะลืมทำ UI รองรับ
 */

import { Injectable } from '@nestjs/common';
import { businessError } from '../common/errors/business-error';
import { toDueDate, toIso } from '@ulms/contract';
import type {
  CreateLoanInput,
  ListLoansInput,
  LoanOutput,
  LoanSummaryOutput,
} from './loan.schema';

@Injectable()
export class LoanService {
  // TODO(backend): inject PrismaService แล้วลบข้อมูลปลอมข้างล่างออก
  // constructor(private readonly prisma: PrismaService) {}

  async listForUser(accountKey: number, input: ListLoansInput) {
    // TODO(backend): prisma.usageLog.findMany({ where: { AccountKey: accountKey }, ...toPrismaPage(input) })
    void accountKey;

    const items: LoanSummaryOutput[] = [
      {
        id: 1,
        itemName: 'Canon EOS R5',
        serialNo: 'CAM-0007',
        status: 'approved',
        checkoutAt: '2569-08-06T02:00:00.000Z',
        dueAt: '2569-08-13T10:00:00.000Z',
        returnedAt: null,
        isOverdue: false,
      },
      {
        id: 2,
        itemName: 'ขาตั้งกล้อง Manfrotto',
        serialNo: null,
        status: 'pending',
        checkoutAt: null,
        dueAt: '2569-08-20T10:00:00.000Z',
        returnedAt: null,
        isOverdue: false,
      },
    ];

    return {
      items,
      total: items.length,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async getById(accountKey: number, id: number): Promise<LoanOutput> {
    void accountKey;
    return {
      id,
      itemName: 'Canon EOS R5',
      serialNo: 'CAM-0007',
      status: 'approved',
      checkoutAt: '2569-08-06T02:00:00.000Z',
      dueAt: '2569-08-13T10:00:00.000Z',
      returnedAt: null,
      isOverdue: false,
      requestedDays: 7,
      grantedDays: 7,
      extendTimesLeft: 1,
    };
  }

  async create(
    accountKey: number,
    input: CreateLoanInput,
  ): Promise<LoanOutput> {
    void accountKey;

    const requestedDays = daysBetween(input.startDate, input.endDate);

    // TODO(backend): อ่านคะแนนเครดิต "สด" จาก DB แล้วหา CreditTier ->
    // BorrowConstraints.MaxBorrowDate ของกฎการยืมที่ผูกกับของชิ้นนี้
    // อย่าใช้ค่าจาก ctx.user.creditScore เพราะ cron อาจหักเครดิตไประหว่างทาง
    const maxBorrowDays = 7;
    const creditTier = 'D2';

    // จำลองมติทางเลือก ก. ของ ว-06: ขอเกินเพดาน = ปฏิเสธ พร้อมบอกเพดาน
    // ถ้าที่ประชุมเลือกทางเลือก ข. (ตัดให้อัตโนมัติ) ให้เปลี่ยนบล็อกนี้เป็น
    //   const grantedDays = Math.min(requestedDays, maxBorrowDays);
    // แล้วคืน grantedDays ที่ต่างจาก requestedDays แทนการโยน error
    if (requestedDays > maxBorrowDays) {
      throw businessError('LOAN_PERIOD_EXCEEDS_LIMIT', {
        maxDays: maxBorrowDays,
        requestedDays,
        creditTier,
      });
    }

    const dueAt = toDueDate(input.endDate);

    return {
      id: 999,
      itemName: 'Canon EOS R5',
      serialNo: 'CAM-0007',
      status: 'pending',
      checkoutAt: null,
      dueAt: toIso(dueAt),
      returnedAt: null,
      isOverdue: false,
      requestedDays,
      grantedDays: requestedDays,
      extendTimesLeft: 2,
    };
  }

  async cancel(accountKey: number, id: number) {
    void accountKey;
    void id;
    // TODO(backend): ถ้าคำขอถูกตัดสินไปแล้ว ต้องโยน ALREADY_DECIDED
    return { ok: true as const };
  }
}

function daysBetween(startIsoDate: string, endIsoDate: string): number {
  const ms = Date.parse(`${endIsoDate}T00:00:00Z`) - Date.parse(`${startIsoDate}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000));
}
