/**
 * วาระ ว-01 · นี่คือ "ตัวสัญญา" ที่เดินทางข้ามฝั่งมา
 * ปลายทางจริง: packages/contract/src/generated/appRouter.ts
 *
 * ============================================================================
 *  ไฟล์นี้ถูกสร้างอัตโนมัติ ห้ามแก้ด้วยมือ
 *
 *  nestjs-trpc (autoSchemaFile) เขียนทับไฟล์นี้ทุกครั้งที่ backend build
 *      npm run start:dev -w backend
 *
 *  ในทางเลือก ก. ไม่มีขั้นตอนคัดลอก — backend เขียนลงมาที่นี่โดยตรง และ
 *  frontend เห็นทันทีผ่าน '@ulms/contract' ถ้าอยากให้เนื้อหาเปลี่ยน
 *  ให้ไปแก้ router/schema ฝั่ง backend
 * ============================================================================
 *
 * ไฟล์ตัวอย่างนี้เขียนด้วยมือเพื่อให้ทีมเห็นว่า "ของที่ได้จะหน้าตาแบบนี้"
 * ของจริงจะยาวกว่านี้มากและมี zod schema ประกอบครบทุก procedure
 *
 * ข้อควรรู้: ไฟล์นี้มีโค้ด zod อยู่ข้างใน ไม่ใช่ type ล้วน จึงต้องมี zod
 * ที่ resolve ได้ — ในทางเลือก ก. เรื่องนี้จบไปเองเพราะ node_modules มีกองเดียว
 * และ packages/contract/package.json ประกาศ zod ไว้แล้ว
 */

import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

// --- สคีมาที่ถูกคัดลอกมาจากฝั่ง backend ตอน generate --------------------------

const userOutput = z.object({
  id: z.number().int(),
  studentId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.email(),
  role: z.enum(['borrower', 'staff', 'supervisor', 'admin']),
  facultyName: z.string().nullable(),
  creditScore: z.number().int(),
  creditTier: z.enum(['D0', 'D1', 'D2', 'D3']),
  maxBorrowDays: z.number().int().positive(),
  maxExtendTimes: z.number().int().min(0),
});

const loanSummaryOutput = z.object({
  id: z.number().int(),
  itemName: z.string(),
  serialNo: z.string().nullable(),
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled', 'expired']),
  checkoutAt: z.iso.datetime({ offset: false }).nullable(),
  dueAt: z.iso.datetime({ offset: false }),
  returnedAt: z.iso.datetime({ offset: false }).nullable(),
  isOverdue: z.boolean(),
});

const loanOutput = loanSummaryOutput.extend({
  requestedDays: z.number().int().positive(),
  grantedDays: z.number().int().positive(),
  extendTimesLeft: z.number().int().min(0),
});

// --- โครง router ที่สแกนได้จาก decorator ------------------------------------

const appRouter = t.router({
  auth: t.router({
    me: t.procedure.output(userOutput).query(() => '' as never),
  }),

  item: t.router({
    availability: t.procedure
      .input(z.object({ itemId: z.number().int() }))
      .output(
        z.object({
          available: z.number().int().min(0),
          nextAvailableAt: z.iso.datetime({ offset: false }).nullable(),
        }),
      )
      .query(() => '' as never),
  }),

  loan: t.router({
    list: t.procedure
      .input(
        z.object({
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(20),
          q: z.string().trim().max(200).optional(),
          sort: z.enum(['dueAt', 'createdAt']).default('dueAt'),
          order: z.enum(['asc', 'desc']).default('desc'),
          status: z
            .enum(['pending', 'approved', 'rejected', 'cancelled', 'expired'])
            .optional(),
        }),
      )
      .output(
        z.object({
          items: z.array(loanSummaryOutput),
          total: z.number().int().min(0),
          page: z.number().int().min(1),
          pageSize: z.number().int().min(1),
        }),
      )
      .query(() => '' as never),

    create: t.procedure
      .input(
        z.object({
          itemId: z.number().int().positive(),
          startDate: z.string(),
          endDate: z.string(),
          note: z.string().trim().max(500).optional(),
        }),
      )
      .output(loanOutput)
      .mutation(() => '' as never),
  }),
});

export type AppRouter = typeof appRouter;

/*
 * หมายเหตุ: BusinessErrorCode ไม่ได้อยู่ในไฟล์นี้
 *
 * มันเป็นของที่ "คนเขียน" ไม่ใช่ของที่เครื่อง generate จึงอยู่ที่
 * ../errors/error-codes.ts แล้ว index.ts ของแพ็กเกจ export ให้ทั้งสองฝั่ง
 * ไฟล์นี้ถูกเขียนทับทุกครั้งที่ backend build อะไรที่อยู่ในนี้จะหายไป
 */
