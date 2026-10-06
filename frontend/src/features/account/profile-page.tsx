import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, IdCard, Building2, KeyRound, Award, Camera, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CREDIT_BANDS } from "@/constants";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/constants";
import { fmtDate } from "@/lib/datetime";
import { getErrorMessage } from "@/lib/error-messages";
import { useAuthStore } from "@/features/auth/auth.store";
import { useLogoutAll } from "@/features/auth/use-logout-all";
import { useChangePassword } from "@/features/auth/use-change-password";
import { useMyCredit } from "./use-my-credit";
import { penaltyReasonText } from "@/features/borrower/appeals/penalty-reason";
import { validateUploadFile, uploadAcceptAttr } from "@/lib/upload-validation";
import { useTRPCClient } from "@/lib/trpc";
import { apiClient } from "@/lib/api-client";
import { toClientUser } from "@/features/auth/user.adapter";
import type { Role } from "@/types/domain";

/** Role → badge tone. */
const ROLE_TONE: Record<Role, "info" | "ok" | "warn" | "neutral"> = {
  borrower: "info",
  staff: "ok",
  supervisor: "warn",
  admin: "neutral",
};

/**
 * Account profile - reached from the sidebar's lower-left user button.
 *
 * Reads the current user from the auth store, which `auth.me` fills.
 */
export default function ProfilePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  // Score and band come from `auth.me` via the store; this adds the borrow
  // window and the penalties actually in force behind them.
  const { data: credit } = useMyCredit();

  if (!user) return null;

  const role = user.role;
  const creditBand = credit?.band ?? user.creditBand;
  const band = CREDIT_BANDS.find((b) => b.band === creditBand) ?? CREDIT_BANDS[0];
  const initials = user.name.trim().slice(0, 2);

  return (
    <div>
      <PageHeader title={t("profile.title")} subtitle={t("profile.subtitle")} />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Identity */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{t("profile.identity")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
            <AvatarUpload initials={initials} />
            <div>
              <div className="text-lg font-semibold text-foreground">{user.name}</div>
              <div className="mt-0.5 text-sm text-muted-foreground">{user.email}</div>
            </div>
            <Badge tone={ROLE_TONE[role]}>{t(`nav.${role}`)}</Badge>
          </CardContent>
        </Card>

        {/* Account details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("profile.accountDetails")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-4 py-4 sm:grid-cols-2">
            <DetailRow
              icon={<IdCard size={15} />}
              label={t("profile.studentId")}
              value={user.studentId}
            />
            <DetailRow
              icon={<Mail size={15} />}
              label={t("common.email")}
              value={user.email}
            />
            <DetailRow
              icon={<Building2 size={15} />}
              label={t("profile.faculty")}
              // auth.me sends the faculty name only; departmentId carries it.
              value={user.departmentId || t("profile.notSpecified")}
            />
            <DetailRow
              icon={<KeyRound size={15} />}
              label={t("profile.authMethod")}
              // Recorded on the session at sign-in (#170), not guessed from the email.
              value={t(
                user.signInMethod === "google"
                  ? "profile.authGoogle"
                  : user.signInMethod === "password"
                    ? "profile.authPassword"
                    : "profile.authUnknown"
              )}
            />
          </CardContent>
        </Card>

        {/* Credit. Every role can borrow, so every account has a standing. */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t("profile.credit")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-8 py-5">
            <div className="flex items-center gap-3">
              <Award size={22} className="text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">
                  {t("profile.creditScore")}
                </div>
                <div className="text-2xl font-semibold tabular-nums text-foreground">
                  {user.creditScore}
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                {t("profile.creditBand")}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-foreground">
                  {band.band}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t(`creditBand.${band.band}`)}
                </span>
              </div>
            </div>
            {/* The real window, from BorrowConstraints - not the static
                CREDIT_BANDS row, which is only a fallback. */}
            {credit ? (
              <div>
                <div className="text-xs text-muted-foreground">
                  {t("profile.borrowWindow")}
                </div>
                <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
                  {t("borrower.detail.days", { count: credit.maxBorrowDays })}
                </div>
              </div>
            ) : null}
          </CardContent>

          {/* Only when there are any - an empty list is the normal case and
              does not need a heading of its own. */}
          {credit && credit.penalties.length > 0 ? (
            <CardContent className="border-t border-border py-4">
              <div className="mb-2 text-xs text-muted-foreground">
                {t("profile.activePenalties", {
                  count: credit.penalties.length,
                  total: credit.totalDeducted,
                })}
              </div>
              <ul className="flex flex-col gap-1.5">
                {credit.penalties.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate text-foreground">
                      {p.itemName ? `${p.itemName} · ` : ""}
                      {penaltyReasonText(p.reason, t)}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      -{p.creditDeducted} ·{" "}
                      {t("profile.penaltyUntil", {
                        date: fmtDate(p.expiresAt),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          ) : null}
        </Card>

        {/* Sessions. Placed last because it is the thing you come here to do
            deliberately, not something to read in passing. */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t("profile.security")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 py-5">
            <ChangePassword />

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
              <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                {t("profile.signOutEverywhereHelp")}
              </p>
              <SignOutEverywhere />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Ends every session the account holds.
 *
 * Asks first: the person doing this is on one of the devices it will sign out,
 * so it always costs them their current session too. That is the intended
 * behaviour - a stolen session is not revoked by leaving one alive - but it
 * should not happen on a stray tap.
 */
/**
 * Change your own password.
 *
 * The current password is asked for even though the page is behind a session:
 * the server requires it, so that a browser somebody else walked up to cannot
 * be used to lock the owner out. The confirm field is this side's own idea -
 * a typo in a password you cannot read back is the one mistake that cannot be
 * undone from here.
 */
function ChangePassword() {
  const { t } = useTranslation();
  const changePassword = useChangePassword();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);

    // Checked here as well as on the server, so the person is not told off by
    // a round trip for something the form already knows.
    if (form.next.length < 8) return setError(t("profile.passwordTooShort"));
    if (form.next !== form.confirm) return setError(t("profile.passwordMismatch"));

    try {
      const out = await changePassword.mutateAsync({
        currentPassword: form.current,
        newPassword: form.next,
      });
      setForm({ current: "", next: "", confirm: "" });
      setDone(
        out.otherSessionsRevoked > 0
          ? t("profile.passwordChangedOthers", { count: out.otherSessionsRevoked })
          : t("profile.passwordChanged")
      );
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
      <div>
        <div className="text-sm font-medium text-foreground">
          {t("profile.changePassword")}
        </div>
        <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {t("profile.changePasswordHelp")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="pw-current">{t("profile.currentPassword")}</Label>
          <Input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            value={form.current}
            onChange={set("current")}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pw-new">{t("profile.newPassword")}</Label>
          <Input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            value={form.next}
            onChange={set("next")}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pw-confirm">{t("profile.confirmPassword")}</Label>
          <Input
            id="pw-confirm"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={set("confirm")}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={
            changePassword.isPending || !form.current || !form.next || !form.confirm
          }
        >
          {changePassword.isPending ? t("common.loading") : t("profile.changePassword")}
        </Button>
        {error ? <p className="text-xs text-[var(--s-warn-t)]">{error}</p> : null}
        {done ? <p className="text-xs text-[var(--s-ok-t)]">{done}</p> : null}
      </div>
    </form>
  );
}

function SignOutEverywhere() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logoutAll = useLogoutAll();
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!window.confirm(t("profile.signOutEverywhereConfirm"))) return;
    setError(null);
    try {
      await logoutAll.mutateAsync();
      navigate(ROUTES.LOGIN, { replace: true });
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={logoutAll.isPending}
        onClick={() => void run()}
      >
        {logoutAll.isPending ? t("common.loading") : t("profile.signOutEverywhere")}
      </Button>
      {error ? <p className="text-xs text-[var(--s-warn-t)]">{error}</p> : null}
    </div>
  );
}

/**
 * Profile picture (#135): picked, uploaded and saved in one step, then shown
 * from the server. Remove goes back to initials.
 */
function AvatarUpload({ initials }: { initials: string }) {
  const { t } = useTranslation();
  const trpc = useTRPCClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarUrl = user?.avatarUrl ?? null;

  async function save(imageUrl: string | null) {
    const updated = await trpc.auth.setAvatar.mutate({ imageUrl });
    setUser(toClientUser(updated));
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    const result = validateUploadFile(file);
    if (!result.ok) {
      setError(
        result.code === "FILE_TOO_LARGE"
          ? t("profile.avatarTooLarge")
          : t("profile.avatarInvalidType")
      );
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const ticket = await trpc.auth.requestAvatarUpload.mutate({
        contentType: file.type as never,
        sizeBytes: file.size,
      });
      await apiClient.uploadFile(ticket.uploadUrl, file);
      await save(ticket.imageUrl);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setError(null);
    setBusy(true);
    try {
      await save(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-secondary text-2xl font-semibold text-foreground">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label={t("profile.avatarChange")}
          className="hover:bg-primary/90 absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm transition-colors disabled:opacity-60"
        >
          <Camera size={15} />
        </button>
        <input
          ref={inputRef}
          type="file"
          aria-label={t("profile.avatarChange")}
          accept={uploadAcceptAttr()}
          onChange={onPick}
          className="sr-only"
        />
      </div>

      {avatarUrl && (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          // min-h-9 and horizontal padding give this a finger-sized hit area.
          className="-mx-2 inline-flex min-h-9 items-center gap-1 rounded px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <X size={13} />
          {t("profile.avatarRemove")}
        </button>
      )}

      {error ? (
        <p className="max-w-[12rem] text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {busy ? t("common.loading") : t("profile.avatarHint")}
        </p>
      )}
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-medium text-foreground">{value}</div>
      </div>
    </div>
  );
}
