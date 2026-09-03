import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, IdCard, Building2, KeyRound, Award, Camera, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CREDIT_BANDS } from "@/constants";
import { useAuthStore } from "@/features/auth/auth.store";
import { useMyCredit } from "./use-my-credit";
import { validateUploadFile, uploadAcceptAttr } from "@/lib/upload-validation";
import type { Role } from "@/types/domain";

/** Role → badge tone. */
const ROLE_TONE: Record<Role, "info" | "ok" | "warn" | "neutral"> = {
  borrower: "info",
  staff: "ok",
  supervisor: "warn",
  admin: "neutral",
};

/** Friendly department labels (mock - backend will provide the real name). */
const DEPT_LABEL: Record<string, string> = {
  cpe: "วิศวกรรมคอมพิวเตอร์ (CPE)",
  it: "IT Services",
};

/**
 * Account profile - reached from the sidebar's lower-left user button.
 *
 * Reads the current user from the auth store (mock until the backend lands).
 * Editing is intentionally disabled; the tRPC `auth.me` / profile procedures
 * will back this page once connected.
 */
export default function ProfilePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  // Score and band come from `auth.me` via the store; this adds the borrow
  // window and the penalties actually in force behind them.
  const { data: credit } = useMyCredit();

  if (!user) return null;

  const role = user.role;
  const isKuEmail = /@ku\.(ac\.)?th$/i.test(user.email);
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
            <DetailRow icon={<IdCard size={15} />} label={t("profile.userId")} value={user.id} />
            <DetailRow
              icon={<IdCard size={15} />}
              label={t("profile.studentId")}
              value={user.studentId}
            />
            <DetailRow icon={<Mail size={15} />} label={t("common.email")} value={user.email} />
            <DetailRow
              icon={<Building2 size={15} />}
              label={t("profile.department")}
              value={DEPT_LABEL[user.departmentId] ?? user.departmentId}
            />
            <DetailRow
              icon={<KeyRound size={15} />}
              label={t("profile.authMethod")}
              value={isKuEmail ? t("profile.authKu") : t("profile.authLocal")}
            />
          </CardContent>
        </Card>

        {/* Credit (borrowers) */}
        {role === "borrower" && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>{t("profile.credit")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-8 py-5">
              <div className="flex items-center gap-3">
                <Award size={22} className="text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">{t("profile.creditScore")}</div>
                  <div className="text-2xl font-semibold tabular-nums text-foreground">
                    {user.creditScore}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t("profile.creditBand")}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {band.band}
                  </span>
                  <span className="text-sm text-muted-foreground">{band.label}</span>
                </div>
              </div>
              {/* The real window, from BorrowConstraints - not the static
                  CREDIT_BANDS row, which is only a fallback. */}
              {credit ? (
                <div>
                  <div className="text-xs text-muted-foreground">{t("profile.borrowWindow")}</div>
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
                    <li key={p.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-foreground">
                        {p.reason ?? t("profile.penaltyNoReason")}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                        -{p.creditDeducted} · {t("profile.penaltyUntil", {
                          date: new Date(p.expiresAt).toLocaleDateString(),
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            ) : null}
          </Card>
        )}
      </div>

    </div>
  );
}

/**
 * Avatar with a photo-upload control. Validates size/type client-side via
 * {@link validateUploadFile} and shows a local preview. Persisting the image
 * needs the backend profile procedures (see chat note) - for now this is a
 * preview-only affordance so the flow is testable end-to-end on the client.
 */
function AvatarUpload({ initials }: { initials: string }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Revoke the object URL when it changes or the component unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    const result = validateUploadFile(file);
    if (!result.ok) {
      setError(
        result.code === "FILE_TOO_LARGE"
          ? t("profile.avatarTooLarge")
          : t("profile.avatarInvalidType"),
      );
      return;
    }
    setError(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  function onRemove() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError(null);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-secondary text-2xl font-semibold text-foreground">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label={t("profile.avatarChange")}
          className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Camera size={15} />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={uploadAcceptAttr()}
          onChange={onPick}
          className="sr-only"
        />
      </div>

      {previewUrl && (
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <X size={12} />
          {t("profile.avatarRemove")}
        </button>
      )}

      {error ? (
        <p className="max-w-[12rem] text-xs text-destructive">{error}</p>
      ) : previewUrl ? (
        <p className="max-w-[12rem] text-xs text-muted-foreground">
          {t("profile.avatarPreviewNotice")}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("profile.avatarHint")}</p>
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
