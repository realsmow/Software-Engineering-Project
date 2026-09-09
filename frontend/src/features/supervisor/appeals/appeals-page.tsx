import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDateTime } from "@/features/borrower/format";
import { refundFor, useAppeals, useDecideAppeal } from "./use-appeals";
import { DAMAGE_ORDER, type AppealRow } from "./appeal.types";
import type { DamageLevel } from "@/types/domain";

/**
 * The appeal desk (SRS: a borrower may appeal a damage grade within 7 days;
 * the decider sees the staff report, the borrower's evidence and the
 * before/after photos on one screen, and may lower the grade to give part of
 * the credit back).
 *
 * RUNS ON MOCK DATA. `appeal.*` is not on the backend yet, so the banner below
 * says so on screen rather than letting a demo mistake this for live. Only
 * use-appeals.ts knows; the layout is already written against the real shapes.
 *
 * One appeal per card rather than a table: the decision needs the two accounts
 * of what happened side by side, and a row of a table cannot hold that.
 */
export default function SupervisorAppealsPage() {
  const { t } = useTranslation();
  const { data: appeals, isLoading } = useAppeals();

  return (
    <div>
      <PageHeader title={t("nav.appealsReview")} subtitle={t("supervisor.appeals.subtitle")} />

      <p className="mb-4 rounded border border-[var(--s-warn-b)] bg-[var(--s-warn-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--s-warn-t)]">
        {t("supervisor.appeals.mockNotice")}
      </p>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-t3">{t("common.loading")}</div>
      ) : !appeals || appeals.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-10 text-center">
          <div className="text-sm font-semibold text-foreground">
            {t("supervisor.appeals.emptyTitle")}
          </div>
          <p className="mt-1 text-xs text-t3">{t("supervisor.appeals.emptyDesc")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {appeals.map((a) => (
            <AppealCard key={a.appealKey} appeal={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AppealCard({ appeal }: { appeal: AppealRow }) {
  const { t } = useTranslation();
  const decide = useDecideAppeal();
  const [newLevel, setNewLevel] = useState<DamageLevel | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Only a lower grade is a reduction; the rest would raise the penalty, which
  // an appeal is not for.
  const lower = DAMAGE_ORDER.filter(
    (l) => DAMAGE_ORDER.indexOf(l) < DAMAGE_ORDER.indexOf(appeal.gradedLevel),
  );
  const refund = newLevel ? refundFor(appeal, newLevel) : 0;

  async function submit(decision: "uphold" | "reduce") {
    setError(null);
    if (!reason.trim()) {
      setError(t("supervisor.appeals.reasonRequired"));
      return;
    }
    if (decision === "reduce" && !newLevel) {
      setError(t("supervisor.appeals.levelRequired"));
      return;
    }
    try {
      await decide.mutateAsync({
        appealKey: appeal.appealKey,
        decision,
        newLevel: decision === "reduce" ? (newLevel ?? undefined) : undefined,
        reason: reason.trim(),
      });
      setDone(
        decision === "reduce"
          ? t("supervisor.appeals.doneReduce", { level: newLevel, credit: refund })
          : t("supervisor.appeals.doneUphold"),
      );
    } catch {
      setError(t("supervisor.appeals.failed"));
    }
  }

  if (done) {
    return (
      <section className="rounded-lg border border-[var(--s-ok-b)] bg-[var(--s-ok-bg)] px-3.5 py-3 text-[13px] text-[var(--s-ok-t)]">
        {done}
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <div className="text-sm font-semibold text-foreground">
          {appeal.itemName}
          {appeal.serialNo ? (
            <span className="ml-2 font-mono text-[11px] font-normal text-t4">
              {appeal.serialNo}
            </span>
          ) : null}
        </div>
        <div className="font-mono text-[11px] text-t4">
          {appeal.borrower.firstName} {appeal.borrower.lastName} · {appeal.borrower.studentId} ·{" "}
          {t("staff.queue.credit", { score: appeal.borrower.creditScore })}
        </div>
      </div>

      {/* The two accounts of what happened, side by side. */}
      <div className="grid gap-0 border-b border-border md:grid-cols-2">
        <div className="border-b border-border p-3.5 md:border-b-0 md:border-r">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
            {t("supervisor.appeals.staffSide")}
            <Badge tone="warn">{appeal.gradedLevel}</Badge>
            <span className="font-mono font-normal normal-case tracking-normal">
              -{appeal.creditDeducted}
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-t2">
            {appeal.staffNote ?? t("supervisor.appeals.noStaffNote")}
          </p>
          <p className="mt-2 font-mono text-[11px] text-t4">
            {appeal.gradedBy} · {fmtDateTime(appeal.gradedAt)}
          </p>
        </div>

        <div className="p-3.5">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
            {t("supervisor.appeals.borrowerSide")}
          </div>
          <p className="text-[13px] leading-relaxed text-t2">
            {appeal.appealReason ?? t("supervisor.appeals.noReason")}
          </p>
          <p className="mt-2 font-mono text-[11px] text-t4">{fmtDateTime(appeal.filedAt)}</p>
        </div>
      </div>

      {/* Photos, and an explicit line when there are none: "no evidence" is
          itself something the decision has to account for. */}
      <div className="border-b border-border px-3.5 py-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
          {t("supervisor.appeals.photos")}
        </div>
        {appeal.photos.length === 0 ? (
          <p className="text-xs text-t3">{t("supervisor.appeals.noPhotos")}</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {appeal.photos.map((p) => (
              <figure key={p.url} className="w-40">
                <img
                  src={p.url}
                  alt=""
                  className="h-28 w-40 rounded border border-border bg-surface-inset object-cover"
                />
                <figcaption className="mt-1 text-[11px] text-t3">
                  {t(`supervisor.appeals.photo${p.when === "before" ? "Before" : "After"}`)}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>

      {/* The decision. */}
      <div className="px-3.5 py-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
          {t("supervisor.appeals.decision")}
        </div>

        {lower.length > 0 ? (
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-t3">{t("supervisor.appeals.reduceTo")}</span>
            {lower.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setNewLevel(newLevel === l ? null : l)}
                className={[
                  "rounded border px-2.5 py-1 font-mono text-xs transition-colors",
                  newLevel === l
                    ? "border-accent bg-[var(--accent-soft)] text-accent"
                    : "border-border text-t2 hover:bg-muted",
                ].join(" ")}
              >
                {l}
              </button>
            ))}
            {newLevel ? (
              <span className="text-xs text-t2">
                {t("supervisor.appeals.refund", { credit: refund })}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="mb-2.5 text-xs text-t3">{t("supervisor.appeals.alreadyLowest")}</p>
        )}

        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("supervisor.appeals.reasonPlaceholder")}
          className="mb-2.5 max-w-xl"
        />

        {error ? (
          <p className="mb-2.5 text-xs text-[var(--s-warn-t)]">{error}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={decide.isPending || !newLevel}
            onClick={() => void submit("reduce")}
          >
            {t("supervisor.appeals.reduce")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={decide.isPending}
            onClick={() => void submit("uphold")}
          >
            {t("supervisor.appeals.uphold")}
          </Button>
        </div>
      </div>
    </section>
  );
}
