import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, KeyRound, HardDrive, Mail, Timer } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

type Tab = "auth" | "storage" | "email" | "polling";

const TABS: { key: Tab; labelKey: string; icon: typeof KeyRound }[] = [
  { key: "auth", labelKey: "admin.config.tabAuth", icon: KeyRound },
  { key: "storage", labelKey: "admin.config.tabStorage", icon: HardDrive },
  { key: "email", labelKey: "admin.config.tabEmail", icon: Mail },
  { key: "polling", labelKey: "admin.config.tabPolling", icon: Timer },
];

export default function AdminConfigPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("auth");
  const [saved, setSaved] = useState(false);

  // auth
  const [googleOauth, setGoogleOauth] = useState(true);
  const [localFallback, setLocalFallback] = useState(true);
  const [allowedDomains, setAllowedDomains] = useState("ku.ac.th, ku.th");
  const [sessionTimeout, setSessionTimeout] = useState("120");
  // storage
  const [provider, setProvider] = useState("s3");
  const [bucket, setBucket] = useState("ulms-uploads");
  const [maxUpload, setMaxUpload] = useState("20");
  const [presigned, setPresigned] = useState(true);
  // email
  const [smtpHost, setSmtpHost] = useState("smtp.ku.th");
  const [fromAddress, setFromAddress] = useState("no-reply@ku.th");
  const [dueReminder, setDueReminder] = useState(true);
  // polling
  const [pAvailability, setPAvailability] = useState("30");
  const [pFacility, setPFacility] = useState("60");
  const [pRequest, setPRequest] = useState("20");
  const [pNotifications, setPNotifications] = useState("45");
  const [pStaffQueue, setPStaffQueue] = useState("15");
  const [pSupervisorQueue, setPSupervisorQueue] = useState("30");

  function save() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  return (
    <div>
      <PageHeader
        title={t("admin.config.title")}
        actions={
          <Button type="button" onClick={save}>
            <Check size={15} strokeWidth={2} />
            {t("common.saveChanges")}
          </Button>
        }
      />

      {saved ? (
        <Alert variant="success" className="mb-4">
          <Check size={16} strokeWidth={2.5} />
          <AlertDescription>{t("admin.config.savedToast")}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="mb-4">
          {TABS.map(({ key, labelKey, icon: Icon }) => (
            <TabsTrigger key={key} value={key}>
              <Icon size={15} strokeWidth={2} />
              {t(labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="auth" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.config.authTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col divide-y divide-border">
                <ToggleRow
                  label={t("admin.config.googleOauth")}
                  desc={t("admin.config.googleOauthDesc")}
                  checked={googleOauth}
                  onChange={setGoogleOauth}
                />
                <ToggleRow
                  label={t("admin.config.localFallback")}
                  desc={t("admin.config.localFallbackDesc")}
                  checked={localFallback}
                  onChange={setLocalFallback}
                />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t("admin.config.allowedDomains")}>
                  <Input value={allowedDomains} onChange={(e) => setAllowedDomains(e.target.value)} />
                </Field>
                <Field label={t("admin.config.sessionTimeout")}>
                  <Input type="number" value={sessionTimeout} onChange={(e) => setSessionTimeout(e.target.value)} />
                </Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.config.storageTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t("admin.config.provider")}>
                  <Select value={provider} onValueChange={setProvider}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="s3">Amazon S3</SelectItem>
                      <SelectItem value="minio">MinIO</SelectItem>
                      <SelectItem value="gcs">Google Cloud Storage</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("admin.config.bucket")}>
                  <Input value={bucket} onChange={(e) => setBucket(e.target.value)} />
                </Field>
              </div>
              <div className="mt-4 max-w-60">
                <Field label={t("admin.config.maxUpload")}>
                  <Input type="number" value={maxUpload} onChange={(e) => setMaxUpload(e.target.value)} />
                </Field>
              </div>
              <div className="mt-4 flex flex-col divide-y divide-border">
                <ToggleRow
                  label={t("admin.config.presignedUrl")}
                  desc={t("admin.config.presignedUrlDesc")}
                  checked={presigned}
                  onChange={setPresigned}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.config.emailTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t("admin.config.smtpHost")}>
                  <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
                </Field>
                <Field label={t("admin.config.fromAddress")}>
                  <Input value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} />
                </Field>
              </div>
              <div className="mt-4 flex flex-col divide-y divide-border">
                <ToggleRow
                  label={t("admin.config.dueReminder")}
                  desc={t("admin.config.dueReminderDesc")}
                  checked={dueReminder}
                  onChange={setDueReminder}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="polling" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.config.pollingTitle")}</CardTitle>
              <CardDescription>{t("admin.config.pollingDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t("admin.config.pAvailability")}>
                  <Input type="number" value={pAvailability} onChange={(e) => setPAvailability(e.target.value)} />
                </Field>
                <Field label={t("admin.config.pFacility")}>
                  <Input type="number" value={pFacility} onChange={(e) => setPFacility(e.target.value)} />
                </Field>
                <Field label={t("admin.config.pRequest")}>
                  <Input type="number" value={pRequest} onChange={(e) => setPRequest(e.target.value)} />
                </Field>
                <Field label={t("admin.config.pNotifications")}>
                  <Input type="number" value={pNotifications} onChange={(e) => setPNotifications(e.target.value)} />
                </Field>
                <Field label={t("admin.config.pStaffQueue")}>
                  <Input type="number" value={pStaffQueue} onChange={(e) => setPStaffQueue(e.target.value)} />
                </Field>
                <Field label={t("admin.config.pSupervisorQueue")}>
                  <Input type="number" value={pSupervisorQueue} onChange={(e) => setPSupervisorQueue(e.target.value)} />
                </Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  );
}
