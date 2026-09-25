import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { fmtDate, fmtDayMonth, fmtDayNum } from "@/lib/datetime";
import { useNavigate } from "react-router-dom";
import { Download, FileText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { TierDot } from "@/components/shared/tier-badge";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ROUTES } from "@/constants";
import { getErrorMessage } from "@/lib/error-messages";
import { cn } from "@/lib/utils";
import {
  REQUEST_TABS,
  stepAt,
  stepsOf,
  type MyRequest,
  type MyRequestStatus,
  type RequestTab,
} from "../request-status";
import { useRequestDraft } from "../request/request-draft.store";
import { penaltyReasonText } from "../appeals/penalty-reason";
import { usePenaltiesByUsage, type LoanPenalty } from "../appeals/use-my-appeals";
import { useLoanExtension, type LoanExtension } from "./use-extensions";
import { useMyRequests, requestsInTab, type DraftSummary } from "./use-my-requests";
import { useCancelRequest } from "./use-my-requests-api";

const STATUS_TONE: Record<MyRequestStatus, BadgeTone> = {
  pending: "warn",
  approved: "ok",
  preparing: "info",
  ready: "info",
  inUse: "ok",
  returned: "neutral",
  done: "neutral",
  rejected: "alert",
  cancelled: "neutral",
};

/** Statuses that carry a standing explanation under the progress track. */
const STATUS_NOTE: Partial<Record<MyRequestStatus, string>> = {
  approved: "borrower.myRequests.noteAutoApproved",
  // `returned` is the server's "back, not yet graded".
  returned: "borrower.myRequests.noteInspecting",
  rejected: "borrower.myRequests.noteRejected",
  cancelled: "borrower.myRequests.noteCancelled",
};

const TAB_LABEL: Record<RequestTab, string> = {
  active: "borrower.myRequests.tabActive",
  using: "borrower.myRequests.tabUsing",
  history: "borrower.myRequests.tabHistory",
};

/**
 * My requests - where every borrow and booking lands after it is sent.
 *
 * Requests are atomic: one item is one request with its own number, so a T2
 * item can sit waiting for a supervisor while the T0 item sent alongside it is
 * already collected. Each gets its own card and its own progress track.
 *
 * Two sources feed the list (see `useMyRequests`): the server's `loan.list`,
 * and the open draft that has not been sent yet.
 */
export default function MyLoansPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<RequestTab>("active");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MyRequest | null>(null);

  const { requests, draft, countByTab } = useMyRequests();
  const penaltiesByUsage = usePenaltiesByUsage();
  const cancelRequest = useCancelRequest();
  const clearDraft = useRequestDraft((s) => s.clear);

  const rows = requestsInTab(requests, tab);
  const showDraft = tab === "active" && draft !== null;
  const empty = rows.length === 0 && !showDraft;

  function closeCancelModal() {
    if (cancelRequest.isPending) return;
    setCancelTarget(null);
    setCancelError(null);
  }

  async function confirmCancellation() {
    // Every listed row comes from loan.list and carries its key.
    if (!cancelTarget || cancelTarget.reservationKey === undefined) return;

    setCancelError(null);

    try {
      await cancelRequest.mutateAsync({ reservationKey: cancelTarget.reservationKey });
      setCancelTarget(null);
    } catch (error) {
      setCancelError(getErrorMessage(error));
    }
  }

  return (
    <div>
      <PageHeader title={t("nav.myRequests")} subtitle={t("borrower.myRequests.subtitle")} />

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center gap-0.5 overflow-x-auto border-b border-border px-1.5">
          {REQUEST_TABS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={key === tab}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-3 text-[13px] transition-colors",
                key === tab
                  ? "border-accent font-semibold text-foreground"
                  : "border-transparent text-t3 hover:text-foreground",
              )}
            >
              {t(TAB_LABEL[key])}
              <span className="font-mono text-[11px] tabular-nums text-t4">
                {countByTab[key]}
              </span>
            </button>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="my-2 ml-auto mr-2 shrink-0"
            onClick={() => exportCsv(requests)}
          >
            <Download size={13} strokeWidth={2.2} />
            {t("borrower.myRequests.export")}
          </Button>
        </div>

        <div className="flex flex-col gap-3 p-3.5">
          {showDraft && draft ? (
            <DraftCard
              draft={draft}
              onEdit={() => navigate(ROUTES.REQUEST)}
              onDrop={clearDraft}
            />
          ) : null}

          {rows.map((row) => (
            <RequestCard
              key={row.id}
              row={row}
              penalties={row.usageKey != null ? (penaltiesByUsage.get(row.usageKey) ?? []) : []}
              cancelling={
                cancelRequest.isPending &&
                cancelRequest.variables?.reservationKey === row.reservationKey
              }
              onCancel={() => {
                setCancelError(null);
                setCancelTarget(row);
              }}
            />
          ))}

          {empty ? <EmptyState /> : null}
        </div>
      </section>

      <Modal
        open={cancelTarget !== null}
        onClose={closeCancelModal}
        title={t("borrower.myRequests.cancelConfirmTitle")}
        subtitle={cancelTarget ? `${cancelTarget.id} · ${cancelTarget.name}` : undefined}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={cancelRequest.isPending}
              onClick={closeCancelModal}
            >
              {t("borrower.myRequests.cancelConfirmNo")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={cancelRequest.isPending}
              onClick={() => void confirmCancellation()}
            >
              {cancelRequest.isPending
                ? t("common.loading")
                : t("borrower.myRequests.cancelConfirmYes")}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-t2">
          {t("borrower.myRequests.cancelConfirmBody")}
        </p>
        {cancelError ? (
          <div
            role="alert"
            className="mt-3 rounded border border-[var(--s-alert-b)] bg-[var(--s-alert-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--s-alert-t)]"
          >
            {cancelError}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function RequestCard({
  row,
  penalties,
  cancelling,
  onCancel,
}: {
  row: MyRequest;
  penalties: LoanPenalty[];
  cancelling: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const extension = useLoanExtension(row);
  const steps = stepsOf(row.kind);
  const at = stepAt(row.status, row.kind);
  // Who is being waited on differs by kind: a room waits on the counter staff,
  // a T2 item on a supervisor. Saying "อาจารย์" over a room booking would send
  // the borrower chasing the wrong person.
  const noteKey =
    row.status !== "pending"
      ? STATUS_NOTE[row.status]
      : row.kind === "room"
        ? "borrower.roomUse.waitStaff"
        : row.tier === "T2"
          ? "borrower.myRequests.noteWaitSup"
          : STATUS_NOTE[row.status];

  // Only the borrower's own in-flight work can still be pulled back. A room
  // stays cancellable after approval too, right up until check-in: dropping it
  // hands the hours back to whoever wants them next, which is the whole point.
  const canCancel =
    row.reservationKey !== undefined
      ? row.cancellable === true
      : row.status === "pending" ||
        row.status === "approved" ||
        (row.kind === "room" && row.status === "ready");

  return (
    <article className="rounded-md border border-border p-3.5 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-t3">{row.id}</span>
          <span className="inline-flex items-center gap-1.5 rounded bg-surface-inset px-1.5 py-0.5 text-[10.5px] font-semibold text-t3">
            <TierDot tier={row.tier} />
            {row.tier ?? t("borrower.catalog.tierUnknown")}
          </span>
        </span>
        <Badge tone={STATUS_TONE[row.status]}>{t(statusKey(row.status))}</Badge>
      </div>

      <h3 className="mt-2 text-[15px] font-semibold leading-snug text-foreground">{row.name}</h3>
      <div className="mt-1 font-mono text-xs text-t3">
        {row.serial} · {requestWindow(row, t)}
      </div>

      {/* Due dates are counted in days, which a room booked by the hour has
          none of - it would read "0 days left" on every booking. */}
      {row.status === "inUse" && row.kind === "equipment" ? (
        <LoanInfo row={row} extension={extension} />
      ) : null}
      {penalties.map((p) => (
        <PenaltyLine key={p.penaltyKey} penalty={p} />
      ))}

      <ProgressTrack steps={steps} at={at} stalled={isStalled(row.status)} />

      {noteKey ? (
        <p className="mt-3 rounded bg-secondary px-3 py-2 text-xs leading-relaxed text-t3">
          {t(noteKey)}
        </p>
      ) : null}
      {row.decisionNote && isStalled(row.status) ? (
        <p className="mt-1.5 text-xs leading-relaxed text-t2">
          {t("borrower.myRequests.decisionNote", { note: row.decisionNote })}
        </p>
      ) : null}

      <Actions
        row={row}
        extension={extension}
        penalties={penalties}
        canCancel={canCancel}
        cancelling={cancelling}
        onCancel={onCancel}
      />
    </article>
  );
}

/** Days left, extensions used, and what the server says about extending. */
function LoanInfo({ row, extension }: { row: MyRequest; extension: LoanExtension }) {
  const { t } = useTranslation();
  const left = row.daysLeft ?? 0;
  const used = extension.extensionsUsed;
  const { reasonKey, values } = extension.state;

  const parts = [
    left < 0
      ? t("borrower.myRequests.extOverdue", { count: Math.abs(left) })
      : t("borrower.myRequests.extDaysLeft", { count: left }),
    used > 0 ? t("borrower.myRequests.extUsed", { count: used }) : null,
    reasonKey ? t(reasonKey, values) : null,
  ].filter(Boolean);

  return (
    <p className={cn("mt-2 text-xs leading-relaxed", left <= 1 ? "text-[var(--s-warn-t)]" : "text-t2")}>
      {parts.join(" · ")}
    </p>
  );
}

/**
 * One penalty this loan produced, with the amount the server actually
 * deducted. A late return and a damage grade are separate penalties and are
 * appealed separately, so each gets its own line.
 */
function PenaltyLine({ penalty }: { penalty: LoanPenalty }) {
  const { t } = useTranslation();
  const appeal = penalty.appeal;

  const status = appeal
    ? t(`borrower.appeals.status_${appeal.status}`)
    : penalty.appealableUntil
      ? t("borrower.appeals.until", { date: fmtDate(penalty.appealableUntil) })
      : null;

  return (
    <p className="mt-2.5 rounded bg-[var(--s-warn-bg)] px-3 py-2 text-xs font-medium leading-relaxed text-[var(--s-warn-t)]">
      {t("borrower.myRequests.penaltyLine", {
        reason: penaltyReasonText(penalty.reason, t),
        credit: penalty.creditDeducted ?? 0,
        date: fmtDate(penalty.issuedAt),
      })}
      {status ? ` · ${status}` : ""}
    </p>
  );
}

/** Bar plus step labels. A stalled request keeps the bar where it stopped. */
function ProgressTrack({
  steps,
  at,
  stalled,
}: {
  steps: readonly string[];
  at: number;
  stalled: boolean;
}) {
  const { t } = useTranslation();
  // Each label owns an equal-width column, so step i's centre sits at
  // (i + 0.5) / steps.length. The bar stops on that centre - it should read as
  // "we are at this step", not "past it". A finished request fills the track.
  const finished = at >= steps.length;
  const pct = finished ? 100 : ((at + 0.5) / steps.length) * 100;

  return (
    <>
      <div className="mt-3.5 h-1 overflow-hidden rounded-sm bg-surface-inset">
        <div
          className={cn("h-full rounded-sm", stalled ? "bg-[var(--s-t4)]" : "bg-accent")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex">
        {steps.map((key, i) => (
          <span
            key={key}
            className={cn(
              "flex-1 px-0.5 text-center text-[10.5px] leading-tight",
              i < at && "text-t1",
              i === at && !stalled && "font-semibold text-accent",
              i === at && stalled && "font-semibold text-t4",
              i > at && "text-t4",
            )}
          >
            {t(`borrower.myRequests.${key}`)}
          </span>
        ))}
      </div>
    </>
  );
}

function Actions({
  row,
  extension,
  penalties,
  canCancel,
  cancelling,
  onCancel,
}: {
  row: MyRequest;
  extension: LoanExtension;
  penalties: LoanPenalty[];
  canCancel: boolean;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ext = extension.state;
  // The appeal page opens on the penalty rather than making the borrower find
  // it again. A loan with two open penalties opens on the first; both are
  // listed there.
  const appealable = penalties.find((p) => p.appealableUntil !== null);
  const onLoan = row.status === "inUse";
  const onUseRoom = () => navigate(ROUTES.ROOM_USE);
  // Between pressing "extend" and the request going out: the borrower sees
  // the new due date and who decides, and can back out.
  const [asking, setAsking] = useState(false);

  const buttons: ReactNode[] = [];

  if (row.status === "ready") {
    buttons.push(
      row.kind === "room" ? (
        // A confirmed room is used, not collected - send them to check in.
        <Button key="use-room" type="button" size="sm" onClick={onUseRoom}>
          {t("borrower.myRequests.goUseRoom")}
        </Button>
      ) : (
        <Button key="pickup" type="button" size="sm" onClick={() => navigate(ROUTES.PICKUP)}>
          {t("borrower.myRequests.goPickup")}
        </Button>
      ),
    );
  }
  if (onLoan && asking && ext.canRequest) {
    buttons.push(
      <Button
        key="extend-yes"
        type="button"
        size="sm"
        disabled={extension.busy}
        onClick={() => {
          setAsking(false);
          extension.request();
        }}
      >
        {t(ext.confirmLabelKey)}
      </Button>,
      <Button
        key="extend-no"
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setAsking(false)}
      >
        {t("borrower.myRequests.extAskNo")}
      </Button>,
    );
  } else if (onLoan && ext.canRequest) {
    buttons.push(
      <Button
        key="extend"
        type="button"
        variant="outline"
        size="sm"
        disabled={extension.busy}
        title={t(ext.reasonKey, ext.values)}
        onClick={() => setAsking(true)}
      >
        {extension.busy ? t("common.loading") : t(ext.labelKey)}
      </Button>,
    );
  }
  if (onLoan && ext.isPending) {
    buttons.push(
      <Button
        key="cancel-ext"
        type="button"
        variant="outline"
        size="sm"
        disabled={extension.busy}
        onClick={extension.withdraw}
      >
        {t("borrower.myRequests.cancelExt")}
      </Button>,
    );
  }
  if (appealable) {
    buttons.push(
      <Button
        key="appeal"
        type="button"
        size="sm"
        onClick={() => navigate(`${ROUTES.APPEALS}?penalty=${appealable.penaltyKey}`)}
      >
        {t("borrower.myRequests.appeal")}
      </Button>,
    );
  }
  // Last, so the action the borrower came for leads and the destructive one
  // sits beside it rather than in front of it.
  if (canCancel) {
    buttons.push(
      <Button
        key="cancel"
        type="button"
        variant="outline"
        size="sm"
        className="border-[var(--s-alert-b)] text-[var(--s-alert-t)] hover:bg-[var(--s-alert-bg)]"
        disabled={cancelling}
        onClick={onCancel}
      >
        {cancelling
          ? t("common.loading")
          : t(row.kind === "room" ? "borrower.roomUse.cancel" : "borrower.myRequests.cancel")}
      </Button>,
    );
  }

  const error = extension.error ? getErrorMessage(extension.error) : null;
  if (buttons.length === 0 && !error) return null;
  return (
    <>
      {asking && ext.canRequest ? (
        <p className="mt-3 rounded border border-l-[3px] border-border border-l-accent-orange bg-[var(--s-hot-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--s-hot-t)]">
          {t(ext.askNoteKey, ext.values)} {t("borrower.myRequests.extNewDue", ext.values)}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded border border-[var(--s-alert-b)] bg-[var(--s-alert-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--s-alert-t)]"
        >
          {error}
        </p>
      ) : null}
      {buttons.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{buttons}</div> : null}
    </>
  );
}

function DraftCard({
  draft,
  onEdit,
  onDrop,
}: {
  draft: DraftSummary;
  onEdit: () => void;
  onDrop: () => void;
}) {
  const { t } = useTranslation();
  return (
    <article className="rounded-md border border-dashed border-line-strong p-3.5 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-xs text-t3">{t("borrower.myRequests.draftTitle")}</span>
        <Badge tone="neutral">{t("borrower.myRequests.draftStatus")}</Badge>
      </div>

      <h3
        className="mt-2 truncate text-[15px] font-semibold leading-snug text-foreground"
        title={draft.title}
      >
        {draft.title}
      </h3>
      <div className="mt-1 font-mono text-xs text-t3">
        {t("borrower.myRequests.draftSummary", { lines: draft.lines, units: draft.units })} ·{" "}
        {draft.endDate
          ? t("borrower.myRequests.requestWindow", {
              pickupDate: fmtDay(draft.startDate),
              pickupTime: draft.pickupTime,
              returnDate: fmtDay(draft.endDate),
              returnTime: draft.returnTime,
            })
          : t("borrower.myRequests.draftNoEnd")}
      </div>

      <p className="mt-3 rounded bg-secondary px-3 py-2 text-xs leading-relaxed text-t3">
        {t("borrower.myRequests.draftNote")}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onEdit}>
          {t("borrower.myRequests.draftEdit")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-[var(--s-alert-b)] text-[var(--s-alert-t)] hover:bg-[var(--s-alert-bg)]"
          onClick={onDrop}
        >
          {t("borrower.myRequests.draftDrop")}
        </Button>
      </div>
    </article>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <span className="mb-1 text-t4">
        <FileText size={26} strokeWidth={1.5} />
      </span>
      <div className="text-sm font-semibold text-foreground">
        {t("borrower.myRequests.emptyTitle")}
      </div>
      <div className="text-xs text-t3">{t("borrower.myRequests.emptyBody")}</div>
    </div>
  );
}

function statusKey(status: MyRequestStatus): string {
  return `borrower.myRequests.st${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

/** Rejected and cancelled requests stopped moving - the bar should say so. */
function isStalled(status: MyRequestStatus): boolean {
  return status === "rejected" || status === "cancelled";
}

/**
 * When the item is actually due back.
 *
 * `endDate` is what the borrower *asked* for and never moves; `dueAt` is what
 * the loan is really running to, and it is set at the counter and pushed out
 * by every extension. Printing `endDate` on a live loan shows a date that
 * silently stops matching the "N days left" line right beside it.
 */
function dueDateOf(row: MyRequest): string {
  return row.dueAt ?? row.endDate;
}

/** "12–16 ส.ค." - collapses to one date when start and end match. */
function fmtRange(start: string, end: string): string {
  if (start === end) return fmtDay(start);
  return `${fmtDayNum(start)}–${fmtDay(end)}`;
}

function fmtDay(iso: string): string {
  return fmtDayMonth(iso);
}

function requestWindow(row: MyRequest, t: (key: string, values?: Record<string, unknown>) => string): string {
  if (row.kind !== "equipment" || !row.pickupTime || !row.returnTime) {
    return fmtRange(row.startDate, dueDateOf(row));
  }
  return t("borrower.myRequests.requestWindow", {
    pickupDate: fmtDay(row.startDate),
    pickupTime: row.pickupTime,
    returnDate: fmtDay(dueDateOf(row)),
    returnTime: row.returnTime,
  });
}

function exportCsv(requests: MyRequest[]): void {
  const header = ["requestId", "kind", "tier", "name", "serial", "status", "start", "end"];
  const rows = requests.map((r) =>
    [r.id, r.kind, r.tier ?? "", r.name, r.serial, r.status, r.startDate, dueDateOf(r)]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  const csv = "﻿" + [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "my-requests.csv";
  a.click();
  URL.revokeObjectURL(url);
}
