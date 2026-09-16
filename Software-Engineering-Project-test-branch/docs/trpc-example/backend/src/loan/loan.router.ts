/**
 * วาระ ว-05 · โครงและการตั้งชื่อ router กับ procedure
 * ปลายทางจริง: backend/src/loan/loan.router.ts
 *
 * สมมติว่าที่ประชุมยืนยันตามข้อเสนอ:
 *   - จัดกลุ่มตาม "โดเมน" (loan) ไม่ใช่ตามบทบาท (staff/supervisor)
 *   - คำกริยามาตรฐาน: list · getById · create · update · cancel · decide · confirm
 *   - คุมสิทธิ์ด้วย middleware ไม่ใช่ if ใน service
 *
 * กฎที่ compiler จับให้ไม่ได้ ต้องใช้คนรีวิว:
 *   ทุก @Query/@Mutation ต้องมีทั้ง input และ output
 *   ถ้าลืม output ฝั่ง frontend จะได้ type เป็น any แล้วทุกอย่างจะ "compile ผ่าน"
 *   โดยไม่มีการตรวจสอบเหลืออยู่เลย - เป็นความล้มเหลวที่เงียบที่สุดที่เป็นไปได้
 */

import {
  Ctx,
  Input,
  Mutation,
  Query,
  Router,
  UseMiddlewares,
} from 'nestjs-trpc';
import { z } from 'zod';
import type { TrpcContext } from '../trpc/context';
import { AuthMiddleware } from '../trpc/auth.middleware';
import { LoanService } from './loan.service';
import {
  createLoanInput,
  listLoansInput,
  listLoansOutput,
  loanOutput,
  type CreateLoanInput,
  type ListLoansInput,
} from './loan.schema';

@Router({ alias: 'loan' })
@UseMiddlewares(AuthMiddleware)
export class LoanRouter {
  constructor(private readonly loanService: LoanService) {}

  /** รายการที่กำลังยืมอยู่ + ประวัติ - frontend invalidate ตัวนี้หลังทุก action */
  @Query({ input: listLoansInput, output: listLoansOutput })
  list(@Input() input: ListLoansInput, @Ctx() ctx: TrpcContext) {
    return this.loanService.listForUser(ctx.user!.accountKey, input);
  }

  @Query({ input: z.object({ id: z.number().int() }), output: loanOutput })
  getById(@Input('id') id: number, @Ctx() ctx: TrpcContext) {
    return this.loanService.getById(ctx.user!.accountKey, id);
  }

  @Mutation({ input: createLoanInput, output: loanOutput })
  create(@Input() input: CreateLoanInput, @Ctx() ctx: TrpcContext) {
    return this.loanService.create(ctx.user!.accountKey, input);
  }

  @Mutation({
    input: z.object({ id: z.number().int() }),
    output: z.object({ ok: z.literal(true) }),
  })
  cancel(@Input('id') id: number, @Ctx() ctx: TrpcContext) {
    return this.loanService.cancel(ctx.user!.accountKey, id);
  }
}
