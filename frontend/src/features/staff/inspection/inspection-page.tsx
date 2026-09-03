import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shared/page-header";
import { TierDot } from "@/components/shared/tier-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DAMAGE_LEVELS } from "@/constants";
import { getErrorMessage } from "@/lib/error-messages";
import { fmtDateTime } from "@/features/borrower/format";
import type { DamageLevel } from "@/types/domain";
import {
  useCreateInspection,
  useInspectionQueue,
  useInspectionSubject,
} from "./use-inspection";
import type { InspectionQueueRow } from "./inspection.types";

const GRADES: DamageLevel[] = ["B0", "B1", "B2", "B3"];

/**
 * The inspection desk (proposal 5.9 "รับคืนและตรวจสภาพ", grades 5.7 B0-B3).
 *
 * A return arrives here already free of the borrower: lateness was settled at
 * the counter. What is decided here is what the item's condition costs, which
 * is why the screen is built around a comparison rather than a form. The
 * baseline condition recorded at handover sits next to what came back, with
 * the unit's earlier grades underneath, because a scratch that was already
 * noted last time is not this borrower's to pay for.
 *
 * Grading is one-way and the server refuses a second run. A grade the borrower
 * disputes goes to a supervisor as an appeal, never back through this screen.
 */
export default function StaffInspectionPage() {
  const { t } = useTranslation();
  const { data: rows, isLoading } = useInspectionQueue();
  const [openKey, setOpenKey] = useState<number | null>(null);

  return (
    <div>
      <PageHeader title={t("nav.inspect")} subtitle={t("staff.inspection.subtitle")} />

      {isLoading ? (
        <div className="py-16 text-center text-sm text-t3">{t("common.loading")}</div>
      ) : !rows || rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-10 text-center">
          <div className="text-sm font-semibold text-foreground">
            {t("staff.inspection.emptyTitle")}
          </div>
          <p className="mt-1 text-xs text-t3">{t("staff.inspection.emptyDesc")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <QueueCard
              key={row.usageKey}
              row={row}
              open={openKey === row.usageKey}
              onToggle={() => setOpenKey(openKey === row.usageKey ? null : row.usageKey)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueCard({
  row,
  open,
  onToggle,
}: {
  row: InspectionQueueRow;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">
            {row.itemName ?? "-"}
            {row.serialNo ? (
              <span className="ml-2 font-mono text-[11px] font-normal text-t4">
                {row.serialNo}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-t4">
            <TierDot tier={row.tier} />
            {row.tier ?? t("borrower.catalog.tierUnknown")}
            <span>
              · {row.borrowerName} · {row.borrowerStudentId}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {row.overdueDays > 0 ? (
            <Badge tone="warn">{t("staff.queue.overdueBy", { days: row.overdueDays })}</Badge>
          ) : null}
          {/* Evidence count up front: an inspector who knows there are no
              return photos decides differently from one who assumes there are. */}
          <span className="font-mono text-[11px] text-t3">
            {t("staff.inspection.photoCount", {
              before: row.beforeImageCount,
              after: row.afterImageCount,
            })}
          </span>
          <span className="font-mono text-[11px] text-t4">{fmtDateTime(row.returnedAt ?? undefined)}</span>
          <span className="text-xs font-medium text-accent">
            {open ? t("staff.inspection.close") : t("staff.inspection.openGrade")}
          </span>
        </div>
      </button>

      {open ? <Subject usageKey={row.usageKey} /> : null}
    </section>
  );
}

/** The comparison and the grade, loaded only when a row is opened. */
function Subject({ usageKey }: { usageKey: number }) {
  const { t } = useTranslation();
  const { data: subject, isLoading } = useInspectionSubject(usageKey);
  const create = useCreateInspection();

  const [level, setLevel] = useState<DamageLevel | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (isLoading) {
    return <div className="border-t border-border px-3.5 py-6 text-center text-sm text-t3">{t("common.loading")}</div>;
  }
  if (!subject) return null;
  // Captured so the async handler below keeps the narrowing; `subject` on its
  // own widens back to possibly-null inside the closure.
  const s = subject;

  if (done) {
    return (
      <div className="border-t border-border bg-[var(--s-ok-bg)] px-3.5 py-3 text-[13px] leading-relaxed text-[var(--s-ok-t)]">
        {done}
      </div>
    );
  }

  // Already graded: the server refuses a second one, so the form is not shown.
  if (subject.existingInspectionKey !== null) {
    return (
      <div className="border-t border-border px-3.5 py-3 text-[13px] leading-relaxed text-t2">
        {t("staff.inspection.alreadyGraded", { key: subject.existingInspectionKey })}
      </div>
    );
  }

  // What B1-B3 would cost, from the same two numbers the server multiplies.
  const preview =
    level === null ? null : Math.round(subject.creditWeight * DAMAGE_LEVELS[level].weight);

  async function grade() {
    setError(null);
    if (level === null) {
      setError(t("staff.inspection.pickGrade"));
      return;
    }
    try {
      const out = await create.mutateAsync({
        usageKey: s.usageKey,
        level,
        note: note.trim() || undefined,
      });
      setDone(
        out.penalty
          ? t("staff.inspection.doneCharged", {
              level: out.level ?? level,
              credit: out.penalty.creditDeducted,
              who: s.borrowerName,
            })
          : t("staff.inspection.doneFree", {
              pool: out.returnedToPool
                ? t("staff.inspection.backToPool")
                : t("staff.inspection.heldBack"),
            }),
      );
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <div className="border-t border-border">
      {/* Handover baseline against what came back. */}
      <div className="grid gap-0 border-b border-border md:grid-cols-2">
        <Side
          title={t("staff.inspection.atHandover")}
          when={subject.checkoutAt}
          condition={t(`staff.inspection.cond${subject.checkoutCondition}`)}
          note={subject.checkoutConditionNote}
          images={subject.beforeImages}
          className="border-b border-border md:border-b-0 md:border-r"
        />
        <Side
          title={t("staff.inspection.atReturn")}
          when={subject.returnedAt}
          condition={
            subject.overdueDays > 0
              ? t("staff.queue.overdueBy", { days: subject.overdueDays })
              : t("staff.inspection.onTime")
          }
          note={null}
          images={subject.afterImages}
        />
      </div>

      {/* Earlier grades on this same unit. */}
      {subject.unitHistory.length > 0 ? (
        <div className="border-b border-border px-3.5 py-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
            {t("staff.inspection.unitHistory")}
          </div>
          <ul className="flex flex-col gap-1">
            {subject.unitHistory.slice(0, 5).map((h) => (
              <li key={h.conditionKey} className="flex items-baseline gap-2 text-xs text-t2">
                <span className="font-mono text-t4">{fmtDateTime(h.loggedAt ?? undefined)}</span>
                <span>{t(`staff.inspection.cond${h.condition}`)}</span>
                {h.note ? <span className="min-w-0 truncate text-t3">{h.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* The grade. */}
      <div className="px-3.5 py-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
          {t("staff.inspection.grade")}
        </div>

        <div className="mb-2.5 flex flex-wrap gap-2">
          {GRADES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setLevel(level === g ? null : g)}
              className={[
                "rounded border px-2.5 py-1.5 text-left transition-colors",
                level === g
                  ? "border-accent bg-[var(--accent-soft)]"
                  : "border-border hover:bg-muted",
              ].join(" ")}
            >
              <span className="font-mono text-xs font-semibold text-foreground">{g}</span>
              <span className="ml-2 text-xs text-t3">{DAMAGE_LEVELS[g].label}</span>
            </button>
          ))}
        </div>

        {/* Said before the charge is made, not after. */}
        <p className="mb-2.5 text-xs leading-relaxed text-t3">
          {level === null
            ? t("staff.inspection.costHint", { weight: subject.creditWeight })
            : preview === 0
              ? t("staff.inspection.costNone")
              : t("staff.inspection.costPreview", {
                  credit: preview,
                  who: s.borrowerName,
                  score: subject.borrowerCreditScore,
                })}
        </p>

        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("staff.inspection.notePlaceholder")}
          className="mb-2.5 max-w-xl"
        />

        {error ? <p className="mb-2.5 text-xs text-[var(--s-warn-t)]">{error}</p> : null}

        <Button type="button" size="sm" disabled={create.isPending} onClick={() => void grade()}>
          {create.isPending ? t("common.loading") : t("staff.inspection.recordGrade")}
        </Button>
      </div>
    </div>
  );
}

function Side({
  title,
  when,
  condition,
  note,
  images,
  className,
}: {
  title: string;
  when: string | null;
  condition: string;
  note: string | null;
  images: { imageKey: number; url: string }[];
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={["p-3.5", className ?? ""].join(" ")}>
      <div className="mb-1.5 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
        {title}
        <span className="font-mono font-normal normal-case tracking-normal text-t4">
          {fmtDateTime(when ?? undefined)}
        </span>
      </div>
      <div className="text-[13px] text-foreground">{condition}</div>
      {note ? <p className="mt-1 text-xs leading-relaxed text-t3">{note}</p> : null}
      {images.length === 0 ? (
        <p className="mt-2 text-xs text-t3">{t("staff.inspection.noPhotos")}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((img) => (
            <img
              key={img.imageKey}
              src={img.url}
              alt=""
              className="h-24 w-32 rounded border border-border bg-surface-inset object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}
