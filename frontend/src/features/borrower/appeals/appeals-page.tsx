import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ImageThumb } from "@/components/shared/image-thumb";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-messages";
import { fmtDate } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type {
  AppealOutput,
  AppealStatus,
  AppealablePenalty,
} from "@/features/supervisor/appeals/appeal.types";
import type { MyRequest } from "../mock-data";
import { useMyRequests } from "../loans/use-my-requests";
import { useUsagePhotos, type UsagePhotoSet } from "../pickup/use-pickup-image-upload";
import { penaltyReasonText } from "./penalty-reason";
import { useAppealable, useCreateAppeal, useMyAppeals } from "./use-my-appeals";

/** `createAppealInput.appealReason` in backend/src/appeal/appeal.schema.ts. */
const REASON_MAX = 1000;

const STATUS_TONE: Record<AppealStatus, BadgeTone> = {
  pending: "warn",
  approved: "ok",
  rejected: "alert",
};

/**
 * Appeal a credit penalty.
 *
 * Built on `appeal.appealable` (what can still be appealed, and until when)
 * and `appeal.mine` (what has been filed and how it went). The unit is the
 * penalty, not the loan: a late return and a damage grade on the same loan
 * are separate penalties, and the borrower may accept one and dispute the
 * other. A supervisor rules on it; nothing here decides anything.
 *
 * There is no photo upload: `appeal.create` takes the penalty and the
 * argument only. The loan's photos already on file are shown instead, since
 * the supervisor sees the same set.
 */
export default function AppealsPage() {
  const { t } = useTranslation();
  const appealable = useAppealable();
  const mine = useMyAppeals();
  const { requests } = useMyRequests();
  const createAppeal = useCreateAppeal();

  // Deep link from "my requests": the penalty the borrower pressed appeal on.
  const [params, setParams] = useSearchParams();
  const [reason, setReason] = useState("");
  const [justSent, setJustSent] = useState(false);

  const penalties = appealable.data ?? [];
  const appeals = mine.data ?? [];
  const wanted = Number(params.get("penalty"));
  const picked = penalties.find((p) => p.penaltyKey === wanted) ?? null;
  const loanOf = (usageKey: number | null) =>
    usageKey === null ? undefined : requests.find((r) => r.usageKey === usageKey);

  function pick(penaltyKey: number) {
    if (penaltyKey !== picked?.penaltyKey) {
      setReason("");
      createAppeal.reset();
    }
    setJustSent(false);
    setParams({ penalty: String(penaltyKey) }, { replace: true });
  }

  const why = reason.trim();
  const blockKey = picked === null
    ? "borrower.appeals.needPick"
    : why.length === 0
      ? "borrower.appeals.needWhy"
      : null;

  function submit() {
    if (picked === null || blockKey !== null || createAppeal.isPending) return;
    createAppeal.mutate(
      { penaltyKey: picked.penaltyKey, appealReason: why },
      {
        onSuccess: () => {
          setReason("");
          setJustSent(true);
          setParams({}, { replace: true });
        },
      },
    );
  }

  if (appealable.isPending || mine.isPending) {
    return (
      <div>
        <PageHeader title={t("nav.appeals")} subtitle={t("borrower.appeals.subtitle")} />
        <p className="px-3.5 py-8 text-center text-[13px] text-t3">{t("common.loading")}</p>
      </div>
    );
  }

  const loadError = appealable.error ?? mine.error;

  return (
    <div>
      <PageHeader title={t("nav.appeals")} subtitle={t("borrower.appeals.subtitle")} />

      <div className="mb-4 rounded-lg border border-border border-l-[3px] border-l-accent bg-accent-soft px-3.5 py-3">
        <p className="text-xs leading-relaxed text-t2">{t("borrower.appeals.intro")}</p>
      </div>

      {loadError ? (
        <p
          role="alert"
          className="mb-4 rounded border border-[var(--s-alert-b)] bg-[var(--s-alert-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--s-alert-t)]"
        >
          {getErrorMessage(loadError)}
        </p>
      ) : null}

      {justSent ? (
        <p className="mb-4 rounded bg-[var(--s-ok-bg)] px-3 py-2 text-xs font-medium leading-relaxed text-[var(--s-ok-t)]">
          {t("borrower.appeals.sentNote")}
        </p>
      ) : null}

      {penalties.length === 0 && appeals.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_312px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel title={t("borrower.appeals.pickTitle")}>
              {penalties.length === 0 ? (
                <p className="px-3.5 py-6 text-center text-[13px] text-t3">
                  {t("borrower.appeals.noneBody")}
                </p>
              ) : (
                <>
                  <p className="px-3.5 pb-1 pt-2.5 text-xs leading-relaxed text-t3">
                    {t("borrower.appeals.pickHelp")}
                  </p>
                  <div className="flex flex-col gap-2 px-3.5 pb-3.5 pt-1.5">
                    {penalties.map((p) => (
                      <PenaltyCard
                        key={p.penaltyKey}
                        penalty={p}
                        loan={loanOf(p.usageKey)}
                        selected={picked?.penaltyKey === p.penaltyKey}
                        onPick={() => pick(p.penaltyKey)}
                      />
                    ))}
                  </div>
                </>
              )}
            </Panel>

            {picked ? (
              <Panel title={t("borrower.appeals.formTitle")}>
                <div className="p-3.5">
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
                      {t("borrower.appeals.whyLabel")}
                    </span>
                    <textarea
                      value={reason}
                      maxLength={REASON_MAX}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t("borrower.appeals.whyPlaceholder")}
                      className="mt-1.5 h-24 w-full resize-none rounded border border-border bg-surface-inset px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-t4 focus-visible:border-accent"
                    />
                  </label>

                  {picked.usageKey !== null ? <Evidence usageKey={picked.usageKey} /> : null}
                </div>
              </Panel>
            ) : null}

            {appeals.length > 0 ? (
              <Panel title={t("borrower.appeals.mineTitle")}>
                <div className="flex flex-col gap-2 p-3.5">
                  {appeals.map((a) => (
                    <AppealCard key={a.appealKey} appeal={a} loan={loanOf(a.penalty.usageKey)} />
                  ))}
                </div>
              </Panel>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-0">
            <Panel
              title={
                <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-t3">
                  {t("borrower.appeals.summary")}
                </span>
              }
            >
              <div className="flex flex-col gap-2.5 p-3.5 text-[13px]">
                <div>
                  <div className="text-t3">{t("borrower.appeals.sumItem")}</div>
                  <div className="mt-1 font-medium leading-snug text-foreground">
                    {picked ? itemName(loanOf(picked.usageKey), picked.usageKey, t) : "-"}
                  </div>
                </div>
                <SumRow label={t("borrower.appeals.sumReason")}>
                  {picked ? penaltyReasonText(picked.reason, t) : "-"}
                </SumRow>
                <SumRow label={t("borrower.appeals.sumCut")}>
                  {picked?.creditDeducted ?? "-"}
                </SumRow>
                <SumRow label={t("borrower.appeals.sumUntil")}>
                  {picked ? fmtDate(picked.appealableUntil) : "-"}
                </SumRow>
              </div>

              <div className="px-3.5 pb-3.5">
                {blockKey ? <Warning>{t(blockKey)}</Warning> : null}
                {createAppeal.error ? (
                  <p
                    role="alert"
                    className="mb-2 rounded border border-[var(--s-alert-b)] bg-[var(--s-alert-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--s-alert-t)]"
                  >
                    {getErrorMessage(createAppeal.error)}
                  </p>
                ) : null}
                <Button
                  type="button"
                  className="h-[42px] w-full"
                  disabled={blockKey !== null || createAppeal.isPending}
                  onClick={submit}
                >
                  {createAppeal.isPending ? t("common.loading") : t("borrower.appeals.send")}
                </Button>
              </div>
            </Panel>
          </aside>
        </div>
      )}
    </div>
  );
}

/** One penalty that can still be appealed, with the figure the server deducted. */
function PenaltyCard({
  penalty,
  loan,
  selected,
  onPick,
}: {
  penalty: AppealablePenalty;
  loan: MyRequest | undefined;
  selected: boolean;
  onPick: () => void;
}) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={cn(
        "rounded border p-3 text-left transition-colors hover:border-line-strong",
        selected ? "border-accent bg-accent-soft" : "border-border bg-card",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">
            {itemName(loan, penalty.usageKey, t)}
          </span>
          {loan ? (
            <span className="mt-1 block font-mono text-[11.5px] text-t4">
              {loan.id} · {loan.serial}
            </span>
          ) : null}
        </span>
        <Badge tone="warn">
          {t("borrower.appeals.until", { date: fmtDate(penalty.appealableUntil) })}
        </Badge>
      </div>

      <div className="mt-2.5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
        <Field label={t("borrower.appeals.colReason")}>
          {penaltyReasonText(penalty.reason, t)}
        </Field>
        <Field label={t("borrower.appeals.colCut")} mono>
          {penalty.creditDeducted === null ? "-" : `−${penalty.creditDeducted}`}
        </Field>
        <Field label={t("borrower.appeals.colIssued")} mono>
          {fmtDate(penalty.issuedAt)}
        </Field>
      </div>
    </button>
  );
}

/** One filed appeal and where it got to. */
function AppealCard({ appeal, loan }: { appeal: AppealOutput; loan: MyRequest | undefined }) {
  const { t } = useTranslation();
  const penalty = appeal.penalty;

  return (
    <article className="rounded border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">
            {itemName(loan, penalty.usageKey, t)}
          </span>
          <span className="mt-1 block text-xs text-t3">
            {penaltyReasonText(penalty.reason, t)} ·{" "}
            {t("borrower.myRequests.penaltyCredit", { credit: penalty.creditDeducted ?? 0 })}
          </span>
        </span>
        <Badge tone={STATUS_TONE[appeal.status]}>
          {t(`borrower.appeals.status_${appeal.status}`)}
        </Badge>
      </div>

      {appeal.appealReason ? (
        <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-t2">
          {appeal.appealReason}
        </p>
      ) : null}

      <p className="mt-2 font-mono text-[11px] text-t4">
        {t("borrower.appeals.filedOn", { date: fmtDate(appeal.filedAt) })}
        {appeal.status === "approved"
          ? ` · ${t("borrower.appeals.restored", { count: appeal.creditRestored })}`
          : ""}
        {appeal.replacementPenalty
          ? ` · ${t("borrower.appeals.reducedTo", {
              count: appeal.replacementPenalty.creditDeducted ?? 0,
            })}`
          : ""}
      </p>
    </article>
  );
}

/**
 * What is on file for the loan, read-only. The same set the supervisor looks
 * at, so the borrower can point at what they mean in the reason.
 */
function Evidence({ usageKey }: { usageKey: number }) {
  const { t } = useTranslation();
  const { data } = useUsagePhotos(usageKey);
  const groups: { stage: keyof UsagePhotoSet; label: string }[] = [
    { stage: "before", label: t("borrower.pickup.stageBefore") },
    { stage: "after", label: t("borrower.pickup.stageAfter") },
    { stage: "inspection", label: t("borrower.pickup.stageInspection") },
  ];
  const shown = data ? groups.filter((g) => data[g.stage].length > 0) : [];

  return (
    <div className="mt-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
        {t("borrower.appeals.evidenceTitle")}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-t4">{t("borrower.appeals.evidenceHelp")}</p>
      {data && shown.length === 0 ? (
        <p className="mt-2 text-xs text-t4">{t("borrower.appeals.evidenceNone")}</p>
      ) : null}
      {data
        ? shown.map((g) => (
            <div key={g.stage} className="mt-2">
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-t4">
                {g.label}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data[g.stage].map((photo) => (
                  <a key={photo.imageKey} href={photo.imageUrl} target="_blank" rel="noreferrer">
                    <ImageThumb src={photo.imageUrl} size={64} />
                  </a>
                ))}
              </div>
            </div>
          ))
        : null}
    </div>
  );
}

function Panel({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      {title ? (
        <div className="border-b border-border px-3.5 py-2.5 text-sm font-semibold text-foreground">
          {title}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function Field({ label, mono = false, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">{label}</div>
      <div className={cn("mt-1 text-[13px] text-foreground", mono && "font-mono")}>{children}</div>
    </div>
  );
}

function SumRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-t3">{label}</span>
      <span className="text-right font-medium text-foreground">{children}</span>
    </div>
  );
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 flex items-start gap-2 rounded bg-[var(--s-warn-bg)] px-3 py-2.5 text-xs font-medium leading-relaxed text-[var(--s-warn-t)]">
      <TriangleAlert size={13} strokeWidth={2.4} className="mt-0.5 shrink-0" />
      {children}
    </p>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-6 py-11 text-center shadow-sm">
      <div className="text-[15px] font-semibold text-foreground">
        {t("borrower.appeals.noneTitle")}
      </div>
      <div className="max-w-sm text-[13px] leading-relaxed text-t3">
        {t("borrower.appeals.noneBody")}
      </div>
    </div>
  );
}

/**
 * The item a penalty came from. A penalty with no loan behind it (an
 * administrative ban) says so rather than showing a blank.
 */
function itemName(
  loan: MyRequest | undefined,
  usageKey: number | null,
  t: (key: string) => string,
): string {
  if (loan) return loan.name;
  return usageKey === null ? t("borrower.appeals.noLoan") : `#${usageKey}`;
}
