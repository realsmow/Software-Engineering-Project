import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KULogo } from "@/components/layout/ku-logo";
import { useTheme } from "@/hooks/use-theme";
import { ROUTES } from "@/constants";
import { useAuthStore } from "./auth.store";
import { LoginMethodKu } from "./login-method-ku";
import { LoginMethodLocal } from "./login-method-local";

/**
 * Login page — reference: ULMs-login-and-shell-v3.html (VIEW 1).
 * Left: green KU brand panel. Right: card with a mutually-exclusive accordion
 * of two login methods (KU email, local account) built on RHF + Zod.
 *
 * No API is wired yet (brief note #5): a successful submit mock-logs-in via the
 * auth store (KU email → borrower, local account → staff) and routes to HOME.
 * Real /auth flow replaces the mock handlers later.
 */
type Method = "ku" | "local";

export function LoginPage() {
  const navigate = useNavigate();
  const loginAs = useAuthStore((s) => s.loginAs);
  const { isDark, toggleTheme } = useTheme();
  const [openMethod, setOpenMethod] = useState<Method>("ku");

  const handleKuLogin = () => {
    loginAs("borrower");
    navigate(ROUTES.HOME, { replace: true });
  };

  const handleLocalLogin = () => {
    loginAs("staff");
    navigate(ROUTES.HOME, { replace: true });
  };

  return (
    <div className="login">
      <div className="login-left">
        <div className="login-brand">
          <KULogo variant="onDark" size={64} />
          <div className="login-brand-text">
            มหาวิทยาลัยเกษตรศาสตร์
            <span className="name">คณะวิศวกรรมศาสตร์</span>
          </div>
        </div>

        <div className="login-hero">
          <h1>
            ระบบบริหารจัดการ
            <br />
            การยืม–คืนอุปกรณ์
          </h1>
          <div className="sub">ULMs · University Lending Management System</div>
          <div className="login-hero-rule" />
          <div className="desc">
            สำหรับนิสิต อาจารย์ และเจ้าหน้าที่ประจำภาควิชา ในการยืม–คืนครุภัณฑ์
            อุปกรณ์ทดลอง และจองพื้นที่ห้องปฏิบัติการทั่วคณะ
          </div>
        </div>

        <div className="login-meta">
          <span>ULMs v1.0</span>
          <span>build 20260805</span>
          <span>ku.ac.th</span>
        </div>
      </div>

      <div className="login-right">
        <div className="login-actions">
          <button
            type="button"
            className="chip-btn"
            onClick={toggleTheme}
            aria-label="สลับธีม"
          >
            <span>{isDark ? "โหมดสว่าง" : "โหมดมืด"}</span>
          </button>
        </div>

        <div className="login-card">
          <div className="login-card-body">
            <div className="login-eyebrow">เข้าสู่ระบบ</div>
            <div className="login-title">บัญชีของมหาวิทยาลัย</div>
            <div className="login-desc">
              เลือกวิธีเข้าสู่ระบบด้านล่าง สำหรับนิสิตและอาจารย์ให้ใช้อีเมล KU
              เจ้าหน้าที่ที่ไม่มีอีเมล KU ให้ใช้บัญชีภายในระบบ
            </div>

            <div className="login-methods">
              <LoginMethodKu
                open={openMethod === "ku"}
                onToggle={() => setOpenMethod("ku")}
                onSubmit={handleKuLogin}
              />
              <LoginMethodLocal
                open={openMethod === "local"}
                onToggle={() => setOpenMethod("local")}
                onSubmit={handleLocalLogin}
              />
            </div>
          </div>

          <div className="login-footer">
            <a href="#">เงื่อนไขการใช้งาน</a>
            <a href="#">นโยบายความเป็นส่วนตัว</a>
            <a href="#">ติดต่อผู้ดูแล</a>
          </div>
        </div>
      </div>
    </div>
  );
}
