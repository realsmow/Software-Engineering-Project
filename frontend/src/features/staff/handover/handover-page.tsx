import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { TierDot } from "@/components/shared/tier-badge";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/constants";
import { getErrorMessage } from "@/lib/error-messages";
import { useLoanForStaff, useSwapUnit } from "./use-handover";

/**
 * One loan, in full - reached by clicking a row in the staff queue.
 *
 * The queue's row actions (prepare / hand over / return) stay exactly where
 * they are; this page exists for the one thing the queue table has no room
 * for: swapping the unit set aside for a `Prepared` T1 loan before it goes
 * out the door (proposal §5.4, "ผู้ยืมสามารถขอเปลี่ยนอุปกรณ์ได้ตอนรับ").
 */
export default function StaffHandoverPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ usageKey: string }>();
  const usageKey = params.usageKey ? Number(params.usageKey) : NaN;
  const validKey = Number.isFinite(usageKey) ? usageKey : null;

  const { data: loan, isLoading } = useLoanForStaff(validKey);
  const swapUnit = useSwapUnit();

  const [resourceKey, setResourceKey] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function submitSwap() {
    if (validKey === null) return;
    const target = Number(resourceKey);
    if (!Number.isFinite(target) || target <= 0) return;

    setResult(null);
    try {
      await swapUnit.mutateAsync({
        usageKey: validKey,
        resourceKey: target,
        reason: reason.trim() || undefined,
      });
      setResult({ tone: "ok", text: t("staff.handover.doneSwap") });
      setResourceKey("");
      setReason("");
    } catch (e) {
      setResult({ tone: "bad", text: getErrorMessage(e) });
    }
  }

  return (
    <div>
      <PageHeader
        title={t("nav.handover")}
        subtitle={t("staff.handover.subtitle")}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => navigate(ROUTES.STAFF_DASHBOARD)}>
            <ArrowLeft size={14} strokeWidth={2} className="mr-1.5" />
            {t("staff.handover.backToQueue")}
          </Button>
        }
      />

      {validKey === null ? (
        <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-t3">
          {t("staff.handover.notFound")}
        </div>
      ) : isLoading ? (
        <div className="py-16 text-center text-sm text-t3">{t("common.loading")}</div>
      ) : !loan ? (
        <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-t3">
          {t("staff.handover.notFound")}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <section className="rounded-lg border border-border bg-card px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">
                  {loan.borrower.firstName} {loan.borrower.lastName}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-t4">
                  {loan.borrower.studentId} ·{" "}
                  {t("staff.queue.credit", { score: loan.borrower.creditScore })}
                </div>
              </div>
              <Badge tone={statusTone(loan.status)}>{t(`staff.queue.state${loan.status}`)}</Badge>
            </div>

            <div className="mt-4 border-t border-border pt-3.5">
              <div className="text-sm text-foreground">{loan.itemName ?? "-"}</div>
              <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-t4">
                {loan.tier ? <TierDot tier={loan.tier} /> : null}
                {loan.tier ?? t("borrower.catalog.tierUnknown")}
                {loan.serialNo ? ` · ${loan.serialNo}` : ""}
              </div>
            </div>
          </section>

          {result ? (
            <div
              role="status"
              className={
                result.tone === "ok"
                  ? "rounded border border-[var(--s-ok-b)] bg-[var(--s-ok-bg)] px-3 py-2 text-[13px] leading-relaxed text-[var(--s-ok-t)]"
                  : "rounded border border-[var(--s-warn-b)] bg-[var(--s-warn-bg)] px-3 py-2 text-[13px] leading-relaxed text-[var(--s-warn-t)]"
              }
            >
              {result.text}
            </div>
          ) : null}

          {loan.status === "Prepared" ? (
            loan.tier === "T1" ? (
              <section className="rounded-lg border border-border bg-card px-4 py-4">
                <div className="text-sm font-medium text-foreground">{t("staff.handover.swapTitle")}</div>
                <p className="mt-1 text-xs text-t3">{t("staff.handover.swapHint")}</p>

                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div>
                    <label className="text-xs text-t3" htmlFor="swap-resource-key">
                      {t("staff.handover.newResourceKey")}
                    </label>
                    <Input
                      id="swap-resource-key"
                      type="number"
                      min={1}
                      value={resourceKey}
                      onChange={(e) => setResourceKey(e.target.value)}
                      className="mt-1 h-9 w-40"
                    />
                  </div>
                  <div className="min-w-[14rem] flex-1">
                    <label className="text-xs text-t3" htmlFor="swap-reason">
                      {t("staff.handover.swapReasonPlaceholder")}
                    </label>
                    <Input
                      id="swap-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t("staff.handover.swapReasonPlaceholder")}
                      className="mt-1 h-9"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!resourceKey.trim() || swapUnit.isPending}
                    onClick={() => void submitSwap()}
                  >
                    {swapUnit.isPending ? t("common.loading") : t("staff.handover.confirmSwap")}
                  </Button>
                </div>
              </section>
            ) : (
              <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-t3">
                {t("staff.handover.swapNotAllowed")}
              </div>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}

function statusTone(status: string): BadgeTone {
  if (status === "Lended") return "info";
  if (status === "Prepared") return "ok";
  if (status === "Returned" || status === "Inspected") return "neutral";
  return "neutral";
}
