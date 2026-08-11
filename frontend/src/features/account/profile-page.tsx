import { useTranslation } from "react-i18next";
import { Mail, IdCard, Building2, KeyRound, Award } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CREDIT_BANDS } from "@/constants";
import { useAuthStore } from "@/features/auth/auth.store";
import type { Role } from "@/types/domain";

/** Role → badge tone. */
const ROLE_TONE: Record<Role, "info" | "ok" | "warn" | "neutral"> = {
  borrower: "info",
  staff: "ok",
  supervisor: "warn",
  admin: "neutral",
};

/** Friendly department labels (mock — backend will provide the real name). */
const DEPT_LABEL: Record<string, string> = {
  cpe: "วิศวกรรมคอมพิวเตอร์ (CPE)",
  it: "IT Services",
};

/**
 * Account profile — reached from the sidebar's lower-left user button.
 *
 * Reads the current user from the auth store (mock until the backend lands).
 * Editing is intentionally disabled; the tRPC `auth.me` / profile procedures
 * will back this page once connected.
 */
export default function ProfilePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  if (!user) return null;

  const role = user.role;
  const isKuEmail = /@ku\.(ac\.)?th$/i.test(user.email);
  const band =
    CREDIT_BANDS.find((b) => b.band === user.creditBand) ?? CREDIT_BANDS[0];
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
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary text-2xl font-semibold text-foreground">
              {initials}
            </div>
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
            </CardContent>
          </Card>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">{t("profile.mockNotice")}</p>
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
