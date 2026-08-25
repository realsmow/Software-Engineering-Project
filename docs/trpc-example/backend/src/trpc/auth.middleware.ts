/**
 * วาระ ว-03 + ว-05 · ตรวจสิทธิ์ด้วย middleware ไม่ใช่ if ใน service
 * ปลายทางจริง: backend/src/trpc/auth.middleware.ts
 *
 * สมมติว่าที่ประชุมยืนยันตามข้อเสนอ ว-05:
 *   จัดกลุ่ม procedure ตาม "โดเมน" แล้วคุมสิทธิ์ด้วย middleware
 *   ไม่ใช่แยก router ตามบทบาท (staff.approveLoan / supervisor.approveLoan)
 *
 * ทำไมสำคัญ: "ใครเรียก procedure นี้ได้บ้าง" ต้องตอบได้จากบรรทัดเดียวเหนือเมท็อด
 * ไม่ใช่ต้องอ่าน service ทั้งไฟล์ - สิทธิ์คือส่วนหนึ่งของสัญญา
 */

import { Injectable } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import type { MiddlewareOptions, TRPCMiddleware } from 'nestjs-trpc';
import type { TrpcContext, TrpcUser } from './context';

/** ต้องล็อกอิน - ใช้กับเกือบทุก procedure ในระบบ */
@Injectable()
export class AuthMiddleware implements TRPCMiddleware {
  async use(opts: MiddlewareOptions<TrpcContext>) {
    const { ctx, next } = opts;
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'NOT_AUTHENTICATED',
      });
    }
    // ส่ง ctx ที่ user ไม่เป็น null ต่อไป เพื่อให้ procedure ปลายทางไม่ต้องเช็กซ้ำ
    return next({ ctx: { ...ctx, user: ctx.user } });
  }
}

/**
 * ตัวสร้าง middleware ตามบทบาท - เขียนครั้งเดียว ใช้ได้ทุกบทบาท
 * ใช้คู่กับ AuthMiddleware เสมอ: @UseMiddlewares(AuthMiddleware, StaffMiddleware)
 */
function requireRole(...allowed: TrpcUser['role'][]) {
  @Injectable()
  class RoleMiddleware implements TRPCMiddleware {
    async use(opts: MiddlewareOptions<TrpcContext>) {
      const { ctx, next } = opts;
      if (!ctx.user || !allowed.includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'ROLE_NOT_ALLOWED',
        });
      }
      return next({ ctx });
    }
  }
  return RoleMiddleware;
}

/** เจ้าหน้าที่: จัดเตรียมของ บันทึกรับ-คืน ประเมินความเสียหาย */
export const StaffMiddleware = requireRole('staff', 'admin');

/** อาจารย์ผู้ดูแล: อนุมัติ/ปฏิเสธคำขอ ตัดสินอุทธรณ์ */
export const SupervisorMiddleware = requireRole('supervisor', 'admin');

/** ผู้ดูแลระบบ: จัดการผู้ใช้และตั้งค่าระบบ */
export const AdminMiddleware = requireRole('admin');
