import { useEffect, useState } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { NavIcon } from "./nav-icon";
import { Sidebar } from "./sidebar";
import { getNavForRole } from "@/constants/navigation";
import { useAuthStore } from "@/features/auth/auth.store";
import { cn } from "@/lib/utils";

/** How many role nav items show as primary tabs before the rest fold into "More". */
const PRIMARY_TABS = 4;

/**
 * MobileTabBar: bottom navigation shown only on narrow screens (≤900px, where
 * the sidebar is hidden). It flattens the current role's nav into up to four
 * primary tabs plus a "More" tab that opens the full Sidebar as a slide-in
 * drawer, so every destination (and profile/logout) stays reachable on mobile.
 */
export function MobileTabBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const role = useAuthStore((s) => s.user?.role) ?? "borrower";
  const [drawerOpen, setDrawerOpen] = useState(false);

  // All role nav items, flattened across sections, that have a real route.
  const allItems = getNavForRole(role)
    .sections.flatMap((s) => s.items)
    .filter((i) => i.route);
  const primary = allItems.slice(0, PRIMARY_TABS);
  const overflow = allItems.slice(PRIMARY_TABS);

  // If the active route lives in the overflow set, highlight the "More" tab.
  const activeInOverflow = overflow.some((i) => i.route === location.pathname);

  // Close the drawer whenever the route changes (e.g. a link inside it fires).
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  return (
    <>
      <nav className="tabbar" aria-label={t("nav.borrower")}>
        {primary.map((item) => {
          const isActive = location.pathname === item.route;
          const label = t(item.labelKey);
          return (
            <button
              key={item.key}
              type="button"
              className={cn("tabbar-item", isActive && "active")}
              onClick={() => item.route && navigate(item.route)}
              aria-current={isActive ? "page" : undefined}
            >
              <NavIcon name={item.icon} size={20} />
              <span className="tabbar-label">{label}</span>
            </button>
          );
        })}

        <button
          type="button"
          className={cn("tabbar-item", (drawerOpen || activeInOverflow) && "active")}
          onClick={() => setDrawerOpen(true)}
          aria-haspopup="menu"
          aria-expanded={drawerOpen}
        >
          <MoreHorizontal size={20} strokeWidth={2} />
          <span className="tabbar-label">{t("nav.more")}</span>
        </button>
      </nav>

      {drawerOpen && (
        <div className="mobile-drawer" role="dialog" aria-modal="true">
          <button
            type="button"
            className="mobile-drawer-backdrop"
            aria-label={t("common.close")}
            onClick={() => setDrawerOpen(false)}
          />
          <div className="mobile-drawer-panel">
            <button
              type="button"
              className="mobile-drawer-close icon-btn"
              aria-label={t("common.close")}
              onClick={() => setDrawerOpen(false)}
            >
              <X size={16} strokeWidth={2} />
            </button>
            <Sidebar />
          </div>
        </div>
      )}
    </>
  );
}
