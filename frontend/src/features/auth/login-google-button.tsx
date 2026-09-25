import { useTranslation } from "react-i18next";

/**
 * FR-AUTH-01: "Sign in with Google (KU account)".
 *
 * A full browser navigation, not a fetch - the backend route redirects to
 * Google and back, which only works as a top-level page load. `/auth/google`
 * is relative on purpose: in production the API sits behind nginx on the
 * same origin as the frontend, so a relative path resolves correctly there
 * without an env var. In dev it goes through the Vite proxy (vite.config.ts).
 *
 * Rendered by the login page only once `auth.providers` says Google is
 * configured - see use-auth-providers.ts.
 */
export function LoginGoogleButton() {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      className="submit-btn"
      onClick={() => {
        window.location.href = "/auth/google";
      }}
    >
      {t("auth.signInWithGoogle")}
    </button>
  );
}
