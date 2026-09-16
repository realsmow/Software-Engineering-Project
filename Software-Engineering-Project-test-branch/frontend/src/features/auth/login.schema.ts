import { z } from "zod";

/**
 * Login validation (client-side only - no API is wired yet, brief note #5).
 * Two methods mirror the reference mockup: KU email for students/faculty and
 * a local account for department staff. Messages are Thai to match the UI.
 */
export const kuLoginSchema = z.object({
  email: z
    .string()
    .min(1, "กรุณากรอกอีเมล KU")
    .email("รูปแบบอีเมลไม่ถูกต้อง")
    .refine(
      (v) => /@(ku\.ac\.th|ku\.th)$/i.test(v.trim()),
      "ต้องเป็นอีเมล @ku.ac.th หรือ @ku.th เท่านั้น",
    ),
  password: z.string().min(1, "กรุณากรอกรหัสผ่าน"),
  remember: z.boolean().optional(),
});

export const localLoginSchema = z.object({
  username: z.string().min(1, "กรุณากรอกชื่อผู้ใช้"),
  password: z.string().min(1, "กรุณากรอกรหัสผ่าน"),
  remember: z.boolean().optional(),
});

export type KuLoginValues = z.infer<typeof kuLoginSchema>;
export type LocalLoginValues = z.infer<typeof localLoginSchema>;
