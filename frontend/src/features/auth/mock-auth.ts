import type { Role, User } from "@/types/domain";

/**
 * Mock users for dev — no API is wired yet (see brief note #5).
 * One representative user per role, aligned with the personas in
 * constants/navigation.ts. Swap for real `/auth/me` data later.
 */
export const MOCK_USERS: Record<Role, User> = {
  borrower: {
    id: "u-borrower",
    studentId: "6410501234",
    name: "ณัฐวุฒิ ศรีสุวรรณ",
    email: "natthawut.s@ku.th",
    role: "borrower",
    departmentId: "cpe",
    creditScore: 92,
    creditBand: "D0",
  },
  staff: {
    id: "u-staff",
    studentId: "-",
    name: "สมชาย พร้อมเจริญ",
    email: "somchai.p@ku.th",
    role: "staff",
    departmentId: "cpe",
    creditScore: 100,
    creditBand: "D0",
  },
  supervisor: {
    id: "u-supervisor",
    studentId: "-",
    name: "ผศ.ดร. อรวรรณ ภักดี",
    email: "orawan.p@ku.th",
    role: "supervisor",
    departmentId: "cpe",
    creditScore: 100,
    creditBand: "D0",
  },
  admin: {
    id: "u-admin",
    studentId: "-",
    name: "ธนพล เจ้าหน้าที่ IT",
    email: "thanapon.it@ku.th",
    role: "admin",
    departmentId: "it",
    creditScore: 100,
    creditBand: "D0",
  },
};

export const MOCK_USER_STORAGE_KEY = "ulms-mock-user";
