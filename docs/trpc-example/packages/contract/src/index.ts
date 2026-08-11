/**
 * วาระ ว-01 (ทางเลือก ก.) · หน้าตาสาธารณะของสัญญา
 * ปลายทางจริง: packages/contract/src/index.ts
 *
 * ทั้ง frontend และ backend import จากที่นี่ที่เดียว:
 *     import { userOutput, BUSINESS_ERROR } from '@ulms/contract';
 *     import type { AppRouter } from '@ulms/contract';
 *
 * ไม่มีใคร import ด้วยพาธสัมพัทธ์ข้ามโฟลเดอร์อีกต่อไป — นั่นคือสิ่งที่ทางเลือก ก.
 * ซื้อมาให้ และเป็นเหตุผลที่ไม่ต้องมีสคริปต์คัดลอกไฟล์
 *
 * ============================================================================
 *  สิ่งที่อยู่ในนี้ได้ = สิ่งที่ทั้งสองฝั่งต้องเห็นตรงกัน
 *  สิ่งที่ห้ามเข้ามา   = ตรรกะธุรกิจ, การต่อฐานข้อมูล, Prisma model, ข้อความไทย
 *  แก้ไฟล์ในแพ็กเกจนี้ = เปลี่ยนสัญญา ต้องทำตามกระบวนการใน CONTRACT-OWNERS.md
 * ============================================================================
 */

/**
 * type ของ router ทั้งระบบ
 *
 * ใช้ `export type` ไม่ใช่ `export` เฉย ๆ โดยตั้งใจ — ไฟล์ generated ข้างในมี
 * `initTRPC.create()` ซึ่งเป็นโค้ดที่รันได้จริง ถ้า re-export แบบธรรมดา
 * ตัวโมดูลจะถูกประเมินตอนรันและลาก @trpc/server เข้า bundle ของเบราว์เซอร์
 * `export type` ถูกลบทิ้งตอน compile จึงไม่มีโค้ดหลงเข้าไป
 */
export type { AppRouter } from './generated/appRouter';

/**
 * zod schema ที่ใช้ร่วมกัน
 *
 * ตัวนี้ export แบบปกติ (มีโค้ดจริง) เพราะ frontend ต้องใช้ validate ฟอร์ม
 * ด้วย react-hook-form + @hookform/resolvers — เขียน schema ครั้งเดียวใช้สองฝั่ง
 *
 * นี่คือประโยชน์ที่ทางเลือก ข. (คัดลอกไฟล์) ให้ไม่ได้ เพราะที่นั่น frontend
 * ต้องเขียน schema ของฟอร์มซ้ำเอง ซึ่งก็คือการเปิดช่องให้ความจริงสองชุด
 * เลื่อนออกจากกันอีกรอบ
 */
export * from './schemas/pagination.schema';
export * from './schemas/datetime.schema';
export * from './schemas/status.schema';
export * from './schemas/user.schema';

/**
 * รหัสข้อผิดพลาดทางธุรกิจ (ว-06)
 *
 * backend โยนด้วยรหัสเหล่านี้ · frontend map เป็นข้อความไทย
 * การอยู่ในแพ็กเกจกลางทำให้เพิ่มรหัสใหม่แล้ว frontend compile ไม่ผ่านทันที
 * ถ้ายังไม่ได้เขียนข้อความรองรับ
 */
export * from './errors/error-codes';
