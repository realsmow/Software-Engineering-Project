import { matchPath } from "react-router-dom";
import type { Role } from "@/types/domain";
import { ROUTES } from "@/constants";

/**
 * Role-based navigation config.
 * Section + item labels are i18n keys (`labelKey`, resolved via `t()` in the
 * Sidebar) - never hardcoded strings. Icons and counts match the reference
 * HTML (ULMs-login-and-shell-v3.html). Each item's `route` references an
 * existing ROUTES key.
 *
 * `icon` is a lucide-react export name (string) - mapped to a component in
 * the Sidebar via NAV_ICON.
 */
export interface NavItem {
  key: string;
  /** i18n key (e.g. "nav.home") resolved with t() at render time. */
  labelKey: string;
  icon: string;
  /**
   * Badge number. Left unset on the borrower items: the mockup's figures were
   * decoration (it claimed 148 catalog rows against 13 real ones), and a wrong
   * count is worse than none. Wire these to live totals when the API lands -
   * from a hook in the feature, not from a literal here.
   */
  count?: number;
  active?: boolean;
  /** Existing ROUTES value. `undefined` = route not defined yet (TODO). */
  route?: string;
}

export interface NavSection {
  /** i18n key (e.g. "nav.staff") resolved with t() at render time. */
  labelKey: string;
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
        labelKey: "nav.borrower",
        items: [
          { key: "home", labelKey: "nav.home", icon: "home", route: ROUTES.HOME },
          { key: "catalog", labelKey: "nav.catalog", icon: "grid", route: ROUTES.CATALOG },
          { key: "rooms", labelKey: "nav.rooms", icon: "building", route: ROUTES.ROOMS },
          { key: "new-request", labelKey: "nav.newRequest", icon: "file-plus", route: ROUTES.REQUEST },
          { key: "requests", labelKey: "nav.myRequests", icon: "file", route: ROUTES.MY_LOANS },
          { key: "history", labelKey: "nav.loanHistory", icon: "clock", route: ROUTES.MY_HISTORY },
          { key: "credit", labelKey: "nav.creditScore", icon: "award", route: ROUTES.MY_CREDIT },
          { key: "appeals", labelKey: "nav.appeals", icon: "shield", route: ROUTES.APPEALS },
        ],
      },
    ],
  },

  staff: {
    persona: { name: "สมชาย พร้อมเจริญ", role: "เจ้าหน้าที่ · ภาควิศวคอมพ์", avatar: "สช" },
    sections: [
      {
        labelKey: "nav.borrower",
        items: [
          { key: "home", labelKey: "nav.home", icon: "home", route: ROUTES.HOME },
          { key: "catalog", labelKey: "nav.catalog", icon: "grid", route: ROUTES.CATALOG },
          { key: "rooms", labelKey: "nav.rooms", icon: "building", route: ROUTES.ROOMS },
          { key: "new-request", labelKey: "nav.newRequest", icon: "file-plus", route: ROUTES.REQUEST },
          { key: "requests", labelKey: "nav.myRequests", icon: "file", route: ROUTES.MY_LOANS },
        ],
      },
      {
        labelKey: "nav.staff",
        items: [
          { key: "queue", labelKey: "nav.queue", icon: "inbox", count: 23, active: true, route: ROUTES.STAFF_DASHBOARD },
          { key: "inventory", labelKey: "nav.inventory", icon: "package", route: ROUTES.STAFF_INVENTORY },
          { key: "inspect", labelKey: "nav.inspect", icon: "check-square", route: ROUTES.STAFF_INSPECTION },
        ],
      },
      {
        labelKey: "nav.departmentMgmt",
        items: [
          { key: "users", labelKey: "nav.userMgmt", icon: "users", route: ROUTES.STAFF_USERS },
          { key: "permissions", labelKey: "nav.permissions", icon: "user-x", route: ROUTES.STAFF_PERMISSIONS },
          { key: "settings", labelKey: "nav.lendingSettings", icon: "sliders", route: ROUTES.STAFF_SETTINGS },
        ],
      },
      {
        labelKey: "nav.reports",
        items: [
          { key: "analytics", labelKey: "nav.analytics", icon: "trending-up", route: ROUTES.REPORT_ANALYTICS },
          { key: "export", labelKey: "nav.exportData", icon: "download", route: ROUTES.REPORT_EXPORT },
        ],
      },
    ],
  },

  supervisor: {
    persona: { name: "ผศ.ดร. อรวรรณ ภักดี", role: "อาจารย์ · ภาควิศวคอมพ์", avatar: "อว" },
    sections: [
      {
        labelKey: "nav.borrower",
        items: [
          { key: "home", labelKey: "nav.home", icon: "home", route: ROUTES.HOME },
          { key: "catalog", labelKey: "nav.catalog", icon: "grid", route: ROUTES.CATALOG },
          { key: "rooms", labelKey: "nav.rooms", icon: "building", route: ROUTES.ROOMS },
          { key: "new-request", labelKey: "nav.newRequest", icon: "file-plus", route: ROUTES.REQUEST },
          { key: "requests", labelKey: "nav.myRequests", icon: "file", route: ROUTES.MY_LOANS },
        ],
      },
      {
        labelKey: "nav.supervisor",
        items: [
          { key: "approvals", labelKey: "nav.approvals", icon: "check-circle", count: 6, active: true, route: ROUTES.SUPERVISOR_APPROVALS },
          { key: "appeals-review", labelKey: "nav.appealsReview", icon: "shield", count: 2, route: ROUTES.SUPERVISOR_APPEALS },
        ],
      },
      {
        labelKey: "nav.departmentMgmt",
        items: [
          { key: "users", labelKey: "nav.userMgmt", icon: "users", route: ROUTES.STAFF_USERS },
          { key: "permissions", labelKey: "nav.permissions", icon: "user-x", route: ROUTES.STAFF_PERMISSIONS },
          { key: "settings", labelKey: "nav.lendingSettings", icon: "sliders", route: ROUTES.STAFF_SETTINGS },
        ],
      },
      {
        labelKey: "nav.reports",
        items: [
          { key: "analytics", labelKey: "nav.analytics", icon: "trending-up", route: ROUTES.REPORT_ANALYTICS },
          { key: "export", labelKey: "nav.exportData", icon: "download", route: ROUTES.REPORT_EXPORT },
        ],
      },
    ],
  },

  admin: {
    persona: { name: "ธนพล เจ้าหน้าที่ IT", role: "ผู้ดูแลระบบ · IT Services", avatar: "ธน" },
    sections: [
      {
        labelKey: "nav.admin",
        items: [
          { key: "sys-dashboard", labelKey: "nav.adminDashboard", icon: "layout-dashboard", route: ROUTES.ADMIN_DASHBOARD },
          { key: "sys-users", labelKey: "nav.systemUsers", icon: "users", route: ROUTES.ADMIN_USERS },
          { key: "sys-status", labelKey: "nav.systemStatus", icon: "activity", route: ROUTES.ADMIN_STATUS },
          { key: "sys-audit", labelKey: "nav.auditLog", icon: "file-text", route: ROUTES.ADMIN_AUDIT },
          { key: "sys-config", labelKey: "nav.techConfig", icon: "server", route: ROUTES.ADMIN_CONFIG },
        ],
      },
      {
        labelKey: "nav.reports",
        items: [{ key: "sys-reports", labelKey: "nav.systemReports", icon: "bar-chart", route: ROUTES.ADMIN_REPORTS }],
      },
    ],
  },
};

/**
 * Routes reached from the shell but not listed in the nav - the profile page
 * behind the avatar, and detail pages opened by clicking a row. Keys may be
 * route *patterns* ("/catalog/:id"), which `routeTitleKey` resolves.
 */
const NON_NAV_TITLE_KEYS: Record<string, string> = {
  [ROUTES.PROFILE]: "profile.title",
  [ROUTES.EQUIPMENT_DETAIL]: "nav.equipmentDetail",
  [ROUTES.ROOM_BOOKING]: "nav.roomBooking",
};

/** Flat lookup: route path → i18n label key (for breadcrumb + placeholder title). */
export const ROUTE_TITLE_KEYS: Record<string, string> = {
  ...Object.values(NAV_CONFIG)
    .flatMap((r) => r.sections)
    .flatMap((s) => s.items)
    .reduce<Record<string, string>>((acc, item) => {
      if (item.route) acc[item.route] = item.labelKey;
      return acc;
    }, {}),
  ...NON_NAV_TITLE_KEYS,
};

/**
 * Title key for a concrete pathname. Exact match first, then parameterised
 * patterns ("/catalog/:id") - without the second pass a detail page would fall
 * back to the generic "overview" crumb.
 */
export function routeTitleKey(pathname: string): string | undefined {
  const exact = ROUTE_TITLE_KEYS[pathname];
  if (exact) return exact;
  const pattern = Object.keys(ROUTE_TITLE_KEYS).find(
    (p) => p.includes(":") && matchPath(p, pathname) !== null,
  );
  return pattern ? ROUTE_TITLE_KEYS[pattern] : undefined;
}

export function getNavForRole(role: Role): RoleNav {
  return NAV_CONFIG[role];
}
