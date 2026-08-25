/**
 * วาระ ว-01 · นี่คือ "ตัวสัญญา" ที่เดินทางข้ามฝั่งมา
 * ปลายทางจริง: frontend/src/server-types/appRouter.ts
 *
 * ============================================================================
 *  ไฟล์นี้ถูกสร้างอัตโนมัติ ห้ามแก้ด้วยมือ
 *  สร้างโดย nestjs-trpc (autoSchemaFile) แล้วคัดลอกมาด้วย
 *      npm run sync:contract
 *  ถ้าอยากให้เนื้อหาในนี้เปลี่ยน ให้ไปแก้ router/schema ฝั่ง backend
 * ============================================================================
 *
 * ไฟล์ตัวอย่างนี้เขียนด้วยมือเพื่อให้ทีมเห็นว่า "ของที่ได้จะหน้าตาแบบนี้"
 * ของจริงจะยาวกว่านี้มากและมี zod schema ประกอบครบทุก procedure
 *
 * ข้อควรรู้จาก ว-02: ไฟล์จริงมีโค้ด zod อยู่ข้างใน ไม่ใช่ type ล้วน
 * frontend จึงต้องใช้ zod รุ่นเดียวกับ backend (4.x) ไม่งั้นจะได้ TypeScript
 * error ที่อ่านแล้วไม่รู้ว่าสาเหตุคือเรื่องเวอร์ชัน
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

/**
 * รหัสข้อผิดพลาดทางธุรกิจ (ว-06)
 *
 * ในของจริง รายการนี้ควรถูก generate ออกมาด้วย หรือไม่ก็ย้ายไปอยู่ใน
 * packages/contract/ ที่สองฝั่ง import ร่วมกัน - ตกลงใน ว-01 ว่าจะใช้วิธีไหน
 */
export type BusinessErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'ROLE_NOT_ALLOWED'
  | 'NOT_ELIGIBLE'
  | 'ITEM_UNAVAILABLE'
  | 'SLOT_TAKEN'
  | 'LOAN_PERIOD_EXCEEDS_LIMIT'
  | 'EXTENSION_QUOTA_EXCEEDED'
  | 'ALREADY_DECIDED'
  | 'APPEAL_WINDOW_CLOSED';
