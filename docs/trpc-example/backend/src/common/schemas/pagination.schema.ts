/**
 * วาระ ว-07 · รูปแบบการแบ่งหน้าและการกรอง
 * ปลายทางจริง: backend-preview/backend/src/common/schemas/pagination.schema.ts
 *
 * สมมติว่าที่ประชุมเลือกตามข้อเสนอ: แบ่งหน้าตาม "เลขหน้า" ทั้งระบบ
 *   เหตุผล: หน้าจอส่วนใหญ่เป็นตารางงานของเจ้าหน้าที่ (คิวจัดเตรียม คิวรออนุมัติ
 *   จัดการผู้ใช้) ซึ่งต้องเห็นว่ามีทั้งหมดกี่หน้าและกระโดดข้ามหน้าได้
 *   ถ้าวันหลังมีหน้าจอมือถือแบบเลื่อนลงเรื่อย ๆ ค่อยเพิ่มแบบ cursor เฉพาะจุดนั้น
 *
 * ประโยชน์ของการมีไฟล์นี้: procedure ที่คืนรายการทุกตัว extend จากที่นี่
 * frontend จึงเขียน component ตารางตัวเดียวใช้ได้ทุกหน้า
 */

import { z } from 'zod';

/** ค่าปริยายและเพดาน - เพดานกันคนยิงขอทีเดียวหมื่นแถว */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** ใส่ต่อท้าย input ของทุก procedure ที่คืนรายการ */
export const paginationInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  /** คำค้น ปล่อยว่างได้ */
  q: z.string().trim().max(200).optional(),
  /** ชื่อฟิลด์ที่เรียง - แต่ละ procedure จำกัดค่าที่ยอมรับเองด้วย .extend() */
  sort: z.string().max(50).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationInput = z.infer<typeof paginationInput>;

/**
 * ห่อ output ของรายการ ใช้แบบ: paginated(loanSummaryOutput)
 *
 * ต้องเป็นฟังก์ชันเพราะ zod ต้องรู้ชนิดของ items ตอน compile
 * ถ้าเขียนเป็น z.array(z.unknown()) จะเสียประโยชน์ทั้งหมดของสัญญา
 */
export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  });
}

/** ตัวช่วยฝั่ง service: แปลง page/pageSize เป็นอาร์กิวเมนต์ของ Prisma */
export function toPrismaPage(input: PaginationInput) {
  return {
    skip: (input.page - 1) * input.pageSize,
    take: input.pageSize,
  };
}
