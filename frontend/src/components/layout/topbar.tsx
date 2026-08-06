import { Bell, Moon, Search, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { ROUTE_TITLE_KEYS } from "@/constants/navigation";
import { LanguageToggle } from "@/components/shared/language-toggle";
import { useTheme } from "@/hooks/use-theme";

/**
 * Topbar (52px, sticky): breadcrumb, search (⌘K), language + theme toggles,
 * and a notification bell with an unread badge.
 */
export function Topbar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();

  const current = t(ROUTE_TITLE_KEYS[location.pathname] ?? "nav.overview");

  return (
    <header className="top">
      <div className="top-crumb">
        <span className="lbl">{t("nav.home")}</span>
        <span className="sep">›</span>
        <span className="cur">{current}</span>
      </div>

      <div className="top-right">
        <button type="button" className="top-search" aria-label={t("common.search")}>
          <Search size={14} strokeWidth={2} />
          <span className="top-search-label">{t("common.searchHint")}</span>
          <span className="kbd">⌘K</span>
        </button>

        <LanguageToggle className="icon-btn" />

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
