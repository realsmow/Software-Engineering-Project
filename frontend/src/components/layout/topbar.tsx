import { Bell, Moon, Search, Sun } from "lucide-react";
import { useLocation } from "react-router-dom";
import { ROUTE_TITLES } from "@/constants/navigation";
import { useTheme } from "@/hooks/use-theme";

/**
 * Topbar (52px, sticky): breadcrumb, search (⌘K), theme toggle, and a
 * notification bell with an unread badge.
 */
export function Topbar() {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();

  const current = ROUTE_TITLES[location.pathname] ?? "ภาพรวมของฉัน";

  return (
    <header className="top">
      <div className="top-crumb">
        <span className="lbl">หน้าแรก</span>
        <span className="sep">›</span>
        <span className="cur">{current}</span>
      </div>

      <div className="top-right">
        <button type="button" className="top-search" aria-label="ค้นหา">
          <Search size={14} strokeWidth={2} />
          <span className="top-search-label">ค้นหา หรือกด</span>
          <span className="kbd">⌘K</span>
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          title="สลับธีม"
          aria-label="สลับธีม"
        >
          {isDark ? <Sun size={15} strokeWidth={2} /> : <Moon size={15} strokeWidth={2} />}
        </button>

        <button type="button" className="icon-btn" title="แจ้งเตือน" aria-label="แจ้งเตือน">
          <Bell size={15} strokeWidth={2} />
          <span className="dot">3</span>
        </button>
      </div>
    </header>
  );
}
