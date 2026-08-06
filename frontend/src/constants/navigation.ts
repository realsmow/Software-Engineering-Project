import type { Role } from "@/types/domain";
import { ROUTES } from "@/constants";

/**
 * Role-based navigation config.
 * Section labels, item labels, icons and counts match the reference HTML
 * (ULMs-login-and-shell-v3.html) exactly. Each item's `route` references an
 * existing ROUTES key (never a hardcoded path string).
 *
 * `icon` is a lucide-react export name (string) — mapped to a component in
 * the Sidebar via NAV_ICON.
 */
export interface NavItem {
  key: string;
  label: string;
  icon: string;
  count?: number;
  active?: boolean;
  /** Existing ROUTES value. `undefined` = route not defined yet (TODO). */
  route?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export interface Persona {
  name: string;
  role: string;
  avatar: string;
}

export interface RoleNav {
  persona: Persona;
  sections: NavSection[];
}

export const NAV_CONFIG: Record<Role, RoleNav> = {
  borrower: {
    persona: { name: "ณัฐวุฒิ ศรีสุวรรณ", role: "นิสิต · 6410501234", avatar: "ณฐ" },
    sections: [
      {
        label: "ผู้ยืม",
        items: [
          { key: "home", label: "หน้าแรก", icon: "home", route: ROUTES.HOME },
          { key: "catalog", label: "รายการครุภัณฑ์", icon: "grid", count: 148, route: ROUTES.CATALOG },
          { key: "requests", label: "คำขอของฉัน", icon: "file", count: 2, route: ROUTES.MY_LOANS },
          { key: "history", label: "ประวัติการยืม", icon: "clock", route: ROUTES.MY_HISTORY },
          { key: "credit", label: "คะแนนเครดิต", icon: "award", route: ROUTES.MY_CREDIT },
          { key: "appeals", label: "การอุทธรณ์", icon: "shield", route: ROUTES.APPEALS },
        ],
      },
    ],
  },

  staff: {
    persona: { name: "สมชาย พร้อมเจริญ", role: "เจ้าหน้าที่ · ภาควิศวคอมพ์", avatar: "สช" },
    sections: [
      {
        label: "ผู้ยืม",
        items: [
          { key: "home", label: "หน้าแรก", icon: "home", route: ROUTES.HOME },
          { key: "catalog", label: "รายการครุภัณฑ์", icon: "grid", count: 148, route: ROUTES.CATALOG },
          { key: "requests", label: "คำขอของฉัน", icon: "file", route: ROUTES.MY_LOANS },
        ],
      },
      {
        label: "เจ้าหน้าที่",
        items: [
          { key: "queue", label: "คิวงาน", icon: "inbox", count: 23, active: true, route: ROUTES.STAFF_DASHBOARD },
          { key: "inventory", label: "จัดการอุปกรณ์", icon: "package", route: ROUTES.STAFF_INVENTORY },
          { key: "inspect", label: "ตรวจสภาพ", icon: "check-square", route: ROUTES.STAFF_INSPECTION },
        ],
      },
      {
        label: "จัดการภาควิชา",
        items: [
          { key: "users", label: "จัดการผู้ใช้", icon: "users", route: ROUTES.STAFF_USERS },
          { key: "permissions", label: "การอนุญาต/แบน", icon: "user-x", route: ROUTES.STAFF_PERMISSIONS },
          { key: "settings", label: "ตั้งค่าการยืม", icon: "sliders", route: ROUTES.STAFF_SETTINGS },
        ],
      },
      {
        label: "รายงาน",
        items: [
          { key: "analytics", label: "สถิติและกราฟ", icon: "trending-up", route: ROUTES.REPORT_ANALYTICS },
          { key: "export", label: "ส่งออกข้อมูล", icon: "download", route: ROUTES.REPORT_EXPORT },
        ],
      },
    ],
  },

  supervisor: {
    persona: { name: "ผศ.ดร. อรวรรณ ภักดี", role: "อาจารย์ · ภาควิศวคอมพ์", avatar: "อว" },
    sections: [
      {
        label: "ผู้ยืม",
        items: [
          { key: "home", label: "หน้าแรก", icon: "home", route: ROUTES.HOME },
          { key: "catalog", label: "รายการครุภัณฑ์", icon: "grid", route: ROUTES.CATALOG },
          { key: "requests", label: "คำขอของฉัน", icon: "file", route: ROUTES.MY_LOANS },
        ],
      },
      {
        label: "อาจารย์ผู้ดูแล",
        items: [
          { key: "approvals", label: "การอนุมัติ", icon: "check-circle", count: 6, active: true, route: ROUTES.SUPERVISOR_APPROVALS },
          { key: "appeals-review", label: "อุทธรณ์", icon: "shield", count: 2, route: ROUTES.SUPERVISOR_APPEALS },
        ],
      },
      {
        label: "จัดการภาควิชา",
        items: [
          { key: "users", label: "จัดการผู้ใช้", icon: "users", route: ROUTES.STAFF_USERS },
          { key: "permissions", label: "การอนุญาต/แบน", icon: "user-x", route: ROUTES.STAFF_PERMISSIONS },
          { key: "settings", label: "ตั้งค่าการยืม", icon: "sliders", route: ROUTES.STAFF_SETTINGS },
        ],
      },
      {
        label: "รายงาน",
        items: [
          { key: "analytics", label: "สถิติและกราฟ", icon: "trending-up", route: ROUTES.REPORT_ANALYTICS },
          { key: "export", label: "ส่งออกข้อมูล", icon: "download", route: ROUTES.REPORT_EXPORT },
        ],
      },
    ],
  },

  admin: {
    persona: { name: "ธนพล เจ้าหน้าที่ IT", role: "ผู้ดูแลระบบ · IT Services", avatar: "ธน" },
    sections: [
      {
        label: "ผู้ดูแลระบบ",
        items: [
          { key: "sys-users", label: "ผู้ใช้ระบบ", icon: "users", active: true, route: ROUTES.ADMIN_USERS },
          { key: "sys-status", label: "สถานะระบบ", icon: "activity", route: ROUTES.ADMIN_STATUS },
          { key: "sys-audit", label: "บันทึกการใช้งาน", icon: "file-text", route: ROUTES.ADMIN_AUDIT },
          { key: "sys-config", label: "ตั้งค่าเทคนิค", icon: "server", route: ROUTES.ADMIN_CONFIG },
        ],
      },
      {
        label: "รายงาน",
        items: [{ key: "sys-reports", label: "รายงานรวม", icon: "bar-chart", route: ROUTES.ADMIN_REPORTS }],
      },
    ],
  },
};

/** Flat lookup: route path → Thai label (for breadcrumb + active state). */
export const ROUTE_TITLES: Record<string, string> = Object.values(NAV_CONFIG)
  .flatMap((r) => r.sections)
  .flatMap((s) => s.items)
  .reduce<Record<string, string>>((acc, item) => {
    if (item.route) acc[item.route] = item.label;
    return acc;
  }, {});

export function getNavForRole(role: Role): RoleNav {
  return NAV_CONFIG[role];
}
