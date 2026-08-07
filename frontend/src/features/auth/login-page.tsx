import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { KULogo } from "@/components/layout/ku-logo";
import { LanguageToggle } from "@/components/shared/language-toggle";
import { useTheme } from "@/hooks/use-theme";
import { HOME_ROUTE_BY_ROLE } from "@/constants";
import { useAuthStore } from "./auth.store";
import { MOCK_LOCAL_CREDENTIALS } from "./mock-auth";
import type { LocalLoginValues } from "./login.schema";
import { LoginMethodKu } from "./login-method-ku";
import { LoginMethodLocal } from "./login-method-local";

/**
 * Login page — reference: ULMs-login-and-shell-v3.html (VIEW 1).
 * Left: green KU brand panel. Right: card with a mutually-exclusive accordion
 * of two login methods (KU email, local account) built on RHF + Zod.
 *
 * No API is wired yet (brief note #5): a successful submit mock-logs-in via the
 * auth store. The KU email method is students/faculty only → always `borrower`.
 * Staff/supervisor/admin sign in through the local-account method, which is
 * validated against MOCK_LOCAL_CREDENTIALS (temporary — see mock-auth.ts).
 * Real /auth flow replaces the mock handlers later.
 */
type Method = "ku" | "local";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const loginAs = useAuthStore((s) => s.loginAs);
  const { isDark, toggleTheme } = useTheme();
  // `null` = both panels collapsed. Clicking an open header closes it.
  const [openMethod, setOpenMethod] = useState<Method | null>("ku");

  const toggleMethod = (method: Method) =>
    setOpenMethod((current) => (current === method ? null : method));

  // KU email → borrower only (students & faculty).
  const handleKuLogin = () => {
    loginAs("borrower");
    navigate(HOME_ROUTE_BY_ROLE.borrower, { replace: true });
  };

  // Local account → staff/supervisor/admin, gated by the mock credential table.
  // Returns a Thai error message on mismatch, or null on success (then routes).
  const handleLocalLogin = (values: LocalLoginValues): string | null => {
    const match = MOCK_LOCAL_CREDENTIALS.find(
      (c) => c.username === values.username.trim() && c.password === values.password,
    );
    if (!match) return t("auth.invalidCredentials");
    loginAs(match.role);
    navigate(HOME_ROUTE_BY_ROLE[match.role], { replace: true });
    return null;
  };

  return (
    <div className="login">
      <div className="login-left">
        <div className="login-brand">
          <KULogo variant="onDark" size={64} />
          <div className="login-brand-text">
            <span className="name">{t("common.university")}</span>
          </div>
        </div>

        <div className="login-hero">
          <h1>{t("auth.heroTitle")}</h1>
          <div className="sub">{t("auth.heroSubtitle")}</div>
          <div className="login-hero-rule" />
          <div className="desc">{t("auth.heroDesc")}</div>
        </div>

        <div className="login-meta">
          <span>ULMs v1.0</span>
          <span>build 20260805</span>
          <span>ku.ac.th</span>
        </div>
      </div>

      <div className="login-right">
        <div className="login-actions">
          <LanguageToggle />
          <button
            type="button"
            className="chip-btn"
            onClick={toggleTheme}
            title={isDark ? t("theme.lightMode") : t("theme.darkMode")}
            aria-label={isDark ? t("theme.lightMode") : t("theme.darkMode")}
          >
            {isDark ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
          </button>
        </div>

        <div className="login-card">
          <div className="login-card-body">
            <div className="login-eyebrow">{t("common.signIn")}</div>
            <div className="login-title">{t("auth.universityAccount")}</div>
            <div className="login-desc">{t("auth.chooseMethod")}</div>

            <div className="login-methods">
              <LoginMethodKu
                open={openMethod === "ku"}
                onToggle={() => toggleMethod("ku")}
                onSubmit={handleKuLogin}
              />
              <LoginMethodLocal
                open={openMethod === "local"}
                onToggle={() => toggleMethod("local")}
                onSubmit={handleLocalLogin}
              />
            </div>
          </div>

          <div className="login-footer">
            <a href="#">{t("auth.termsOfUse")}</a>
            <a href="#">{t("auth.privacyPolicy")}</a>
            <a href="#">{t("auth.contactSupport")}</a>
          </div>
        </div>
      </div>
    </div>
  );
}
