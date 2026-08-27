import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { kuLoginSchema, type KuLoginValues } from "./login.schema";

/**
 * KU email login method (accordion panel). Google-styled submit button.
 * On valid submit, delegates to `onSubmit`, which posts to the backend.
 */
export function LoginMethodKu({
  open,
  onToggle,
  onSubmit,
  isPending = false,
  errorMessage = null,
}: {
  open: boolean;
  onToggle: () => void;
  onSubmit: (values: KuLoginValues) => void;
  /** Disables the submit button while the request is in flight. */
  isPending?: boolean;
  /** Server-side failure, already translated by the page. */
  errorMessage?: string | null;
}) {
  const { t } = useTranslation();
  const [showPass, setShowPass] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<KuLoginValues>({
    resolver: zodResolver(kuLoginSchema),
    defaultValues: { email: "", password: "", remember: true },
  });

  return (
    <div className={cn("login-method", open && "open")} id="m-ku">
      <button
        type="button"
        className="login-method-header"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div className="login-method-icon ku">KU</div>
        <div className="login-method-text">
          <div className="login-method-title">{t("auth.kuMail")}</div>
          <div className="login-method-sub">{t("auth.kuMailHint")}</div>
        </div>
        <ChevronDown size={16} strokeWidth={2.2} className="login-method-chevron" />
      </button>

      {open && (
        <form className="login-method-body" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="field-group">
            <label className="field-label" htmlFor="ku-email">
              {t("auth.email")}
            </label>
            <input
              type="email"
              id="ku-email"
              className="field-input"
              placeholder="username@ku.ac.th"
              autoComplete="username"
              {...register("email")}
            />
            {errors.email && <div className="field-error">{errors.email.message}</div>}
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="ku-pass">
              {t("auth.password")}
            </label>
            <div className="field-input-with-suffix">
              <input
                type={showPass ? "text" : "password"}
                id="ku-pass"
                className="field-input"
                placeholder={t("auth.password")}
                autoComplete="current-password"
                {...register("password")}
              />
              <button
                type="button"
                className="field-input-suffix"
                onClick={() => setShowPass((v) => !v)}
              >
                {showPass ? t("auth.hidePassword") : t("auth.showPassword")}
              </button>
            </div>
            {errors.password && (
              <div className="field-error">{errors.password.message}</div>
            )}
          </div>

          <div className="field-row">
            <label className="field-checkbox">
              <input type="checkbox" {...register("remember")} />
              {t("auth.rememberMe")}
            </label>
            <a href="#" className="field-link">
              {t("auth.forgotPassword")}
            </a>
          </div>

          {errorMessage && (
            <div className="field-error" role="alert">
              {errorMessage}
            </div>
          )}

          <button type="submit" className="submit-btn google" disabled={isPending}>
            <span className="google-icon" aria-hidden="true">
              <GoogleLogo />
            </span>
            {isPending ? t("auth.signingIn") : t("auth.signInWithKuMail")}
          </button>
        </form>
      )}
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
