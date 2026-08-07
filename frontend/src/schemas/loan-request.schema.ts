import { z } from "zod";
import { BUSINESS } from "@/constants";

/**
 * Schema สำหรับส่งคำขอยืม
 * ตรงกับ backend Zod schema (แชร์ผ่าน monorepo shared package ในอนาคต)
 */

const dateStringSchema = z.string().datetime({
  message: "รูปแบบวันที่ไม่ถูกต้อง",
});

export const loanRequestItemSchema = z
  .object({
    typeId: z.string().min(1, "กรุณาเลือกอุปกรณ์"),
    quantity: z.number().int().positive("จำนวนต้องมากกว่า 0"),
    serialNo: z.string().optional(), // T2 ต้องเลือก serial
    slotStart: dateStringSchema.optional(), // T3
    slotEnd: dateStringSchema.optional(), // T3
  })
  .refine(
    (data) => {
      // T3: ถ้ามี slotStart ต้องมี slotEnd
      if (data.slotStart && !data.slotEnd) return false;
      if (data.slotEnd && !data.slotStart) return false;
      return true;
    },
    { message: "กรุณาระบุช่วงเวลาให้ครบ" }
  );

export const submitLoanRequestSchema = z
  .object({
    pickupDate: dateStringSchema,
    returnDate: dateStringSchema,
    items: z
      .array(loanRequestItemSchema)
      .min(1, "กรุณาเลือกอย่างน้อย 1 รายการ")
      .max(10, "ยืมได้สูงสุด 10 รายการต่อคำขอ"),
    note: z.string().max(500).optional(),
  })
  .refine(
    (data) => {
      const pickup = new Date(data.pickupDate);
      const returnDate = new Date(data.returnDate);
      const diffDays = Math.ceil(
        (returnDate.getTime() - pickup.getTime()) / (1000 * 60 * 60 * 24)
      );
      return diffDays >= BUSINESS.MIN_LOAN_DAYS && diffDays <= BUSINESS.MAX_LOAN_DAYS;
    },
    {
      message: `ระยะเวลายืมต้องอยู่ระหว่าง ${BUSINESS.MIN_LOAN_DAYS}–${BUSINESS.MAX_LOAN_DAYS} วัน`,
      path: ["returnDate"],
    }
  );

export type SubmitLoanRequestInput = z.infer<typeof submitLoanRequestSchema>;
export type LoanRequestItemInput = z.infer<typeof loanRequestItemSchema>;
