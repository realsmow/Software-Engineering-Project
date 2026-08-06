import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { localLoginSchema, type LocalLoginValues } from "./login.schema";

/**
 * Local account login method (accordion panel) for department staff without a
 * KU email. On valid submit, delegates to `onSubmit` (mock login — no API yet).
 */
export function LoginMethodLocal({
  open,
  onToggle,
  onSubmit,
}: {
  open: boolean;
  onToggle: () => void;
  onSubmit: (values: LocalLoginValues) => void;
}) {
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
          <div className="login-method-title">บัญชีภายในระบบ</div>
          <div className="login-method-sub">
            สำหรับเจ้าหน้าที่ประจำภาค · ชมรม · Local login
          </div>
        </div>
        <ChevronDown size={16} strokeWidth={2.2} className="login-method-chevron" />
      </button>

      {open && (
        <form className="login-method-body" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="field-group">
            <label className="field-label" htmlFor="loc-user">
              ชื่อผู้ใช้
            </label>
            <input
              type="text"
              id="loc-user"
              className="field-input"
              placeholder="ชื่อผู้ใช้ที่ผู้ดูแลระบบกำหนดให้"
              autoComplete="username"
              {...register("username")}
            />
            {errors.username && (
              <div className="field-error">{errors.username.message}</div>
            )}
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="loc-pass">
              รหัสผ่าน
            </label>
            <div className="field-input-with-suffix">
              <input
                type={showPass ? "text" : "password"}
                id="loc-pass"
                className="field-input"
                placeholder="รหัสผ่าน"
                autoComplete="current-password"
                {...register("password")}
              />
              <button
                type="button"
                className="field-input-suffix"
                onClick={() => setShowPass((v) => !v)}
              >
                {showPass ? "ซ่อน" : "แสดง"}
              </button>
            </div>
            {errors.password && (
              <div className="field-error">{errors.password.message}</div>
            )}
          </div>

          <div className="field-row">
            <label className="field-checkbox">
              <input type="checkbox" {...register("remember")} />
              จดจำการเข้าสู่ระบบ
            </label>
            <a href="#" className="field-link">
              ติดต่อผู้ดูแล
            </a>
          </div>

          <button type="submit" className="submit-btn">
            เข้าสู่ระบบด้วยบัญชีภายใน
          </button>

          <div className="login-notice">
            <b>บัญชีภายในต้องได้รับอนุญาต</b> จากเจ้าหน้าที่ประจำภาควิชาหรือหัวหน้าชมรม
            ก่อนใช้งาน หากยังไม่มีบัญชี ให้ติดต่อผู้ดูแลของหน่วยงานท่าน
          </div>
        </form>
      )}
    </div>
  );
}
