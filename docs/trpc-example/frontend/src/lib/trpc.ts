/**
 * วาระ ว-01 + ว-03 · ฝั่ง frontend ต่อกับสัญญา
 * ปลายทางจริง: frontend/src/lib/trpc.ts
 *
 * บรรทัดที่สำคัญที่สุดในไฟล์นี้คือ import type { AppRouter }
 * ถ้าบรรทัดนั้น resolve ไม่ได้ แปลว่าเรายังไม่มีสัญญา มีแต่ REST ที่เขียนด้วย
 * ไวยากรณ์ของ tRPC
 *
 * ต้องลงเพิ่ม (ยังไม่มีใน frontend/package.json):
 *   npm i @trpc/client @trpc/tanstack-react-query
 * และต้องยก zod เป็น 4 ให้ตรงกับ backend ก่อน (ว-02)
 */

import { createTRPCClient, httpBatchLink, httpLink, splitLink } from '@trpc/client';
import type { AppRouter } from '../server-types/appRouter';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * ส่ง cookie ไปกับทุก request
 * ทีมเลือก httpOnly cookie ไปแล้วโดยปริยาย — api-client.ts เดิมตั้ง
 * credentials:"include" ไว้ทุก request
 */
const fetchWithCredentials: typeof fetch = (url, opts) =>
  fetch(url, { ...opts, credentials: 'include' });

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    /**
     * ว-13 (P2) แก้ล่วงหน้าไว้เท่าที่ไม่มีต้นทุน:
     *
     * httpBatchLink รวมหลาย query ที่เกิดพร้อมกันเป็น HTTP request เดียว
     * ซึ่งดีกับหน้าที่โหลดครั้งเดียว แต่มีผลข้างเคียงคือ "ช้าที่สุดลากทุกตัว"
     *
     * เอกสารรายการเรียกใช้งานกำหนด polling 10-15 วินาทีสำหรับของคงเหลือและ
     * สล็อตห้อง ถ้าไปรวมก้อนกับ query หนักอย่างรายงานสถิติ ทั้งก้อนจะช้าตาม
     * ทุก 10 วินาที — จึงแยกเส้นให้ query ที่ทำเครื่องหมาย realtime ไว้
     *
     * ถ้าที่ประชุม ว-13 ตัดสินใจอย่างอื่น แก้ได้ที่ไฟล์นี้ไฟล์เดียว
     */
    splitLink({
      condition: (op) => op.context.realtime === true,
      true: httpLink({ url: `${API_URL}/trpc`, fetch: fetchWithCredentials }),
      false: httpBatchLink({ url: `${API_URL}/trpc`, fetch: fetchWithCredentials }),
    }),
  ],
});
