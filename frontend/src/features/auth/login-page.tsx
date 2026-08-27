import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";
import { KULogo } from "@/components/layout/ku-logo";
import { LanguageToggle } from "@/components/shared/language-toggle";
import { useTheme } from "@/hooks/use-theme";
import { LoginMethodKu } from "./login-method-ku";
import { LoginMethodLocal } from "./login-method-local";
import {
  loginErrorKey,
  useLoginWithKuEmail,
  useLoginWithLocalAccount,
} from "./use-auth-actions";

/**
 * Login page — reference: ULMs-login-and-shell-v3.html (VIEW 1).
 * Left: green KU brand panel. Right: card with a mutually-exclusive accordion
 * of two login methods (KU email, local account) built on RHF + Zod.
 *
 * Both methods post to the backend (auth.loginWithKuEmail /
 * auth.loginWithLocalAccount). The server decides the role and sets an
 * httpOnly session cookie; this page only redirects to that role's home.
 */
type Method = "ku" | "local";

export function LoginPage() {
  const { t } = useTranslation();
  const { isDark, toggleTheme } = useTheme();
  // `null` = both panels collapsed. Clicking an open header closes it.
  const [openMethod, setOpenMethod] = useState<Method | null>("ku");

  const kuLogin = useLoginWithKuEmail();
  const localLogin = useLoginWithLocalAccount();

  const toggleMethod = (method: Method) =>
    setOpenMethod((current) => (current === method ? null : method));

  // Redirect on success is handled centrally in use-auth-actions.ts, since
  // the target route depends on the role the *server* returns.
  const errorFor = (error: unknown) => (error ? t(loginErrorKey(error)) : null);

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
                onSubmit={(values) => kuLogin.mutate(values)}
                isPending={kuLogin.isPending}
                errorMessage={errorFor(kuLogin.error)}
              />
              <LoginMethodLocal
                open={openMethod === "local"}
                onToggle={() => toggleMethod("local")}
                onSubmit={(values) => localLogin.mutate(values)}
                isPending={localLogin.isPending}
                errorMessage={errorFor(localLogin.error)}
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
