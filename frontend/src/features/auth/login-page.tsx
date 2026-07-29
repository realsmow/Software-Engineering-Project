import { useState } from "react";
import { AlertCircle, LogIn, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * หน้า Login — implement ตาม mockup ที่ทีม UI ส่งมา
 * Reference: ULMS_Login_UX-UI.html
 *
 * Flow:
 * 1. คลิกปุ่ม → redirect ไป Google OAuth
 * 2. Google ส่งกลับมาที่ /auth/callback
 * 3. Backend เช็ค domain @ku.th → set httpOnly cookie
 * 4. Frontend redirect ไป /
 */
type LoginState = "idle" | "loading" | "error";

export function LoginPage() {
  const [state, setState] = useState<LoginState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const handleGoogleLogin = () => {
    setState("loading");
    setErrorMessage("");

    // Redirect ไป backend endpoint สำหรับเริ่ม OAuth flow
    // Backend จะ redirect ต่อไปที่ Google
    window.location.href = `${import.meta.env.VITE_API_URL}/auth/google`;
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-5xl overflow-hidden shadow-popover p-0">
        <div className="grid md:grid-cols-[1.08fr_.92fr] min-h-[540px]">
          <BrandPanel />
          <FormPanel
            state={state}
            errorMessage={errorMessage}
            onGoogleLogin={handleGoogleLogin}
          />
        </div>
      </Card>
    </div>
  );
}

function BrandPanel() {
  return (
    <div
      className="relative overflow-hidden text-white p-11 flex flex-col"
      style={{
        background:
          "radial-gradient(760px 420px at 12% -8%, rgba(255,255,255,.14), transparent 55%), radial-gradient(620px 460px at 118% 116%, rgba(255,255,255,.10), transparent 55%), linear-gradient(158deg,#0b5c35,#0e7a46 56%,#0a4e30)",
      }}
    >
      <div className="flex items-center gap-3 font-extrabold text-xl">
        <span className="w-11 h-11 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center">
          <BoxIcon />
        </span>
        ULMs
      </div>
      <div className="mt-auto">
        <h2 className="text-[30px] font-extrabold leading-tight tracking-tight">
          ยืมง่าย คืนไว
          <br />
          ไม่ต้องจดกระดาษ
        </h2>
        <p className="mt-3 text-primary-soft max-w-[340px]">
          ระบบยืม–คืนอุปกรณ์มหาวิทยาลัย สำหรับนิสิต เจ้าหน้าที่
          และอาจารย์ผู้ดูแล
        </p>
        <ul className="mt-6 flex flex-col gap-3">
          <FeatureItem>ยืม–จองล่วงหน้าได้จากมือถือ</FeatureItem>
          <FeatureItem>ถ่ายรูปตอนรับ–คืน เป็นหลักฐานของคุณ</FeatureItem>
          <FeatureItem>ระบบพาเข้าหน้าจอตามสิทธิ์อัตโนมัติ</FeatureItem>
        </ul>
      </div>
      <div className="mt-8 text-xs text-primary-soft/80">
        © มหาวิทยาลัยเกษตรศาสตร์ · ระบบยืม–คืนอุปกรณ์
      </div>
    </div>
  );
}

function FormPanel({
  state,
  errorMessage,
  onGoogleLogin,
}: {
  state: LoginState;
  errorMessage: string;
  onGoogleLogin: () => void;
}) {
  return (
    <div className="bg-card flex items-center justify-center p-10">
      <div className="w-full max-w-[340px] text-center">
        <div className="w-13 h-13 rounded-2xl bg-primary-soft text-primary flex items-center justify-center mx-auto mb-4">
          <BoxIcon color="currentColor" />
        </div>
        <h3 className="text-h2 font-extrabold">ยินดีต้อนรับ</h3>
        <p className="text-muted-foreground text-small mt-2">
          เข้าสู่ระบบเพื่อยืม–คืนอุปกรณ์
          <br />
          ด้วยบัญชีนนทรี (KU Google Workspace)
        </p>

        {state === "error" && (
          <ErrorAlert message={errorMessage || "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่"} />
        )}

        <GoogleButton state={state} onClick={onGoogleLogin} />

        <div className="mt-3 text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <ShieldCheck size={14} />
          รองรับเฉพาะอีเมล <b className="text-foreground">@ku.th</b> เท่านั้น
        </div>

        <p className="mt-6 text-[11px] text-muted-foreground/80 leading-relaxed">
          การเข้าสู่ระบบถือว่ายอมรับ{" "}
          <a href="#" className="text-primary">
            เงื่อนไขการใช้งาน
          </a>{" "}
          และ{" "}
          <a href="#" className="text-primary">
            นโยบายความเป็นส่วนตัว
          </a>
          <br />
          ULMs v1.0 · KU · 2568
        </p>
      </div>
    </div>
  );
}

function GoogleButton({
  state,
  onClick,
}: {
  state: LoginState;
  onClick: () => void;
}) {
  const isLoading = state === "loading";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      aria-label="ลงชื่อเข้าใช้ด้วย Google"
      className={cn(
        "mt-6 w-full h-12 rounded-xl border bg-white flex items-center justify-center gap-3 font-bold text-[15px] transition-colors focus-ring",
        isLoading
          ? "border-border bg-muted text-muted-foreground cursor-not-allowed"
          : "border-[#dadce0] text-[#3c4043] hover:bg-muted/50"
      )}
    >
      {isLoading ? (
        <>
          <span className="w-5 h-5 border-[2.4px] border-muted border-t-primary rounded-full animate-spin" />
          <span>กำลังเชื่อมต่อ Google…</span>
        </>
      ) : (
        <>
          <GoogleLogo />
          <span>ลงชื่อเข้าใช้ด้วย Google</span>
        </>
      )}
    </button>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mt-6 flex text-left gap-3 p-3 rounded-xl bg-destructive-soft border border-destructive/20 text-destructive text-small"
    >
      <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
      <div>
        <b className="block">เข้าสู่ระบบไม่สำเร็จ</b>
        {message}
      </div>
    </div>
  );
}

function FeatureItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-small text-primary-soft">
      <span className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
        <LogIn size={13} strokeWidth={2.4} />
      </span>
      {children}
    </li>
  );
}

// เดี๋ยว replace ด้วย logo จริง — ตอนนี้ใช้กล่องเหลี่ยม (matching mockup SVG)
function BoxIcon({ color = "#fff" }: { color?: string }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16Z" />
      <path d="M3.5 8 12 12.5 20.5 8M12 12.5v8" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48">
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
