import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { ROUTES } from "@/constants";
import { getErrorMessage } from "@/lib/error-messages";
import { useTRPCClient } from "@/lib/trpc";

type State = "checking" | "done" | "failed";

/**
 * Spend a confirmation link.
 *
 * Runs on mount because the link is the whole interaction; there is nothing
 * for the visitor to fill in. The guard ref is what stops React's development
 * double-effect from spending the token twice and reporting the second,
 * already-used attempt as a failure.
 */
export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const trpc = useTRPCClient();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [state, setState] = useState<State>(token ? "checking" : "failed");
  const [error, setError] = useState<string | null>(token ? null : t("auth.verifyNoToken"));
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;

    trpc.auth.verifyEmail
      .mutate({ token })
      .then(() => setState("done"))
      .catch((err: unknown) => {
        setError(getErrorMessage(err));
        setState("failed");
      });
  }, [token, trpc]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-5 px-5">
      <h1 className="text-xl font-semibold text-foreground">{t("auth.verifyTitle")}</h1>

      {state === "checking" ? (
        <p className="text-sm text-muted-foreground">{t("auth.verifyChecking")}</p>
      ) : null}

      {state === "done" ? (
        <p
          role="status"
          className="rounded border border-[var(--s-ok-b)] bg-[var(--s-ok-bg)] px-3 py-2 text-sm text-[var(--s-ok-t)]"
        >
          {t("auth.verifyDone")}
        </p>
      ) : null}

      {state === "failed" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-[var(--s-warn-t)]">{t("auth.verifyFailed")}</p>
          {error ? <p className="text-xs text-muted-foreground">{error}</p> : null}
          <Link to={ROUTES.REGISTER} className="text-sm text-accent">
            {t("auth.createAccount")}
          </Link>
        </div>
      ) : null}

      <Link to={ROUTES.LOGIN} className="text-sm text-accent">
        {t("auth.backToSignIn")}
      </Link>
    </div>
  );
}
