import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { th } from "date-fns/locale";
import { Download, FileText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { TierDot } from "@/components/shared/tier-badge";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { cn } from "@/lib/utils";
import {
  REQUEST_TABS,
  creditCutOf,
  stepAt,
  stepsOf,
  type MyRequest,
  type MyRequestStatus,
  type RequestTab,
} from "../mock-data";
import { useRequestDraft } from "../request/request-draft.store";
import { useMyRequests, requestsInTab, type DraftSummary } from "./use-my-requests";
import { useSubmittedRequests } from "./submitted-requests.store";

const STATUS_TONE: Record<MyRequestStatus, BadgeTone> = {
  pending: "warn",
  approved: "ok",
  preparing: "info",
  ready: "info",
  inUse: "ok",
  returned: "neutral",
  inspecting: "neutral",
  done: "neutral",
  rejected: "alert",
  cancelled: "neutral",
};

/** Statuses that carry a standing explanation under the progress track. */
const STATUS_NOTE: Partial<Record<MyRequestStatus, string>> = {
  approved: "borrower.myRequests.noteAutoApproved",
  inspecting: "borrower.myRequests.noteInspecting",
  rejected: "borrower.myRequests.noteRejected",
  cancelled: "borrower.myRequests.noteCancelled",
};

const TAB_LABEL: Record<RequestTab, string> = {
  active: "borrower.myRequests.tabActive",
  using: "borrower.myRequests.tabUsing",
  history: "borrower.myRequests.tabHistory",
};

/**
 * My requests — where every borrow and booking lands after it is sent.
 *
 * Requests are atomic: one item is one request with its own number, so a T2
 * item can sit waiting for a supervisor while the T0 item sent alongside it is
 * already collected. Each gets its own card and its own progress track.
 *
 * Three sources feed the list (see `useMyRequests`): seeded history, whatever
 * was submitted this session, and the open draft.
 */
export default function MyLoansPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<RequestTab>("active");

  const { requests, draft, countByTab } = useMyRequests();
  const cancelRequest = useSubmittedRequests((s) => s.cancel);
  const clearDraft = useRequestDraft((s) => s.clear);

  const rows = requestsInTab(requests, tab);
  const showDraft = tab === "active" && draft !== null;
  const empty = rows.length === 0 && !showDraft;

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
            <RequestCard key={row.id} row={row} onCancel={() => cancelRequest(row.id)} />
          ))}

          {empty ? <EmptyState /> : null}
        </div>
      </section>
    </div>
  );
}

function RequestCard({ row, onCancel }: { row: MyRequest; onCancel: () => void }) {
  const { t } = useTranslation();
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
    row.status === "pending" ||
    row.status === "approved" ||
    (row.kind === "room" && row.status === "ready");

  return (
    <article className="rounded-md border border-border p-3.5 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-t3">{row.id}</span>
          <span className="inline-flex items-center gap-1.5 rounded bg-surface-inset px-1.5 py-0.5 text-[10.5px] font-semibold text-t3">
            <TierDot tier={row.tier} />
            {row.tier}
          </span>
        </span>
        <Badge tone={STATUS_TONE[row.status]}>{t(statusKey(row.status))}</Badge>
      </div>

      <h3 className="mt-2 text-[15px] font-semibold leading-snug text-foreground">{row.name}</h3>
      <div className="mt-1 font-mono text-xs text-t3">
        {row.serial} · {fmtRange(row.startDate, row.endDate)}
      </div>

      {/* Due dates are counted in days, which a room booked by the hour has
          none of — it would read "0 days left" on every booking. */}
      {row.status === "inUse" && row.kind === "equipment" ? <LoanInfo row={row} /> : null}
      {row.inspection ? <InspectionLine row={row} /> : null}

      <ProgressTrack steps={steps} at={at} stalled={isStalled(row.status)} />

      {noteKey ? (
        <p className="mt-3 rounded bg-secondary px-3 py-2 text-xs leading-relaxed text-t3">
          {t(noteKey)}
        </p>
      ) : null}

      <Actions row={row} canCancel={canCancel} onCancel={onCancel} />
    </article>
  );
}

/** Days left, extensions used, and what quota remains — the mockup's ext line. */
function LoanInfo({ row }: { row: MyRequest }) {
  const { t } = useTranslation();
  const left = row.daysLeft ?? 0;
  const used = row.extensionsUsed ?? 0;
  const quota = extensionQuota(row);

  const parts = [
    left < 0
      ? t("borrower.myRequests.extOverdue", { count: Math.abs(left) })
      : t("borrower.myRequests.extDaysLeft", { count: left }),
    used > 0 ? t("borrower.myRequests.extUsed", { count: used }) : null,
    t(quota.key, { count: quota.count }),
  ].filter(Boolean);

  return (
    <p className={cn("mt-2 text-xs leading-relaxed", left <= 1 ? "text-[var(--s-warn-t)]" : "text-t2")}>
      {parts.join(" · ")}
    </p>
  );
}

function InspectionLine({ row }: { row: MyRequest }) {
  const { t } = useTranslation();
  const insp = row.inspection;
  if (!insp) return null;

  const clean = insp.damage === "B0";
  const cut = creditCutOf(row.tier, insp.damage);
  const date = fmtDay(insp.inspectedAt);

  return (
    <>
      <p
        className={cn(
          "mt-2.5 rounded px-3 py-2 text-xs font-medium leading-relaxed",
          clean
            ? "bg-[var(--s-ok-bg)] text-[var(--s-ok-t)]"
            : "bg-[var(--s-warn-bg)] text-[var(--s-warn-t)]",
        )}
      >
        {clean
          ? t("borrower.myRequests.inspClean", { damage: insp.damage, date })
          : t("borrower.myRequests.inspDamaged", { damage: insp.damage, cut, date })}
        {!clean
          ? ` · ${
              insp.appealDaysLeft > 0
                ? t("borrower.myRequests.appealLeft", { count: insp.appealDaysLeft })
                : t("borrower.myRequests.appealClosed")
            }`
          : ""}
      </p>
      {insp.reason ? (
        <p className="mt-1.5 text-xs leading-relaxed text-t3">
          {t("borrower.myRequests.inspBy", { name: insp.inspectedBy })} — {insp.reason}
        </p>
      ) : null}
    </>
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
  // (i + 0.5) / steps.length. The bar stops on that centre — it should read as
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
  canCancel,
  onCancel,
}: {
  row: MyRequest;
  canCancel: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const insp = row.inspection;
  const canAppeal = insp && insp.damage !== "B0" && insp.appealDaysLeft > 0;
  const canExtend = row.status === "inUse" && extensionsLeft(row) > 0;
  const onUseRoom = () => navigate(ROUTES.ROOM_USE);

  const buttons: ReactNode[] = [];

  if (row.status === "ready") {
    buttons.push(
      row.kind === "room" ? (
        // A confirmed room is used, not collected — send them to check in.
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
  if (canExtend) {
    buttons.push(
      // TODO: wire to POST /loans/:id/extend when the extension flow lands.
      <Button key="extend" type="button" variant="outline" size="sm" disabled>
        {t("borrower.myRequests.extend")}
      </Button>,
    );
  }
  if (canAppeal) {
    buttons.push(
      // TODO: link to the appeals page once it takes a target request.
      <Button key="appeal" type="button" size="sm" disabled>
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
        onClick={onCancel}
      >
        {t(row.kind === "room" ? "borrower.roomUse.cancel" : "borrower.myRequests.cancel")}
      </Button>,
    );
  }

  if (buttons.length === 0) return null;
  return <div className="mt-3 flex flex-wrap gap-2">{buttons}</div>;
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

      <h3 className="mt-2 text-[15px] font-semibold leading-snug text-foreground">
        {draft.title}
      </h3>
      <div className="mt-1 font-mono text-xs text-t3">
        {t("borrower.myRequests.draftSummary", { lines: draft.lines, units: draft.units })} ·{" "}
        {draft.endDate
          ? fmtRange(draft.startDate, draft.endDate)
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

/** Rejected and cancelled requests stopped moving — the bar should say so. */
function isStalled(status: MyRequestStatus): boolean {
  return status === "rejected" || status === "cancelled";
}

/**
 * Online extensions allowed per tier, per the lending rules: T0 unlimited,
 * T1 once (then the item must be inspected), T2 needs a supervisor.
 *
 * T3 gets none: a fixed facility is held for the hours booked and nothing
 * more — when the slot ends the room goes back on the board for whoever wants
 * it next, so extending would mean quietly taking someone else's hour.
 */
function extensionsLeft(row: MyRequest): number {
  const used = row.extensionsUsed ?? 0;
  if (row.tier === "T3") return 0;
  if (row.tier === "T0") return Infinity;
  if (row.tier === "T1") return Math.max(0, 1 - used);
  return 0;
}

/** i18n key + count for the remaining-extensions phrase. */
function extensionQuota(row: MyRequest): { key: string; count: number | string } {
  if (row.tier === "T2") return { key: "borrower.myRequests.extQuotaSup", count: 0 };
  const left = extensionsLeft(row);
  if (left === 0) return { key: "borrower.myRequests.extQuotaNone", count: 0 };
  return {
    key: "borrower.myRequests.extQuota",
    count: left === Infinity ? "∞" : left,
  };
}

/** "12–16 ส.ค." — collapses to one date when start and end match. */
function fmtRange(start: string, end: string): string {
  if (start === end) return fmtDay(start);
  return `${format(parseISO(start), "d", { locale: th })}–${fmtDay(end)}`;
}

function fmtDay(iso: string): string {
  return format(parseISO(iso), "d MMM", { locale: th });
}

function exportCsv(requests: MyRequest[]): void {
  const header = ["requestId", "kind", "tier", "name", "serial", "status", "start", "end"];
  const rows = requests.map((r) =>
    [r.id, r.kind, r.tier, r.name, r.serial, r.status, r.startDate, r.endDate]
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
