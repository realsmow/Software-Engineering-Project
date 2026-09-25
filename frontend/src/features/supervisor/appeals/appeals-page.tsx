import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useAuthStore } from "@/features/auth/auth.store";
import { fmtDateTime } from "@/features/borrower/format";
import {
  useUsagePhotos,
  type UsagePhotoSet,
} from "@/features/borrower/pickup/use-pickup-image-upload";
import { extractErrorCode } from "@/lib/error-messages";
import { useAppeals, useDecideAppeal } from "./use-appeals";
import type { AppealOutput, AppealStatus } from "./appeal.types";
import { penaltyReasonText } from "@/features/borrower/appeals/penalty-reason";

/**
 * The appeal desk (§5.8 "ขออุทธรณ์"): a borrower disputes a credit penalty and
 * a supervisor rules on it.
 *
 * The decision is about credit, not about a damage grade. An earlier version
 * of this screen offered a B0..B3 picker and showed a refund worked out from
 * the gap between two grades; the server has never had such a procedure. What
 * it offers instead is `reducedCreditDeducted` - how much of the deduction is
 * left standing - and it computes the refund itself.
 *
 * Two of the server's refusals are answered before the click rather than after
 * it. A supervisor may not rule on an inspection they made themselves
 * (CANNOT_DECIDE_OWN_INSPECTION) or on an appeal they filed
 * (CANNOT_DECIDE_OWN_APPEAL), so those cards say why instead of offering
 * buttons that are going to bounce.
 *
 * One card per appeal rather than a table: the decision needs the penalty, the
 * borrower's account of it and the photos side by side, and a table row cannot
 * hold that.
 */
export default function SupervisorAppealsPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AppealStatus>("pending");
  const [result, setResult] = useState<string | null>(null);
  const { data: appeals, isLoading } = useAppeals(status);

  const filters: { value: AppealStatus; label: string }[] = [
    { value: "pending", label: t("supervisor.appeals.filterPending") },
    { value: "approved", label: t("supervisor.appeals.filterApproved") },
    { value: "rejected", label: t("supervisor.appeals.filterRejected") },
  ];

  return (
    <div>
      <PageHeader title={t("nav.appealsReview")} subtitle={t("supervisor.appeals.subtitle")} />

      <div className="mb-4">
        <Segmented
          options={filters}
          value={status}
          onChange={(next) => {
            setStatus(next);
            setResult(null);
          }}
        />
      </div>

      {/* The outcome is reported here rather than on the card, because an
          approved appeal leaves the pending list the moment it is decided. */}
      {result ? (
        <p className="mb-4 rounded border border-[var(--s-ok-b)] bg-[var(--s-ok-bg)] px-3 py-2 text-[13px] text-[var(--s-ok-t)]">
          {result}
        </p>
      ) : null}

      {isLoading ? (
        <div className="py-16 text-center text-sm text-t3">{t("common.loading")}</div>
      ) : !appeals || appeals.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-10 text-center">
          <div className="text-sm font-semibold text-foreground">
            {t("supervisor.appeals.emptyTitle")}
          </div>
          {status === "pending" ? (
            <p className="mt-1 text-xs text-t3">{t("supervisor.appeals.emptyDesc")}</p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {appeals.map((a) => (
            <AppealCard key={a.appealKey} appeal={a} onDecided={setResult} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Business codes this desk can explain better than the shared Thai-only map. */
const DECIDE_ERRORS: Record<string, string> = {
  APPEAL_ALREADY_RESOLVED: "supervisor.appeals.errAlreadyResolved",
  CANNOT_DECIDE_OWN_APPEAL: "supervisor.appeals.blockedOwnAppeal",
  CANNOT_DECIDE_OWN_INSPECTION: "supervisor.appeals.blockedOwnInspection",
  INVALID_APPEAL_REDUCTION: "supervisor.appeals.errInvalidReduction",
  OUT_OF_MANAGEMENT_SCOPE: "supervisor.appeals.errOutOfScope",
};

function AppealCard({
  appeal,
  onDecided,
}: {
  appeal: AppealOutput;
  onDecided: (message: string) => void;
}) {
  const { t } = useTranslation();
  const decide = useDecideAppeal();
  const [reduced, setReduced] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // AccountKey is an int server-side and a string on the client user; the two
  // sides of the "not your own case" rule are compared as numbers.
  const me = Number(useAuthStore((s) => s.user?.id));
  const blocked =
    appeal.filedBy.accountKey === me
      ? "supervisor.appeals.blockedOwnAppeal"
      : appeal.inspectorKeys.includes(me)
        ? "supervisor.appeals.blockedOwnInspection"
        : null;

  const deducted = appeal.penalty.creditDeducted ?? 0;
  const { photos, parsed, reduceError } = parseReduction(reduced, deducted);

  async function submit(decision: "approve" | "reject") {
    setError(null);
    try {
      const decided = await decide.mutateAsync({
        appealKey: appeal.appealKey,
        decision,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(decision === "approve" && parsed ? { reducedCreditDeducted: parsed } : {}),
      });
      onDecided(
        decision === "approve"
          ? t("supervisor.appeals.doneApprove", { credit: decided.creditRestored })
          : t("supervisor.appeals.doneReject"),
      );
    } catch (err) {
      const key = DECIDE_ERRORS[extractErrorCode(err) ?? ""];
      setError(key ? t(key) : t("supervisor.appeals.failed"));
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <div className="text-sm font-semibold text-foreground">
          {appeal.penalty.reason
            ? penaltyReasonText(appeal.penalty.reason, t)
            : t("supervisor.appeals.noStaffNote")}
        </div>
        <div className="font-mono text-[11px] text-t4">
          {appeal.filedBy.firstName} {appeal.filedBy.lastName} · {appeal.filedBy.studentId} ·{" "}
          {t("staff.queue.credit", { score: appeal.filedBy.creditScore })}
        </div>
      </div>

      {/* The two accounts of what happened, side by side. */}
      <div className="grid gap-0 border-b border-border md:grid-cols-2">
        <div className="border-b border-border p-3.5 md:border-b-0 md:border-r">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
            {t("supervisor.appeals.staffSide")}
            {deducted > 0 ? (
              <Badge tone="warn">{t("supervisor.appeals.deducted", { credit: deducted })}</Badge>
            ) : (
              <Badge tone="neutral">{t("supervisor.appeals.noDeduction")}</Badge>
            )}
          </div>
          <p className="font-mono text-[11px] text-t4">
            {appeal.penalty.issuedAt
              ? t("supervisor.appeals.issuedAt", { when: fmtDateTime(appeal.penalty.issuedAt) })
              : null}
          </p>
          <p className="font-mono text-[11px] text-t4">
            {appeal.penalty.inEffect
              ? t("supervisor.appeals.inForceUntil", {
                  when: fmtDateTime(appeal.penalty.expiresAt),
                })
              : t("supervisor.appeals.notInForce")}
          </p>
        </div>

        <div className="p-3.5">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
            {t("supervisor.appeals.borrowerSide")}
          </div>
          <p className="text-[13px] leading-relaxed text-t2">
            {appeal.appealReason ?? t("supervisor.appeals.noReason")}
          </p>
          {appeal.filedAt ? (
            <p className="mt-2 font-mono text-[11px] text-t4">
              {t("supervisor.appeals.filedAt", { when: fmtDateTime(appeal.filedAt) })}
            </p>
          ) : null}
        </div>
      </div>

      <Evidence usageKey={appeal.penalty.usageKey} />

      {appeal.status === "pending" ? (
        <div className="px-3.5 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
            {t("supervisor.appeals.decision")}
          </div>

          {blocked ? (
            <p className="text-xs leading-relaxed text-[var(--s-warn-t)]">{t(blocked)}</p>
          ) : (
            <>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs text-t3">{t("supervisor.appeals.reduceLabel")}</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={Math.max(deducted - 1, 1)}
                  value={reduced}
                  onChange={(e) => setReduced(e.target.value)}
                  disabled={deducted <= 0}
                  className="h-8 w-24"
                />
                {reduceError ? (
                  <span className="text-xs text-[var(--s-warn-t)]">
                    {t("supervisor.appeals.reduceTooLarge", { credit: deducted })}
                  </span>
                ) : deducted > 0 ? (
                  <span className="text-xs text-t2">
                    {t("supervisor.appeals.restores", { credit: deducted - (parsed ?? 0) })}
                  </span>
                ) : null}
              </div>
              <p className="mb-2.5 text-[11px] text-t4">{t("supervisor.appeals.reduceHint")}</p>

              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("supervisor.appeals.notePlaceholder")}
                maxLength={1000}
                className="mb-2.5 max-w-xl"
              />

              {deducted <= 0 ? (
                <p className="mb-2.5 text-xs text-t3">
                  {t("supervisor.appeals.noDeductionToRefund")}
                </p>
              ) : null}
              {error ? <p className="mb-2.5 text-xs text-[var(--s-warn-t)]">{error}</p> : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={decide.isPending || reduceError || deducted <= 0}
                  onClick={() => void submit("approve")}
                >
                  {t("supervisor.appeals.approve")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={decide.isPending}
                  onClick={() => void submit("reject")}
                >
                  {t("supervisor.appeals.reject")}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <Outcome appeal={appeal} />
      )}

      {/* `photos` is only referenced to keep the evidence query keyed to this
          card; the strip renders inside <Evidence>. */}
      {photos}
    </section>
  );
}

/**
 * What a decided appeal did.
 *
 * `creditRestored` and `replacementPenalty` only ever have anything to say
 * once a decision exists, so this is where they are read. `resolvedBy` is
 * shown because the rule that the reviewer was somebody else is only
 * checkable if the reviewer is named.
 */
function Outcome({ appeal }: { appeal: AppealOutput }) {
  const { t } = useTranslation();

  return (
    <div className="px-3.5 py-3 text-[13px] text-t2">
      {appeal.resolvedBy ? (
        <p className="font-mono text-[11px] text-t4">
          {t("supervisor.appeals.resolvedBy", {
            name: `${appeal.resolvedBy.firstName} ${appeal.resolvedBy.lastName}`,
            when: appeal.resolvedAt ? fmtDateTime(appeal.resolvedAt) : "",
          })}
        </p>
      ) : null}
      {appeal.status === "approved" ? (
        <p className="mt-1">
          {t("supervisor.appeals.creditReturned", { credit: appeal.creditRestored })}
        </p>
      ) : null}
      {appeal.replacementPenalty ? (
        <p className="mt-1">
          {t("supervisor.appeals.replacedBy", {
            credit: appeal.replacementPenalty.creditDeducted ?? 0,
          })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The photos behind the penalty.
 *
 * `usageKey` is the only handle an appeal carries on its evidence, and it is
 * null for a penalty issued against the account rather than against a loan -
 * an administrative borrowing ban has nothing to photograph, which is a
 * different thing from a borrower who filed no photos. Both are said out loud,
 * because "no evidence" is itself something the decision has to account for.
 */
function Evidence({ usageKey }: { usageKey: number | null }) {
  const { t } = useTranslation();
  const { data } = useUsagePhotos(usageKey);

  const groups: { stage: keyof UsagePhotoSet; label: string }[] = [
    { stage: "before", label: t("supervisor.appeals.photoBefore") },
    { stage: "after", label: t("supervisor.appeals.photoAfter") },
    { stage: "inspection", label: t("supervisor.appeals.photoInspection") },
    // FR-APL-03: the borrower's own attachment (`evidence` stage), labelled
    // separately from the official before/after/inspection record so it
    // reads as the borrower's account, not staff's. Including it here is
    // also what keeps "no photos filed" from showing once evidence exists -
    // `shown` below checks every group, this one included.
    { stage: "evidence", label: t("supervisor.appeals.photoEvidence") },
  ];
  const shown = data ? groups.filter((g) => data[g.stage].length > 0) : [];

  return (
    <div className="border-b border-border px-3.5 py-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
        {t("supervisor.appeals.photos")}
      </div>
      {usageKey === null ? (
        <p className="text-xs text-t3">{t("supervisor.appeals.noUsage")}</p>
      ) : data && shown.length === 0 ? (
        <p className="text-xs text-t3">{t("supervisor.appeals.noPhotos")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((group) => (
            <div key={group.stage}>
              <div className="mb-1 text-[11px] text-t3">{group.label}</div>
              <div className="flex flex-wrap gap-3">
                {data![group.stage].map((photo) => (
                  <img
                    key={photo.imageKey}
                    src={photo.imageUrl}
                    alt=""
                    className="h-28 w-40 rounded border border-border bg-surface-inset object-cover"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Reads the "leave a smaller penalty of" box.
 *
 * Empty means cancel the penalty outright, which the server expresses by the
 * field simply being absent. Anything else has to be a whole number strictly
 * below the original deduction, which is the same test the server applies
 * before it will write the replacement (INVALID_APPEAL_REDUCTION).
 */
function parseReduction(raw: string, deducted: number) {
  const text = raw.trim();
  if (!text) return { parsed: undefined, reduceError: false, photos: null };

  const value = Number(text);
  const valid = Number.isInteger(value) && value > 0 && value < deducted;
  return { parsed: valid ? value : undefined, reduceError: !valid, photos: null };
}
