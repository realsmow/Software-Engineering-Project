import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { kuLoginSchema, type KuLoginValues } from "./login.schema";

/**
 * KU email login method (accordion panel).
 * On valid submit, delegates to `onSubmit` - the page maps this to a mock
 * login (no API yet, brief note #5).
 */
export function LoginMethodKu({
  open,
  onToggle,
  onSubmit,
}: {
  open: boolean;
  onToggle: () => void;
  /** Returns a Thai error message to display, or null/undefined on success. */
  onSubmit: (values: KuLoginValues) => Promise<string | null | void> | string | null | void;
}) {
  const { t } = useTranslation();
  const [showPass, setShowPass] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<KuLoginValues>({
    resolver: zodResolver(kuLoginSchema),
    defaultValues: { email: "", password: "", remember: true },
  });

  // Server rejections (bad credentials) arrive after the schema already
  // passed, so they surface as a root error rather than a field error.
  const handleValid = async (values: KuLoginValues) => {
    clearErrors("root");
    const error = await onSubmit(values);
    if (error) setError("root", { type: "manual", message: error });
  };

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
        <form className="login-method-body" onSubmit={handleSubmit(handleValid)} noValidate>
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

          {errors.root && (
            <div className="field-error" role="alert">
              {errors.root.message}
            </div>
          )}

          <button type="submit" className="submit-btn">
            {t("auth.signInWithKuMail")}
          </button>
        </form>
      )}
    </div>
  );
}
