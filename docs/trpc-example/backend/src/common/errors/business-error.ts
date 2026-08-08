/**
 * วาระ ว-06 · ตัวโยน error ที่บังคับให้ทำถูกตามสัญญา
 * ปลายทางจริง: backend-preview/backend/src/common/errors/business-error.ts
 *
 * เหตุผลที่ต้องมีฟังก์ชันนี้แทนที่จะ new TRPCError เอาเอง:
 *   1. บังคับให้ทุกที่แนบ "รหัสธุรกิจ" ไม่ใช่แค่รหัส tRPC กว้าง ๆ
 *   2. บังคับให้แนบข้อมูลประกอบครบตามที่ประกาศไว้ใน BusinessErrorData
 *      ถ้าลืม compiler ฟ้องทันที
 *   3. กันไม่ให้มีใครเผลอใส่ข้อความภาษาไทยลงไป เพราะพารามิเตอร์ message ไม่มีให้ใส่
 */

import { TRPCError } from '@trpc/server';
import {
  BUSINESS_ERROR,
  type BusinessErrorCode,
  type BusinessErrorData,
} from './error-codes';

/** จับคู่รหัสธุรกิจกับรหัสมาตรฐานของ tRPC — ตัดสินใจครั้งเดียวที่นี่ */
const TRPC_CODE: Record<BusinessErrorCode, TRPCError['code']> = {
  NOT_AUTHENTICATED: 'UNAUTHORIZED',
  ROLE_NOT_ALLOWED: 'FORBIDDEN',
  NOT_ELIGIBLE: 'FORBIDDEN',
  ITEM_UNAVAILABLE: 'CONFLICT',
  SLOT_TAKEN: 'CONFLICT',
  LOAN_PERIOD_EXCEEDS_LIMIT: 'BAD_REQUEST',
  EXTENSION_QUOTA_EXCEEDED: 'FORBIDDEN',
  ALREADY_DECIDED: 'CONFLICT',
  APPEAL_WINDOW_CLOSED: 'FORBIDDEN',
};

/**
 * โยน error ทางธุรกิจ
 *
 * ใช้แบบ:
 *   throw businessError('LOAN_PERIOD_EXCEEDS_LIMIT', {
 *     maxDays: 7, requestedDays: 14, creditTier: 'D2',
 *   });
 *
 * message ที่ส่งไปคือ "รหัส" ไม่ใช่ประโยค — frontend เอาไปเปิดตารางแปลเอง
 */
export function businessError<C extends BusinessErrorCode>(
  code: C,
  ...[data]: BusinessErrorData[C] extends undefined
    ? []
    : [BusinessErrorData[C]]
): TRPCError {
  return new TRPCError({
    code: TRPC_CODE[code],
    message: code,
    cause: data,
  });
}

/** ใช้ในเทสต์และในชั้น logging เพื่อเช็กว่า error ที่จับได้เป็นของเราหรือของระบบ */
export function isBusinessErrorCode(value: string): value is BusinessErrorCode {
  return Object.prototype.hasOwnProperty.call(BUSINESS_ERROR, value);
}
