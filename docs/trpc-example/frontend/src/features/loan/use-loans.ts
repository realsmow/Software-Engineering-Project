/**
 * ตัวอย่างการใช้งานจริงฝั่ง frontend — ผลรวมของทุกมติในหน้าเดียว
 * ปลายทางจริง: frontend/src/features/borrower/loans/use-loans.ts
 *
 * สิ่งที่หายไปเทียบกับโค้ดเดิมที่ใช้ api-client.ts:
 *   - ไม่มี `as Loan[]` ไม่มี interface เขียนมือ  (ว-01 สัญญาให้ type มาแล้ว)
 *   - ไม่มีการเดาว่า field ชื่ออะไร                (ว-09 output พูดภาษา frontend)
 *   - ไม่มีการเทียบ status === 2                   (ว-10 สถานะเป็นสตริง)
 *   - ไม่มีการเอา creditScore มาคำนวณวันยืมเอง      (backend ส่งค่าที่คำนวณแล้ว)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { trpcClient } from '../../lib/trpc';
import { formatBusinessError } from '../../lib/error-messages';
import type { BusinessErrorCode } from '@ulms/contract';

/** รายการที่กำลังยืมอยู่ของตัวเอง */
export function useMyLoans(page = 1) {
  return useQuery({
    queryKey: ['loan', 'list', page],
    queryFn: () => trpcClient.loan.list.query({ page, pageSize: 20, order: 'desc' }),
    // data ถูกอนุมาน type มาแล้ว: { items: LoanSummaryOutput[]; total: number; ... }
  });
}

/**
 * ของคงเหลือของอุปกรณ์ที่กำลังดูอยู่
 *
 * เอกสารรายการเรียกใช้งานกำหนด polling 10-15 วินาที เพราะคนอื่นกดยืมตัดหน้าได้
 * context.realtime = true ทำให้ splitLink ใน lib/trpc.ts ส่งเส้นนี้แยกออกจาก
 * ก้อน batch เพื่อไม่ให้ query หนักตัวอื่นลากให้ช้าตามทุก 10 วินาที
 */
export function useItemAvailability(itemId: number) {
  return useQuery({
    queryKey: ['item', 'availability', itemId],
    queryFn: () =>
      trpcClient.item.availability.query({ itemId }, { context: { realtime: true } }),
    refetchInterval: 12_000,
    // อย่าถามซ้ำตอนผู้ใช้สลับแท็บออกไป (ว-12)
    refetchIntervalInBackground: false,
  });
}

/** ส่งคำขอยืม */
export function useCreateLoan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: trpcClient.loan.create.mutate,

    onSuccess: (loan) => {
      // loan.dueAt คือวันครบกำหนด "จริง" ที่ระบบให้ ไม่ใช่ค่าที่เราคำนวณเอง
      // ถ้าเราบวกวันเองจาก creditTier แล้ว cron หักเครดิตระหว่างทาง
      // ตัวเลขบนจอจะไม่ตรงกับที่ระบบบันทึกไว้
      void loan.dueAt;

      // ว-05: mutation ทุกตัวต้องระบุว่า invalidate อะไรบ้าง
      // ไม่งั้นผู้ใช้กดปุ่มแล้วหน้าจอไม่อัปเดต
      void queryClient.invalidateQueries({ queryKey: ['loan', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['item', 'availability'] });
    },

    /**
     * ว-13: mutation ต้องไม่ลองใหม่อัตโนมัติ
     * ถ้าเครือข่ายหลุดหลังจาก backend รับคำขอไปแล้ว การลองใหม่จะกลายเป็น
     * "ยืมซ้ำสองครั้ง" — query ลองใหม่ได้ mutation ลองใหม่ไม่ได้
     */
    retry: false,
  });
}

/**
 * แปลง error จาก tRPC เป็นข้อความไทย
 *
 * backend ส่ง "รหัส" มาใน message และส่ง "ข้อมูลประกอบ" มาใน cause
 * ตามที่ตกลงใน ว-06 — ไม่เคยส่งประโยคภาษาไทยมาเลย
 */
export function toUserMessage(error: unknown): string {
  if (error instanceof TRPCClientError) {
    const code = error.message as BusinessErrorCode;
    return formatBusinessError(code, error.data?.cause);
  }
  return 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง';
}
