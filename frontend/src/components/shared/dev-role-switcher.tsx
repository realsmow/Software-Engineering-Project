import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/constants";
import { useAuthStore } from "@/features/auth/auth.store";
import type { Role } from "@/types/domain";

/**
 * Dev-only role switcher (brief note #5: role is toggled from a dev widget,
 * not real auth). Fixed bottom-left; each button mock-logs-in as that role and
 * returns to HOME. Rendered only when `import.meta.env.DEV` (see AppShell).
 */
const ROLE_OPTIONS: { role: Role; label: string }[] = [
  { role: "borrower", label: "ผู้ยืม" },
  { role: "staff", label: "เจ้าหน้าที่" },
  { role: "supervisor", label: "หัวหน้า" },
  { role: "admin", label: "แอดมิน" },
];

export function DevRoleSwitcher() {
  const navigate = useNavigate();
  const loginAs = useAuthStore((s) => s.loginAs);
  const current = useAuthStore((s) => s.user?.role);

  const handleSwitch = (role: Role) => {
    loginAs(role);
    navigate(ROUTES.HOME);
  };

  return (
    <div className="view-switcher">
      <span className="lbl">Role</span>
      {ROLE_OPTIONS.map(({ role, label }) => (
        <button
          key={role}
          type="button"
          className={role === current ? "active" : undefined}
          onClick={() => handleSwitch(role)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
