import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/shared/page-header";
import { TierDot } from "@/components/shared/tier-badge";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ROUTES } from "@/constants";
import { uploadAcceptAttr, validateUploadFile } from "@/lib/upload-validation";
import {
  usePickupImageUpload,
  useUsagePhotos,
} from "@/features/borrower/pickup/use-pickup-image-upload";
import {
  prepareBorrowerImage,
  releaseBorrowerImage,
} from "@/features/borrower/uploads/prepared-image";
import { getErrorMessage } from "@/lib/error-messages";
import { fmtDateTime } from "@/features/borrower/format";
import type { ExtensionReviewRow } from "@/features/supervisor/approvals/approval.types";
import {
  useAllocate,
  useConfirmPickup,
  useMarkLost,
  useRecordReturn,
  useStaffDecideExtension,
  useStaffExtensionQueue,
  useStaffQueue,
  useStaffQueueCounts,
} from "./use-staff-queue";
import {
  STAFF_QUEUE_BUCKETS,
  type ConditionType,
  type StaffQueueBucket,
  type StaffQueueRow,
} from "./queue.types";

const BUCKET_LABEL: Record<StaffQueueBucket, string> = {
  toPrepare: "staff.queue.bucketToPrepare",
  toHandover: "staff.queue.bucketToHandover",
  onLoan: "staff.queue.bucketOnLoan",
  overdue: "staff.queue.bucketOverdue",
};

/** What pressing the row's button does, per bucket. */
const ACTION_LABEL: Record<StaffQueueBucket, string> = {
  toPrepare: "staff.queue.actionPrepare",
  toHandover: "staff.queue.actionHandover",
  onLoan: "staff.queue.actionReturn",
  overdue: "staff.queue.actionReturn",
};

/**
 * The staff counter (SRS: Staff dashboard, polled every 30s).
 *
 * Built around what actually happens at a counter: a student walks up, and the
 * person serving them has seconds to find their row and act on it. So search
 * is server-side and first in the tab order, the buckets are the four physical
 * states of a loan, and every action reports what it did rather than silently
 * refreshing.
 *
 * The queue is shared. Two staff on two machines see the same rows, and the
 * poll is 30s wide, so a row on screen may already have been actioned by
 * somebody else. Every failure path therefore ends in a readable sentence and
 * a refetch, not a dead button.
 */
export default function StaffQueuePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Extensions are a second pile at the same counter, not a second screen: the
  // fifth tile above (`extensionsToInspect`) opens straight into it.
  const [view, setView] = useState<"queue" | "extensions">("queue");
  const [bucket, setBucket] = useState<StaffQueueBucket>("toPrepare");
  const [search, setSearch] = useState("");

  const { data: counts } = useStaffQueueCounts();
  const { data: rows, isLoading } = useStaffQueue(bucket, search);

  // One row at a time: the button that was pressed is the one that spins, and
  // the rest of the queue stays usable.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const allocate = useAllocate();
  const confirmPickup = useConfirmPickup();
  const recordReturn = useRecordReturn();
  const markLost = useMarkLost();

  const { data: extRows, isLoading: extLoading } = useStaffExtensionQueue(
    view === "extensions" ? search : "",
  );
  const decideExtension = useStaffDecideExtension();
  const [extBusyKey, setExtBusyKey] = useState<number | null>(null);
  const [extRejecting, setExtRejecting] = useState<number | null>(null);
  const [extReason, setExtReason] = useState("");
  const [extConditions, setExtConditions] = useState<Record<number, ConditionType>>({});
  const extConditionOf = (key: number): ConditionType => extConditions[key] ?? "Normal";

  async function decideExt(row: ExtensionReviewRow, decision: "approve" | "reject") {
    const why = extReason.trim();
    if (decision === "reject" && !why) return;

    setExtBusyKey(row.extensionKey);
    setResult(null);
    try {
      await decideExtension.mutateAsync({
        extensionKey: row.extensionKey,
        decision,
        condition: extConditionOf(row.extensionKey),
        ...(why ? { note: why } : {}),
      });
      setResult({
        tone: "ok",
        text: t(
          decision === "approve" ? "staff.queue.doneExtApprove" : "staff.queue.doneExtReject",
          { item: row.itemName ?? "" },
        ),
      });
      setExtRejecting(null);
      setExtReason("");
    } catch (error) {
      setResult({ tone: "bad", text: getErrorMessage(error) });
    } finally {
      setExtBusyKey(null);
    }
  }

  const EXT_CONDITIONS: ConditionType[] = ["Normal", "MinorDamage", "MajorDamage", "Broken"];

  const extColumns: Column<ExtensionReviewRow>[] = [
    {
      key: "borrower",
      header: t("staff.queue.colBorrower"),
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">
            {r.borrower.firstName} {r.borrower.lastName}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-t4">{r.borrower.studentId}</div>
        </div>
      ),
    },
    {
      key: "item",
      header: t("staff.queue.colItem"),
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-foreground">{r.itemName ?? "-"}</div>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-t4">
            {r.tier ? <TierDot tier={r.tier} /> : null}
            {r.tier ?? t("borrower.catalog.tierUnknown")}
            {r.serialNo ? ` · ${r.serialNo}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "extendNo",
      header: t("staff.queue.colExtension"),
      render: (r) => <Badge tone="neutral">{t("staff.queue.extendNoLabel", { n: r.extendNo ?? 1 })}</Badge>,
    },
    {
      key: "due",
      header: t("staff.queue.colDueChange"),
      render: (r) => (
        <div className="whitespace-nowrap font-mono text-xs">
          <span className="text-t4 line-through">{fmtDateTime(r.previousDueAt)}</span>
          <span className="mx-1 text-t4">&rarr;</span>
          <span className="text-foreground">{fmtDateTime(r.requestedDueAt)}</span>
        </div>
      ),
    },
    {
      key: "condition",
      header: t("staff.queue.colCondition"),
      render: (r) => (
        <select
          className="rounded border border-border bg-transparent px-1.5 py-1 text-xs text-foreground"
          value={extConditionOf(r.extensionKey)}
          onChange={(e) =>
            setExtConditions((c) => ({ ...c, [r.extensionKey]: e.target.value as ConditionType }))
          }
          aria-label={t("staff.queue.colCondition")}
        >
          {EXT_CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {t(`staff.inspection.cond${c}`)}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "act",
      header: "",
      align: "right",
      className: "sticky right-0 bg-card",
      render: (r) =>
        extRejecting === r.extensionKey ? (
          <div className="flex items-center justify-end gap-2">
            <Input
              autoFocus
              value={extReason}
              onChange={(e) => setExtReason(e.target.value)}
              placeholder={t("staff.queue.extReasonPlaceholder")}
              className="h-8 w-44"
            />
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={!extReason.trim() || extBusyKey === r.extensionKey}
              onClick={() => void decideExt(r, "reject")}
            >
              {t("staff.queue.extReject")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setExtRejecting(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={extBusyKey === r.extensionKey}
              onClick={() => {
                setExtReason("");
                setExtRejecting(r.extensionKey);
              }}
            >
              {t("staff.queue.extReject")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={extBusyKey === r.extensionKey}
              onClick={() => void decideExt(r, "approve")}
            >
              {extBusyKey === r.extensionKey ? t("common.loading") : t("staff.queue.extApprove")}
            </Button>
          </div>
        ),
    },
  ];

  async function act(row: StaffQueueRow) {
    const key = rowKey(row);
    setBusyKey(key);
    setResult(null);
    const who = `${row.borrower.firstName} ${row.borrower.lastName}`;

    try {
      if (bucket === "toPrepare") {
        if (row.reservationKey === null) return;
        const loan = await allocate.mutateAsync({ reservationKey: row.reservationKey });
        setResult({
          tone: "ok",
          text: t("staff.queue.donePrepare", {
            item: loan.itemName ?? row.itemName ?? "",
            serial: loan.serialNo ?? "-",
            who,
          }),
        });
      } else if (bucket === "toHandover") {
        if (row.usageKey === null) return;
        await confirmPickup.mutateAsync({ usageKey: row.usageKey });
        setResult({ tone: "ok", text: t("staff.queue.doneHandover", { who }) });
      } else {
        if (row.usageKey === null) return;
        const out = await recordReturn.mutateAsync({ usageKey: row.usageKey });
        // The penalty is applied by this call. The borrower is still at the
        // counter, so it is said out loud here rather than left to discover.
        setResult({
          tone: "ok",
          text: out.latePenalty
            ? t("staff.queue.doneReturnLate", {
                who,
                days: out.latePenalty.overdueDays,
                credit: out.latePenalty.creditDeducted,
              })
            : t("staff.queue.doneReturn", { who }),
        });
      }
    } catch (error) {
      setResult({ tone: "bad", text: getErrorMessage(error) });
    } finally {
      setBusyKey(null);
    }
  }

  async function lose(row: StaffQueueRow) {
    if (row.usageKey === null) return;
    const who = `${row.borrower.firstName} ${row.borrower.lastName}`;
    // Writing a unit off charges the borrower and takes it out of the
    // catalogue, so it asks first.
    if (!window.confirm(t("staff.queue.confirmLost", { item: row.itemName ?? "", who }))) return;

    setBusyKey(rowKey(row));
    setResult(null);
    try {
      await markLost.mutateAsync({ usageKey: row.usageKey });
      setResult({ tone: "ok", text: t("staff.queue.doneLost", { who }) });
    } catch (error) {
      setResult({ tone: "bad", text: getErrorMessage(error) });
    } finally {
      setBusyKey(null);
    }
  }

  const columns: Column<StaffQueueRow>[] = [
    {
      key: "borrower",
      header: t("staff.queue.colBorrower"),
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">
            {r.borrower.firstName} {r.borrower.lastName}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-t4">
            {r.borrower.studentId} · {t("staff.queue.credit", { score: r.borrower.creditScore })}
          </div>
        </div>
      ),
    },
    {
      key: "item",
      header: t("staff.queue.colItem"),
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-foreground">{r.itemName ?? "-"}</div>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-t4">
            <TierDot tier={r.tier} />
            {r.tier ?? t("borrower.catalog.tierUnknown")}
            {r.serialNo ? ` · ${r.serialNo}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "when",
      header: t(bucket === "toPrepare" || bucket === "toHandover" ? "staff.queue.colPickup" : "staff.queue.colDue"),
      render: (r) => (
        <span className="whitespace-nowrap font-mono text-xs text-t2">
          {fmtDateTime(
            (bucket === "toPrepare" || bucket === "toHandover" ? r.pickupAt : r.dueAt) ?? undefined,
          )}
        </span>
      ),
    },
    {
      key: "state",
      header: t("common.status"),
      render: (r) =>
        r.overdueDays > 0 ? (
          <Badge tone="warn">{t("staff.queue.overdueBy", { days: r.overdueDays })}</Badge>
        ) : (
          <Badge tone={stateTone(r)}>{t(`staff.queue.state${r.status ?? "Pending"}`)}</Badge>
        ),
    },
    {
      key: "act",
      header: "",
      align: "right",
      // Pinned to the right edge. The table is wider than a phone, and the
      // action is the reason the row exists - leaving it to scroll off meant a
      // staff member could read the row and not reach the button.
      className: "sticky right-0 bg-card",
      render: (r) => {
        const busy = busyKey === rowKey(r);
        return (
          <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            {bucket === "overdue" && r.lostEligible ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void lose(r)}
              >
                {t("staff.queue.actionLost")}
              </Button>
            ) : null}
            {(bucket === "onLoan" || bucket === "overdue") && r.usageKey !== null ? (
              <ReturnAction usageKey={r.usageKey} busy={busy} onReturn={() => void act(r)} />
            ) : (
              <Button type="button" size="sm" disabled={busy} onClick={() => void act(r)}>
                {busy ? t("common.loading") : t(ACTION_LABEL[bucket])}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  // A row past `toPrepare` already has a UsageLog, so it has somewhere to link
  // to; `toPrepare` rows are still just a reservation and open nothing.
  function openRow(row: StaffQueueRow) {
    if (row.usageKey === null) return;
    navigate(ROUTES.STAFF_HANDOVER.replace(":usageKey", String(row.usageKey)));
  }

  return (
    <div>
      <PageHeader title={t("nav.queue")} subtitle={t("staff.queue.subtitle")} />

      {/* Counts first: what is waiting, before what is on screen. */}
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        {STAFF_QUEUE_BUCKETS.map((b) => (
          <CountTile
            key={b}
            label={t(BUCKET_LABEL[b])}
            value={counts?.[b]}
            active={b === bucket}
            onClick={() => setBucket(b)}
          />
        ))}
        {/* toInspect belongs to the inspection desk's own page and is shown
            here only so the counter knows the backlog exists. Extensions are
            this desk's own second pile, so its tile opens straight into it. */}
        <CountTile label={t("staff.queue.tileToInspect")} value={counts?.toInspect} />
        <CountTile
          label={t("staff.queue.tileExtensions")}
          value={counts?.extensionsToInspect}
          active={view === "extensions"}
          onClick={() => setView("extensions")}
        />
      </div>

      {result ? (
        <div
          role="status"
          className={
            result.tone === "ok"
              ? "mb-3 rounded border border-[var(--s-ok-b)] bg-[var(--s-ok-bg)] px-3 py-2 text-[13px] leading-relaxed text-[var(--s-ok-t)]"
              : "mb-3 rounded border border-[var(--s-warn-b)] bg-[var(--s-warn-bg)] px-3 py-2 text-[13px] leading-relaxed text-[var(--s-warn-t)]"
          }
        >
          {result.text}
        </div>
      ) : null}

      {view === "extensions" ? (
        <DataTable
          columns={extColumns}
          rows={extRows ?? []}
          rowKey={(r) => String(r.extensionKey)}
          pageSize={15}
          headerActions={
            <Button type="button" variant="outline" size="sm" onClick={() => setView("queue")}>
              {t("staff.queue.backToQueue")}
            </Button>
          }
          beforeRows={
            <div className="border-b border-border px-3.5 py-2.5">
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("staff.queue.searchPlaceholder")}
                className="max-w-sm"
              />
            </div>
          }
          emptyTitle={extLoading ? t("common.loading") : t("staff.queue.extEmptyTitle")}
          emptyDescription={extLoading ? undefined : t("staff.queue.extEmptyDesc")}
          rangeLabel={(start, end, total) => t("common.showingRange", { start, end, total })}
        />
      ) : (
      <DataTable
        columns={columns}
        rows={rows ?? []}
        rowKey={rowKey}
        onRowClick={openRow}
        pageSize={15}
        headerActions={
          <Segmented
            options={STAFF_QUEUE_BUCKETS.map((b) => ({
              value: b,
              label: t(BUCKET_LABEL[b]),
              count: counts?.[b],
            }))}
            value={bucket}
            onChange={setBucket}
          />
        }
        beforeRows={
          <div className="border-b border-border px-3.5 py-2.5">
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("staff.queue.searchPlaceholder")}
              className="max-w-sm"
            />
          </div>
        }
        emptyTitle={isLoading ? t("common.loading") : t("staff.queue.emptyTitle")}
        emptyDescription={isLoading ? undefined : t("staff.queue.emptyDesc")}
        rangeLabel={(start, end, total) =>
          t("common.showingRange", { start, end, total })
        }
      />
      )}
    </div>
  );
}

/**
 * A row is keyed by whichever id it actually has.
 *
 * `toPrepare` rows have no usageKey (nothing is set aside yet), and rows past
 * that point have no reservationKey to act on, so neither alone is a key for
 * the whole table.
 */
function rowKey(r: StaffQueueRow): string {
  return r.usageKey !== null ? `u${r.usageKey}` : `r${r.reservationKey ?? 0}`;
}

function stateTone(r: StaffQueueRow): BadgeTone {
  if (r.status === "Lended") return "info";
  if (r.status === "Prepared") return "ok";
  return "neutral";
}

function CountTile({
  label,
  value,
  active = false,
  onClick,
}: {
  label: string;
  value: number | undefined;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = [
    "rounded-lg border bg-card px-3 py-2.5 text-left",
    active ? "border-accent" : "border-border",
    onClick ? "transition-colors hover:bg-muted" : "",
  ].join(" ");

  const body = (
    <>
      <div className="text-xs text-t3">{label}</div>
      <div className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-foreground">
        {value ?? "-"}
      </div>
    </>
  );

  return onClick ? (
    <button type="button" className={className} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * Photograph the item as it comes back, then take it in (FR-RTN-01).
 *
 * The server refuses a return with no "after" photo (RETURN_PHOTO_REQUIRED),
 * so the button waits for one. The photo goes onto the loan, where the
 * inspection screen shows it beside the borrower's pickup photo; without it a
 * damage grade had nothing to be compared against.
 */
function ReturnAction({
  usageKey,
  busy,
  onReturn,
}: {
  usageKey: number;
  busy: boolean;
  onReturn: () => void;
}) {
  const { t } = useTranslation();
  const { data: photos } = useUsagePhotos(usageKey);
  const upload = usePickupImageUpload();
  const [error, setError] = useState<string | null>(null);
  const hasPhoto = (photos?.after.length ?? 0) > 0;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!validateUploadFile(file).ok) {
      setError(t("staff.queue.returnPhotoBad"));
      return;
    }
    setError(null);
    const prepared = prepareBorrowerImage(file);
    try {
      await upload.mutateAsync({ usageKey, stage: "after", image: prepared });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      releaseBorrowerImage(prepared);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="max-w-[160px] text-[11px] text-[var(--s-alert-t)]">{error}</span> : null}
      <label
        className={[
          "inline-flex h-8 cursor-pointer items-center rounded-md border px-2.5 text-xs font-medium",
          hasPhoto
            ? "border-[var(--s-ok-t)] bg-[var(--s-ok-bg)] text-[var(--s-ok-t)]"
            : "border-border bg-card text-t2 hover:text-foreground",
        ].join(" ")}
      >
        <input
          type="file"
          accept={uploadAcceptAttr()}
          capture="environment"
          className="sr-only"
          disabled={upload.isPending}
          onChange={(e) => void onPick(e)}
        />
        {upload.isPending
          ? t("common.loading")
          : hasPhoto
            ? t("staff.queue.returnPhotoDone")
            : t("staff.queue.returnPhoto")}
      </label>
      <Button type="button" size="sm" disabled={busy || !hasPhoto} onClick={onReturn}>
        {busy ? t("common.loading") : t("staff.queue.actionReturn")}
      </Button>
    </div>
  );
}
