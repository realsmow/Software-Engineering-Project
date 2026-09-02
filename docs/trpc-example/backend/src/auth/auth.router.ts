/**
 * เส้นแรกที่ควรทำให้วิ่งครบ (vertical slice) - ภาค 5 ของ trpc-guide.tex
 * ปลายทางจริง: backend/src/auth/auth.router.ts
 *
 * ทำไมเลือก auth.me เป็น procedure ตัวแรก:
 *   ทุกหน้าใช้ และมันบังคับให้เราต้องแก้เรื่อง cookie, CORS, context และการ
 *   ขนส่งสัญญาไปพร้อมกัน - เจอปัญหาโครงสร้างทั้งหมดตั้งแต่ตัวแรก ตอนที่แก้แล้ว
 *   กระทบแค่ตัวเดียว แทนที่จะไปเจอตอนเขียนไปแล้ว 30 ตัว
 *
 * เกณฑ์ว่าเส้นนี้เสร็จ:
 *   เปิดหน้าที่ยังไม่ล็อกอิน -> เด้งไป /login -> ล็อกอิน -> เห็นชื่อจริงจาก DB
 *   และเมื่อลองเปลี่ยนชื่อฟิลด์ใน userOutput แล้วรัน tsc --noEmit ฝั่ง frontend
 *   "ต้องขึ้น error" - ประโยคหลังคือการทดสอบว่าสัญญาทำงานจริง
 */

import { Ctx, Query, Router, UseMiddlewares } from 'nestjs-trpc';
import { AuthMiddleware } from '../trpc/auth.middleware';
import type { TrpcContext } from '../trpc/context';
import { userOutput } from '@ulms/contract';
import { AuthService } from './auth.service';

@Router({ alias: 'auth' })
export class AuthRouter {
  constructor(private readonly authService: AuthService) {}

  /** โปรไฟล์ตัวเอง + บทบาท + สังกัด + เพดานการยืมของระดับเครดิตปัจจุบัน */
  @UseMiddlewares(AuthMiddleware)
  @Query({ output: userOutput })
  me(@Ctx() ctx: TrpcContext) {
    return this.authService.getProfile(ctx.user!.accountKey);
  }
}
