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

/**
 * TEMPORARY test credentials for the local-account login (no backend yet).
 * Each entry maps a fixed username/password to a non-borrower role so the
 * team can reach staff / supervisor / admin views during development.
 * Borrower is reached via the KU email method instead.
 *
 * TODO(auth-integration): DELETE this file entirely once real auth lands.
 * Do NOT seed these usernames into any database — they are publicly known.
 *
 * `import.meta.env.DEV` is replaced by a literal at build time, so the
 * production bundle keeps only the empty array — the passwords are never
 * emitted. Verified with `grep -r staff1234 dist/`.
 */
export const MOCK_LOCAL_CREDENTIALS: {
  username: string;
  password: string;
  role: Exclude<Role, "borrower">;
}[] = import.meta.env.DEV
  ? [
      { username: "test_staff", password: "staff1234", role: "staff" },
      { username: "test_supervisor", password: "supervisor1234", role: "supervisor" },
      { username: "test_admin", password: "admin1234", role: "admin" },
    ]
  : [];
