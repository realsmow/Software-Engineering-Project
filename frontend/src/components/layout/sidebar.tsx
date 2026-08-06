import { LogOut } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { KULogo } from "./ku-logo";
import { NavIcon } from "./nav-icon";
import { getNavForRole } from "@/constants/navigation";
import { ROUTES } from "@/constants";
import { useAuthStore } from "@/features/auth/auth.store";
import { cn } from "@/lib/utils";

/**
 * Sidebar (240px): KU logo + brand at top, role nav sections in the middle,
 * user info + logout at the bottom. Nav is driven by NAV_CONFIG for the
 * current user's role; active item is derived from the URL.
 */
export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const role = user?.role ?? "borrower";
  const { persona, sections } = getNavForRole(role);

  const handleLogout = () => {
    logout();
    navigate(ROUTES.LOGIN, { replace: true });
  };

  return (
    <aside className="side">
      <div className="side-head">
        <KULogo variant="onLight" size={36} />
        <div className="side-head-text">
          <div className="side-head-title">ULMs</div>
          <div className="side-head-sub">คณะวิศวกรรมศาสตร์</div>
        </div>
      </div>

      <nav className="side-nav">
        {sections.map((section) => (
          <div className="side-section" key={section.label}>
            <div className="side-section-label">{section.label}</div>
            {section.items.map((item) => {
              const isActive = item.route
                ? location.pathname === item.route
                : false;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={cn("side-item", isActive && "active")}
                  disabled={!item.route}
                  onClick={() => item.route && navigate(item.route)}
                  title={item.label}
                >
                  <NavIcon name={item.icon} />
                  <span className="side-item-label">{item.label}</span>
                  {item.count != null && <span className="count tnum">{item.count}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="side-foot">
        <div className="side-avatar">{persona.avatar}</div>
        <div className="side-user">
          <div className="side-user-name">{persona.name}</div>
          <div className="side-user-role">{persona.role}</div>
        </div>
        <button
          type="button"
          className="side-logout"
          title="ออกจากระบบ"
          aria-label="ออกจากระบบ"
          onClick={handleLogout}
        >
          <LogOut size={15} strokeWidth={2} />
        </button>
      </div>
    </aside>
  );
}
