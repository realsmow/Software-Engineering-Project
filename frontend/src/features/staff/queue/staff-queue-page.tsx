import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shared/page-header";
import { TierDot } from "@/components/shared/tier-badge";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { getErrorMessage } from "@/lib/error-messages";
import { fmtDateTime } from "@/features/borrower/format";
import {
  useAllocate,
  useConfirmPickup,
  useMarkLost,
  useRecordReturn,
  useStaffQueue,
  useStaffQueueCounts,
} from "./use-staff-queue";
import { STAFF_QUEUE_BUCKETS, type StaffQueueBucket, type StaffQueueRow } from "./queue.types";

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
      render: (r) => {
        const busy = busyKey === rowKey(r);
        return (
          <div className="flex justify-end gap-2">
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
            <Button type="button" size="sm" disabled={busy} onClick={() => void act(r)}>
              {busy ? t("common.loading") : t(ACTION_LABEL[bucket])}
            </Button>
          </div>
        );
      },
    },
  ];

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
        {/* Not buckets of this table - they belong to the inspection desk, and
            are shown so the counter knows the backlog exists. */}
        <CountTile label={t("staff.queue.tileToInspect")} value={counts?.toInspect} />
        <CountTile
          label={t("staff.queue.tileExtensions")}
          value={counts?.extensionsToInspect}
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

      <DataTable
        columns={columns}
        rows={rows ?? []}
        rowKey={rowKey}
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
