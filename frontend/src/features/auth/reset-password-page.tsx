import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-messages";
import { useTRPCClient } from "@/lib/trpc";

/**
 * Spend a reset link.
 *
 * The token comes from the query string, so the page is only ever reached by
 * following the mail. A missing one is shown as the same failure as a spent or
 * expired one, because the server does not distinguish them either.
 */
export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const trpc = useTRPCClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError(t("profile.passwordTooShort"));
    if (next !== confirm) return setError(t("profile.passwordMismatch"));

    setBusy(true);
    try {
      await trpc.auth.resetPasswordWithToken.mutate({ token, newPassword: next });
      navigate(ROUTES.LOGIN, { replace: true, state: { passwordReset: true } });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-5 px-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t("auth.resetTitle")}</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {t("auth.resetHelp")}
        </p>
      </div>

      {token ? (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="rp-new">{t("profile.newPassword")}</Label>
            <Input
              id="rp-new"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="rp-confirm">{t("profile.confirmPassword")}</Label>
            <Input
              id="rp-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy || !next || !confirm}>
            {busy ? t("common.loading") : t("auth.resetSubmit")}
          </Button>
          {error ? <p className="text-xs text-[var(--s-warn-t)]">{error}</p> : null}
        </form>
      ) : (
        <p className="rounded border border-[var(--s-warn-b)] bg-[var(--s-warn-bg)] px-3 py-2 text-sm text-[var(--s-warn-t)]">
          {t("auth.resetNoToken")}
        </p>
      )}

      <Link to={ROUTES.FORGOT_PASSWORD} className="text-sm text-accent">
        {t("auth.forgotSubmit")}
      </Link>
    </div>
  );
}
