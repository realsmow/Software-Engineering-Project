import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-messages";
import { useTRPCClient } from "@/lib/trpc";

/**
 * Ask for a reset link.
 *
 * The confirmation is the same whether or not the address has an account, and
 * deliberately so: a different answer for a missing address turns this form
 * into a way to find out who is registered here. The server behaves the same
 * way, so the two cannot drift.
 */
export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const trpc = useTRPCClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await trpc.auth.requestPasswordReset.mutate({ email });
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-5 px-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t("auth.forgotTitle")}</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {t("auth.forgotHelp")}
        </p>
      </div>

      {sent ? (
        <p
          role="status"
          className="rounded border border-[var(--s-ok-b)] bg-[var(--s-ok-bg)] px-3 py-2 text-sm text-[var(--s-ok-t)]"
        >
          {t("auth.forgotSent")}
        </p>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="fp-email">{t("auth.email")}</Label>
            <Input
              id="fp-email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy || !email.trim()}>
            {busy ? t("common.loading") : t("auth.forgotSubmit")}
          </Button>
          {error ? <p className="text-xs text-[var(--s-warn-t)]">{error}</p> : null}
        </form>
      )}

      <Link to={ROUTES.LOGIN} className="text-sm text-accent">
        {t("auth.backToSignIn")}
      </Link>
    </div>
  );
}
