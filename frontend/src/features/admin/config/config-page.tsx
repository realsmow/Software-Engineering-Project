import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { useTechnicalConfig } from "./use-config";

/**
 * What this server instance is deployed with.
 *
 * Read-only, and that is the design rather than a shortfall. Every value comes
 * from an environment variable or a compiled-in constant, fixed for the life
 * of the process: an SMTP host or a storage root edited in a web form would
 * not take effect until a redeploy, and a form that accepts a change which
 * silently does nothing is worse than no form.
 *
 * What was here before was a settings screen with toggles and inputs over
 * invented values, backed by a procedure that answered NOT_IMPLEMENTED. It
 * offered edits that could never be saved.
 *
 * The question an administrator actually arrives with is "is this deployment
 * configured the way we think it is" - a cookie missing `secure`, a forgotten
 * localhost origin in CORS - so that is what the page answers.
 */
export default function AdminConfigPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useTechnicalConfig();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("nav.technicalConfig")} subtitle={t("admin.config.subtitle")} />

      {isLoading ? (
        <p className="py-16 text-center text-sm text-t3">{t("common.loading")}</p>
      ) : isError || !data ? (
        <p className="rounded border border-[var(--s-warn-b)] bg-[var(--s-warn-bg)] px-3.5 py-3 text-[13px] text-[var(--s-warn-t)]">
          {t("admin.config.unavailable")}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="rounded border border-border bg-secondary px-3.5 py-2.5 text-[13px] leading-relaxed text-t2">
            {t("admin.config.readOnlyNotice")}
          </p>

          <Group title={t("admin.config.security")}>
            <Line
              label={t("admin.config.environment")}
              value={data.security.nodeEnv}
              tone={data.security.nodeEnv === "production" ? "ok" : "neutral"}
            />
            {/* Called out because a cookie without `secure` outside development
                is the difference between a session that can be stolen off the
                wire and one that cannot. */}
            <Line
              label={t("admin.config.cookieSecure")}
              value={data.security.cookieSecure ? t("common.yes") : t("common.no")}
              tone={
                data.security.cookieSecure
                  ? "ok"
                  : data.security.nodeEnv === "production"
                    ? "alert"
                    : "neutral"
              }
            />
            <Line label={t("admin.config.cookieSameSite")} value={data.security.cookieSameSite} />
            <Line
              label={t("admin.config.allowedOrigins")}
              value={data.security.allowedOrigins.join("  ")}
            />
          </Group>

          <Group title={t("admin.config.authentication")}>
            <Line
              label={t("admin.config.sessionTimeout")}
              value={t("admin.config.minutes", { count: data.auth.sessionTimeoutMinutes })}
            />
            <Line
              label={t("admin.config.localLogin")}
              value={data.auth.localFallbackEnabled ? t("common.yes") : t("common.no")}
            />
            <Line
              label={t("admin.config.googleOauth")}
              value={data.auth.googleOauthEnabled ? t("common.yes") : t("common.no")}
            />
            <Line
              label={t("admin.config.emailDomains")}
              value={
                data.auth.allowedEmailDomains.length === 0
                  ? t("admin.config.noDomainRestriction")
                  : data.auth.allowedEmailDomains.join("  ")
              }
            />
          </Group>

          <Group title={t("admin.config.storage")}>
            <Line label={t("admin.config.provider")} value={data.storage.provider} />
            <Line label={t("admin.config.location")} value={data.storage.bucket} />
            <Line
              label={t("admin.config.maxUpload")}
              value={t("admin.config.megabytes", { count: data.storage.maxUploadMb })}
            />
          </Group>

          <Group title={t("admin.config.email")}>
            {/* Empty means nothing sends mail. Said plainly, because a blank
                field reads as "not loaded" rather than "not configured". */}
            <Line
              label={t("admin.config.smtpHost")}
              value={data.email.smtpHost || t("admin.config.notConfigured")}
              tone={data.email.smtpHost ? undefined : "warn"}
            />
            <Line label={t("admin.config.fromAddress")} value={data.email.fromAddress} />
            <Line
              label={t("admin.config.dueReminders")}
              value={data.email.dueReminderEnabled ? t("common.yes") : t("common.no")}
            />
          </Group>

          <Group title={t("admin.config.polling")} note={t("admin.config.pollingNote")}>
            <Line
              label={t("admin.config.pollAvailability")}
              value={t("admin.config.seconds", { count: data.polling.availabilitySeconds })}
            />
            <Line
              label={t("admin.config.pollRequestStatus")}
              value={t("admin.config.seconds", { count: data.polling.requestStatusSeconds })}
            />
            <Line
              label={t("admin.config.pollStaffQueue")}
              value={t("admin.config.seconds", { count: data.polling.staffQueueSeconds })}
            />
            <Line
              label={t("admin.config.pollSupervisorQueue")}
              value={t("admin.config.seconds", { count: data.polling.supervisorQueueSeconds })}
            />
            <Line
              label={t("admin.config.pollNotifications")}
              value={t("admin.config.seconds", { count: data.polling.notificationsSeconds })}
            />
          </Group>
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3.5 py-2.5">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {note ? <p className="mt-0.5 text-xs text-t3">{note}</p> : null}
      </div>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function Line({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "alert" | "neutral";
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3.5 py-2.5">
      <span className="text-[13px] text-t2">{label}</span>
      {tone ? (
        <Badge tone={tone}>{value}</Badge>
      ) : (
        <span className="break-all text-right font-mono text-[13px] text-foreground">{value}</span>
      )}
    </div>
  );
}
