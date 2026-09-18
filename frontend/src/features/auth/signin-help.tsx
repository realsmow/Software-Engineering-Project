import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ROUTES } from "@/constants";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * What to do when you cannot sign in.
 *
 * This replaces three separate dead links: "Forgot password?" on the KU tab,
 * "Contact admin" on the local tab, and "Contact support" in the footer. They
 * pointed at href="#", implied three support channels, and in Thai two of them
 * were the same words anyway.
 *
 * There is deliberately no self-service reset. The system sends no email, which
 * is why `admin.resetPassword` shows a temporary password on screen once, so
 * recovery genuinely runs through a person. Saying that plainly is more use
 * than a link that pretends otherwise.
 */
export function SignInHelp({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className ?? "field-link"} onClick={() => setOpen(true)}>
        {t("auth.signinHelp")}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>{t("auth.signinHelpTitle")}</DialogTitle>

          <div className="space-y-3 text-sm text-muted-foreground">
            <p>{t("auth.signinHelpIntro")}</p>

            <div>
              <div className="text-[13px] font-semibold text-foreground">
                {t("auth.kuMail")}
              </div>
              <p className="mt-0.5">{t("auth.signinHelpKu")}</p>
            </div>

            <div>
              <div className="text-[13px] font-semibold text-foreground">
                {t("auth.localAccount")}
              </div>
              <p className="mt-0.5">{t("auth.signinHelpLocal")}</p>
            </div>

            <Link
              to={ROUTES.FORGOT_PASSWORD}
              onClick={() => setOpen(false)}
              className="block border-t border-border pt-3 text-accent"
            >
              {t("auth.forgotSubmit")}
            </Link>

            <p>{t("auth.signinHelpTemp")}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
