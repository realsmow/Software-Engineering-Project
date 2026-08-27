import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { localLoginSchema, type LocalLoginValues } from "./login.schema";

/**
 * Local account login method (accordion panel) for department staff without a
 * KU email. On valid submit, delegates to `onSubmit`, which posts to the
 * backend.
 */
export function LoginMethodLocal({
  open,
  onToggle,
  onSubmit,
  isPending = false,
  errorMessage = null,
}: {
  open: boolean;
  onToggle: () => void;
  onSubmit: (values: LocalLoginValues) => void;
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
  } = useForm<LocalLoginValues>({
    resolver: zodResolver(localLoginSchema),
    defaultValues: { username: "", password: "", remember: true },
  });

  return (
    <div className={cn("login-method", open && "open")} id="m-local">
      <button
        type="button"
        className="login-method-header"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div className="login-method-icon local">
          <Lock size={16} strokeWidth={2} />
        </div>
        <div className="login-method-text">
          <div className="login-method-title">{t("auth.localAccount")}</div>
          <div className="login-method-sub">{t("auth.localAccountHint")}</div>
        </div>
        <ChevronDown size={16} strokeWidth={2.2} className="login-method-chevron" />
      </button>

      {open && (
        <form className="login-method-body" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="field-group">
            <label className="field-label" htmlFor="loc-user">
              {t("auth.username")}
            </label>
            <input
              type="text"
              id="loc-user"
              className="field-input"
              placeholder={t("auth.usernamePlaceholder")}
              autoComplete="username"
              {...register("username")}
            />
            {errors.username && (
              <div className="field-error">{errors.username.message}</div>
            )}
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="loc-pass">
              {t("auth.password")}
            </label>
            <div className="field-input-with-suffix">
              <input
                type={showPass ? "text" : "password"}
                id="loc-pass"
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
              {t("auth.contactAdmin")}
            </a>
          </div>

          {errorMessage && (
            <div className="field-error" role="alert">
              {errorMessage}
            </div>
          )}

          <button type="submit" className="submit-btn" disabled={isPending}>
            {isPending ? t("auth.signingIn") : t("auth.signInWithLocal")}
          </button>
        </form>
      )}
    </div>
  );
}
