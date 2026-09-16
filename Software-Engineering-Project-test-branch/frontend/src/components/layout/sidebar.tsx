import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { KULogo } from "./ku-logo";
import { NavIcon } from "./nav-icon";
import { getNavForRole } from "@/constants/navigation";
import { ROUTES } from "@/constants";
import { useTRPCClient } from "@/lib/trpc";
import { useAuthStore } from "@/features/auth/auth.store";
import { cn } from "@/lib/utils";

/**
 * Sidebar (240px): KU logo + brand at top, role nav sections in the middle,
 * user info + logout at the bottom. Nav is driven by NAV_CONFIG for the
 * current user's role; active item is derived from the URL.
 */
export function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const trpcClient = useTRPCClient();

  const role = user?.role ?? "borrower";
  const { persona, sections } = getNavForRole(role);

  /**
   * Show the signed-in account, not the role's stock persona.
   *
   * NAV_CONFIG carries a hardcoded persona per role, which was right while
   * auth was mocked. Against a real session it puts someone else's name and
   * student ID under the avatar of whoever is actually logged in, which is
   * worse than showing nothing. The persona is kept only as the pre-hydration
   * placeholder, for the moment before auth.me resolves.
   */
  const displayName = user?.name ?? persona.name;
  const displayRole = user
    ? `${t(`nav.${user.role}`)} · ${user.studentId}`
    : persona.role;
  const avatar = user ? user.name.trim().slice(0, 2) : persona.avatar;

  const handleLogout = async () => {
    // Drop the httpOnly cookie server-side first; clearing only the local
    // store would leave a still-valid session on the next page load.
    // A failed call must not strand the user on a page they meant to leave.
    try {
      await trpcClient.auth.logout.mutate();
    } catch {
      /* sign out locally regardless */
    }
    logout();
    navigate(ROUTES.LOGIN, { replace: true });
  };

  return (
    <aside className="side">
      <div className="side-head">
        <KULogo variant="onLight" size={36} />
        <div className="side-head-text">
          <div className="side-head-title">ULMs</div>
          <div className="side-head-sub">{t("common.university")}</div>
        </div>
      </div>

      <nav className="side-nav">
        {sections.map((section) => (
          <div className="side-section" key={section.labelKey}>
            <div className="side-section-label">{t(section.labelKey)}</div>
            {section.items.map((item) => {
              const isActive = item.route
                ? location.pathname === item.route
                : false;
              const label = t(item.labelKey);
              return (
                <button
                  key={item.key}
                  type="button"
                  className={cn("side-item", isActive && "active")}
                  disabled={!item.route}
                  onClick={() => item.route && navigate(item.route)}
                  title={label}
                >
                  <NavIcon name={item.icon} />
                  <span className="side-item-label">{label}</span>
                  {item.count != null && <span className="count tnum">{item.count}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="side-foot">
        <button
          type="button"
          className="side-profile"
          onClick={() => navigate(ROUTES.PROFILE)}
          title={t("profile.viewProfile")}
          aria-label={t("profile.viewProfile")}
        >
          <div className="side-avatar">{avatar}</div>
          <div className="side-user">
            <div className="side-user-name">{displayName}</div>
            <div className="side-user-role">{displayRole}</div>
          </div>
        </button>
        <button
          type="button"
          className="side-logout"
          title={t("common.signOut")}
          aria-label={t("common.signOut")}
          onClick={handleLogout}
        >
          <LogOut size={15} strokeWidth={2} />
        </button>
      </div>
    </aside>
  );
}
