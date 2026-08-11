/**
 * วาระ ว-01 (ทางเลือก ก.) · ตั้ง autoSchemaFile ให้เขียนลงในแพ็กเกจสัญญา
 * ปลายทางจริง: backend/src/app.module.ts (แทนที่ของเดิม)
 *
 * ของเดิมในรีโปเรียก TRPCModule.forRoot() แบบไม่ส่งค่าตั้งค่าใด ๆ
 * แปลว่ายังไม่ได้บอกให้มันสร้างไฟล์สัญญา — ไม่มีสัญญาให้ frontend ใช้เลย
 *
 * autoSchemaFile คือหัวใจ: มันบอกว่าให้เขียนไฟล์ router ที่สแกนได้จาก decorator
 * ไปไว้ที่ไหน — ในทางเลือก ก. เราให้มันเขียนลงใน packages/contract/ โดยตรง
 * frontend จึงเห็นสัญญาใหม่ทันทีที่ backend build เสร็จ ไม่ต้องคัดลอกอะไรเลย
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TRPCModule } from 'nestjs-trpc';

import { PrismaModule } from './prisma.module';
import { AppContext } from './trpc/context';
import {
  AuthMiddleware,
  StaffMiddleware,
  SupervisorMiddleware,
  AdminMiddleware,
} from './trpc/auth.middleware';

import { AuthRouter } from './auth/auth.router';
import { AuthService } from './auth/auth.service';
import { LoanRouter } from './loan/loan.router';
import { LoanService } from './loan/loan.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TRPCModule.forRoot({
      // เขียนไฟล์สัญญาลงในแพ็กเกจกลางโดยตรง — ไม่ต้องมีสคริปต์คัดลอกอีกต่อไป
      // เพราะ frontend import จาก '@ulms/contract' ซึ่งชี้มาที่นี่อยู่แล้ว
      //
      // ทางเลือก ข. จะเป็น './src/@generated' แล้วต้องรัน sync-contract.sh ตาม
      autoSchemaFile: '../packages/contract/src/generated',

      // ตัวสร้าง ctx.user ต่อ request — ดู ว-03
      context: AppContext,

      // path ที่ tRPC จะ mount อยู่ ต้องตรงกับ VITE_API_URL + '/trpc' ฝั่ง frontend
      basePath: '/trpc',
    }),
  ],
  providers: [
    // context + middleware
    AppContext,
    AuthMiddleware,
    StaffMiddleware,
    SupervisorMiddleware,
    AdminMiddleware,

    // router + service ต่อโดเมน
    AuthRouter,
    AuthService,
    LoanRouter,
    LoanService,
  ],
})
export class AppModule {}
