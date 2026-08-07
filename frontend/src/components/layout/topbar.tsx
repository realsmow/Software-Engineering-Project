import { Bell, Moon, Search, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ROUTE_TITLE_KEYS } from "@/constants/navigation";
import { HOME_ROUTE_BY_ROLE } from "@/constants";
import { LanguageToggle } from "@/components/shared/language-toggle";
import { useAuthStore } from "@/features/auth/auth.store";
import { useTheme } from "@/hooks/use-theme";

/**
 * Topbar (52px, sticky): breadcrumb, search (⌘K), language + theme toggles,
 * and a notification bell with an unread badge.
 */
export function Topbar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role) ?? "borrower";
  const { isDark, toggleTheme } = useTheme();

  // Breadcrumb root is the role's own landing page (admin → System overview),
  // not a generic "Home". On the landing page itself we show a single crumb
  // instead of a redundant "Home › Home".
  const homeRoute = HOME_ROUTE_BY_ROLE[role];
  const homeLabel = t(ROUTE_TITLE_KEYS[homeRoute] ?? "nav.home");
  const current = t(ROUTE_TITLE_KEYS[location.pathname] ?? "nav.overview");
  const atHome = location.pathname === homeRoute;

  return (
    <header className="top">
      <div className="top-crumb">
        {atHome ? (
          <span className="cur">{current}</span>
        ) : (
          <>
            <button type="button" className="lbl lbl-link" onClick={() => navigate(homeRoute)}>
              {homeLabel}
            </button>
            <span className="sep">›</span>
            <span className="cur">{current}</span>
          </>
        )}
      </div>

      <div className="top-right">
        <button type="button" className="top-search" aria-label={t("common.search")}>
          <Search size={14} strokeWidth={2} />
          <span className="top-search-label">{t("common.searchHint")}</span>
          <span className="kbd">⌘K</span>
        </button>

        <LanguageToggle className="lang-btn" />

        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          title={t("theme.toggle")}
          aria-label={t("theme.toggle")}
        >
          {isDark ? <Sun size={15} strokeWidth={2} /> : <Moon size={15} strokeWidth={2} />}
        </button>

        <button
          type="button"
          className="icon-btn"
          title={t("common.notifications")}
          aria-label={t("common.notifications")}
        >
          <Bell size={15} strokeWidth={2} />
          <span className="dot">3</span>
        </button>
      </div>
    </header>
  );
}
