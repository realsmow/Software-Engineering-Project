import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-messages";
import { useTRPCClient } from "@/lib/trpc";

const MIN_PASSWORD = 8;

/**
 * Create an account.
 *
 * The confirmation is the same whether or not the address is already taken,
 * matching what the server does: a different answer for a taken address turns
 * this form into a way to find out who is registered here. Someone who does
 * already have an account learns that by mail, at the address itself.
 *
 * Nothing here chooses a role. The server always creates a borrower.
 */
export default function RegisterPage() {
  const { t } = useTranslation();
  const trpc = useTRPCClient();
  const [form, setForm] = useState({
    email: "",
    studentId: "",
    firstName: "",
    lastName: "",
    password: "",
    confirm: "",
  });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const tooShort = form.password.length > 0 && form.password.length < MIN_PASSWORD;
  const mismatch = form.confirm.length > 0 && form.password !== form.confirm;
  const complete =
    form.email.trim() &&
    form.studentId.trim() &&
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.password.length >= MIN_PASSWORD &&
    form.password === form.confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await trpc.auth.register.mutate({
        email: form.email.trim(),
        studentId: form.studentId.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        password: form.password,
      });
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-5 px-5 py-10">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t("auth.registerTitle")}</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {t("auth.registerHelp")}
        </p>
      </div>

      {sent ? (
        <p
          role="status"
          className="rounded border border-[var(--s-ok-b)] bg-[var(--s-ok-bg)] px-3 py-2 text-sm text-[var(--s-ok-t)]"
        >
          {t("auth.registerSent")}
        </p>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="rg-email">{t("auth.email")}</Label>
            <Input
              id="rg-email"
              type="email"
              autoComplete="email"
              autoFocus
              value={form.email}
              onChange={set("email")}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="rg-student-id">{t("auth.studentId")}</Label>
            <Input
              id="rg-student-id"
              autoComplete="username"
              value={form.studentId}
              onChange={set("studentId")}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="rg-first-name">{t("auth.firstName")}</Label>
              <Input
                id="rg-first-name"
                autoComplete="given-name"
                value={form.firstName}
                onChange={set("firstName")}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="rg-last-name">{t("auth.lastName")}</Label>
              <Input
                id="rg-last-name"
                autoComplete="family-name"
                value={form.lastName}
                onChange={set("lastName")}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="rg-password">{t("auth.password")}</Label>
            <Input
              id="rg-password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={set("password")}
            />
            {tooShort ? (
              <p className="text-xs text-[var(--s-warn-t)]">
                {t("profile.passwordTooShort")}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="rg-confirm">{t("auth.confirmPassword")}</Label>
            <Input
              id="rg-confirm"
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={set("confirm")}
            />
            {mismatch ? (
              <p className="text-xs text-[var(--s-warn-t)]">{t("profile.passwordMismatch")}</p>
            ) : null}
          </div>

          <Button type="submit" disabled={busy || !complete}>
            {busy ? t("common.loading") : t("auth.registerSubmit")}
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
