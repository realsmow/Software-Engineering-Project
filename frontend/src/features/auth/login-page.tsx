import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { KULogo } from "@/components/layout/ku-logo";
import { LanguageToggle } from "@/components/shared/language-toggle";
import { useTheme } from "@/hooks/use-theme";
import { HOME_ROUTE_BY_ROLE } from "@/constants";
import { useTRPCClient } from "@/lib/trpc";
import { useAuthStore } from "./auth.store";
import { toClientUser } from "./user.adapter";
import type { KuLoginValues, LocalLoginValues } from "./login.schema";
import { LoginMethodKu } from "./login-method-ku";
import { LoginMethodLocal } from "./login-method-local";

/**
 * Login page — reference: ULMs-login-and-shell-v3.html (VIEW 1).
 * Left: green KU brand panel. Right: card with a mutually-exclusive accordion
 * of two login methods (KU email, local account) built on RHF + Zod.
 *
 * Both methods call the same `auth.login` mutation — the only difference is
 * which identifier is sent. The server matches it against either Email or
 * UserID and decides the role from the account row, so the client no longer
 * picks a role. On success the session arrives as an httpOnly cookie and the
 * returned profile seeds the store.
 */
type Method = "ku" | "local";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const trpcClient = useTRPCClient();
  const { isDark, toggleTheme } = useTheme();
  // `null` = both panels collapsed. Clicking an open header closes it.
  const [openMethod, setOpenMethod] = useState<Method | null>("ku");

  const toggleMethod = (method: Method) =>
    setOpenMethod((current) => (current === method ? null : method));

  /**
   * Shared sign-in path. Returns a Thai error message for the form to show,
   * or null once the store is seeded and the route has changed.
   *
   * Every failure maps to the same message on purpose: the server answers
   * INVALID_CREDENTIALS whether the account is missing or the password is
   * wrong, and re-splitting that here would undo it.
   */
  const signIn = async (username: string, password: string): Promise<string | null> => {
    try {
      const { user } = await trpcClient.auth.login.mutate({ username, password });
      const clientUser = toClientUser(user);
      setUser(clientUser);
      navigate(HOME_ROUTE_BY_ROLE[clientUser.role], { replace: true });
      return null;
    } catch {
      return t("auth.invalidCredentials");
    }
  };

  // KU email → the email is the identifier.
  const handleKuLogin = (values: KuLoginValues) => signIn(values.email.trim(), values.password);

  // Local account → the assigned username (AccountInfo.UserID).
  const handleLocalLogin = (values: LocalLoginValues) =>
    signIn(values.username.trim(), values.password);

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
