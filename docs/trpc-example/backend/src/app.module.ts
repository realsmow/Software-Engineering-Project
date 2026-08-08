/**
 * วาระ ว-01 · ตั้ง autoSchemaFile เพื่อให้ไฟล์สัญญาถูกสร้างจริง
 * ปลายทางจริง: backend-preview/backend/src/app.module.ts (แทนที่ของเดิม)
 *
 * ของเดิมในรีโปเรียก TRPCModule.forRoot() แบบไม่ส่งค่าตั้งค่าใด ๆ
 * แปลว่ายังไม่ได้บอกให้มันสร้างไฟล์สัญญา — ไม่มีสัญญาให้ frontend ใช้เลย
 *
 * autoSchemaFile คือหัวใจ: มันบอกว่าให้เขียนไฟล์ router ที่สแกนได้จาก decorator
 * ไปไว้ที่ไหน ไฟล์นั้นแหละคือตัวสัญญาที่จะถูกคัดลอกข้ามไปฝั่ง frontend
 * ด้วยสคริปต์ใน scripts/sync-contract.sh
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
      // ที่อยู่ของไฟล์สัญญาที่ถูกสร้างอัตโนมัติ
      // ต้องอยู่ใน .gitignore ของ backend เพราะเป็นไฟล์ที่สร้างใหม่ได้เสมอ
      autoSchemaFile: './src/@generated',

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
