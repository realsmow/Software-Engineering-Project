import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shared/page-header";
import { TierDot } from "@/components/shared/tier-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getErrorMessage } from "@/lib/error-messages";
import { fmtDateTime, fmtDate } from "@/features/borrower/format";
import { Segmented } from "@/components/ui/segmented";
import {
  useApprovalCounts,
  useApprovalQueue,
  useDecideApproval,
  useDecideExtension,
  useDecideRetirement,
  useExtensionQueue,
  useRetirementQueue,
  useBorrowerHistory,
} from "./use-approvals";
import type {
  ApprovalQueueRow,
  ConditionType,
  ExtensionReviewRow,
  RetirementRequest,
} from "./approval.types";

export default function SupervisorApprovalsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busyKey, setBusyKey] = useState<number | null>(null);
  const [result, setResult] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  
  const [historyBorrower, setHistoryBorrower] = useState<ApprovalQueueRow["borrower"] | null>(null);

  const { data: counts } = useApprovalCounts();
  const { data: rows, isLoading } = useApprovalQueue(undefined, search);
  const decide = useDecideApproval();

  const [view, setView] = useState<"requests" | "extensions" | "retirements">("requests");
  const { data: extRows, isLoading: extLoading } = useExtensionQueue(search);
  const decideExtension = useDecideExtension();
  const { data: retirementRows, isLoading: retirementLoading } = useRetirementQueue();
  const decideRetirement = useDecideRetirement();
  const [conditions, setConditions] = useState<Record<number, ConditionType>>({});
  const conditionOf = (key: number): ConditionType => conditions[key] ?? "Normal";

  async function decideExt(row: ExtensionReviewRow, decision: "approve" | "reject") {
    const why = reason.trim();
    if (decision === "reject" && !why) return;

    setBusyKey(row.extensionKey);
    setResult(null);
    try {
      await decideExtension.mutateAsync({
        extensionKey: row.extensionKey,
        decision,
        condition: conditionOf(row.extensionKey),
        ...(why ? { note: why } : {}),
      });
      setResult({
        tone: "ok",
        text: t(
          decision === "approve"
            ? "supervisor.approvals.doneExtApprove"
            : "supervisor.approvals.doneExtReject",
          { item: row.itemName ?? "" },
        ),
      });
      setRejecting(null);
      setReason("");
    } catch (error) {
      setResult({ tone: "bad", text: getErrorMessage(error) });
    } finally {
      setBusyKey(null);
    }
  }

  async function decideRet(row: RetirementRequest, decision: "approve" | "reject") {
    const why = reason.trim();
    if (decision === "reject" && !why) return;

    setBusyKey(row.requestKey);
    setResult(null);
    try {
      await decideRetirement.mutateAsync({
        requestKey: row.requestKey,
        decision,
        ...(why ? { note: why } : {}),
      });
      setResult({
        tone: "ok",
        text: t(
          decision === "approve"
            ? "supervisor.approvals.doneRetireApprove"
            : "supervisor.approvals.doneRetireReject",
          { item: row.resourceName ?? "" },
        ),
      });
      setRejecting(null);
      setReason("");
    } catch (error) {
      setResult({ tone: "bad", text: getErrorMessage(error) });
    } finally {
      setBusyKey(null);
    }
  }

  const CONDITIONS: ConditionType[] = ["Normal", "MinorDamage", "MajorDamage", "Broken"];

  const retirementColumns: Column<RetirementRequest>[] = [
    {
      key: "resource",
      header: t("supervisor.approvals.colResource"),
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-foreground">{r.resourceName ?? "-"}</div>
          <div className="mt-0.5 font-mono text-[11px] text-t4">{r.serialNo ?? r.kind}</div>
        </div>
      ),
    },
    {
      key: "reason",
      header: t("supervisor.approvals.colReason"),
      render: (r) => (
        <span className="block max-w-[18rem] truncate text-t2" title={r.reason}>
          {r.reason}
        </span>
      ),
    },
    {
      key: "requestedBy",
      header: t("supervisor.approvals.colRequestedBy"),
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-foreground">{r.requestedBy.name}</div>
          <div className="mt-0.5 font-mono text-[11px] text-t4">{fmtDateTime(r.requestedAt)}</div>
        </div>
      ),
    },
    {
      key: "act",
      header: "",
      align: "right",
      className: "sticky right-0 bg-card",
      render: (r) => {
        const busy = busyKey === r.requestKey;
        if (rejecting === r.requestKey) {
          return (
            <div className="flex items-center justify-end gap-2">
              <Input
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("supervisor.approvals.reasonPlaceholder")}
                className="h-8 w-56"
              />
              <Button
                type="button"
                size="sm"
                disabled={busy || reason.trim() === ""}
                onClick={() => void decideRet(r, "reject")}
              >
                {t("supervisor.approvals.confirmReject")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRejecting(null);
                  setReason("");
                }}
              >
                {t("common.cancel")}
              </Button>
            </div>
          );
        }
        return (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setRejecting(r.requestKey);
                setReason("");
              }}
            >
              {t("supervisor.approvals.reject")}
            </Button>
            <Button type="button" size="sm" disabled={busy} onClick={() => void decideRet(r, "approve")}>
              {busy ? t("common.loading") : t("supervisor.approvals.approve")}
            </Button>
          </div>
        );
      },
    },
  ];

  const extColumns: Column<ExtensionReviewRow>[] = [
    {
      key: "borrower",
      header: t("supervisor.approvals.colBorrower"),
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">
            {r.borrower.firstName} {r.borrower.lastName}
          </div>
          <div className="mono truncate text-xs text-muted-foreground">{r.borrower.studentId}</div>
        </div>
      ),
    },
    {
      key: "item",
      header: t("supervisor.approvals.colItem"),
      render: (r) => (
        <div className="flex min-w-0 items-center gap-1.5">
          {r.tier ? <TierDot tier={r.tier} /> : null}
          <div className="min-w-0">
            <div className="truncate text-foreground">{r.itemName ?? "-"}</div>
            <div className="mono truncate text-xs text-muted-foreground">{r.serialNo ?? "-"}</div>
          </div>
        </div>
      ),
    },
    {
      key: "extendNo",
      header: t("supervisor.approvals.colExtension"),
      render: (r) => (
        <Badge tone="neutral">
          {t("supervisor.approvals.extendNoLabel", { n: r.extendNo ?? 1 })}
        </Badge>
      ),
    },
    {
      key: "due",
      header: t("supervisor.approvals.colDueChange"),
      render: (r) => (
        <div className="mono whitespace-nowrap text-xs">
          <span className="text-muted-foreground line-through">{fmtDateTime(r.previousDueAt)}</span>
          <span className="mx-1 text-muted-foreground">&rarr;</span>
          <span className="text-foreground">{fmtDateTime(r.requestedDueAt)}</span>
        </div>
      ),
    },
    {
      key: "condition",
      header: t("supervisor.approvals.colCondition"),
      render: (r) => (
        <select
          className="rounded border border-border bg-transparent px-1.5 py-1 text-xs text-foreground"
          value={conditionOf(r.extensionKey)}
          onChange={(e) =>
            setConditions((c) => ({ ...c, [r.extensionKey]: e.target.value as ConditionType }))
          }
          aria-label={t("supervisor.approvals.colCondition")}
        >
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {t(`supervisor.approvals.cond${c}`)}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) =>
        rejecting === r.extensionKey ? (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("supervisor.approvals.reasonPlaceholder")}
              className="h-8 w-44"
            />
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={!reason.trim() || busyKey === r.extensionKey}
              onClick={() => decideExt(r, "reject")}
            >
              {t("supervisor.approvals.reject")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setRejecting(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              disabled={busyKey === r.extensionKey}
              onClick={() => decideExt(r, "approve")}
            >
              {t("supervisor.approvals.approve")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setReason("");
                setRejecting(r.extensionKey);
              }}
            >
              {t("supervisor.approvals.reject")}
            </Button>
          </div>
        ),
    },
  ];

  async function approve(row: ApprovalQueueRow) {
    if (
      row.clashesWith.length > 0 &&
      !window.confirm(t("supervisor.approvals.confirmClash", { count: row.clashesWith.length }))
    ) {
      return;
    }

    setBusyKey(row.reservationKey);
    setResult(null);
    try {
      const out = await decide.mutateAsync({
        reservationKey: row.reservationKey,
        decision: "approve",
      });
      setResult({
        tone: "ok",
        text: out.cancelled.length
          ? t("supervisor.approvals.doneApproveCancelled", {
              item: row.itemName ?? "",
              count: out.cancelled.length,
            })
          : t("supervisor.approvals.doneApprove", { item: row.itemName ?? "" }),
      });
    } catch (error) {
      setResult({ tone: "bad", text: getErrorMessage(error) });
    } finally {
      setBusyKey(null);
    }
  }

  async function reject(row: ApprovalQueueRow) {
    const why = reason.trim();
    if (!why) return;

    setBusyKey(row.reservationKey);
    setResult(null);
    try {
      await decide.mutateAsync({
        reservationKey: row.reservationKey,
        decision: "reject",
        reason: why,
      });
      setResult({ tone: "ok", text: t("supervisor.approvals.doneReject", { item: row.itemName ?? "" }) });
      setRejecting(null);
      setReason("");
    } catch (error) {
      setResult({ tone: "bad", text: getErrorMessage(error) });
    } finally {
      setBusyKey(null);
    }
  }

  const columns: Column<ApprovalQueueRow>[] = [
    {
      key: "borrower",
      header: t("supervisor.approvals.colBorrower"),
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">
            {r.borrower.firstName} {r.borrower.lastName}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-t4">
            {r.borrower.studentId} · {r.creditTier} ·{" "}
            {t("staff.queue.credit", { score: r.borrower.creditScore })}
          </div>
        </div>
      ),
    },
    {
      key: "item",
      header: t("supervisor.approvals.colItem"),
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
      key: "window",
      header: t("supervisor.approvals.colWindow"),
      render: (r) => (
        <div className="whitespace-nowrap font-mono text-xs text-t2">
          {fmtDateTime(r.startTime)}
          <div className="text-t4">{t("supervisor.approvals.days", { count: r.requestedDays })}</div>
        </div>
      ),
    },
    {
      key: "flags",
      header: "",
      render: (r) => (
        <div className="flex flex-col gap-1">
          {r.clashesWith.length > 0 ? (
            <Badge tone="warn">
              {t("supervisor.approvals.clashes", { count: r.clashesWith.length })}
            </Badge>
          ) : null}
          {r.reason ? (
            <span className="max-w-[16rem] truncate text-xs text-t3" title={r.reason}>
              {r.reason}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "act",
      header: "",
      align: "right",
      className: "sticky right-0 bg-card",
      render: (r) => {
        const busy = busyKey === r.reservationKey;
        if (rejecting === r.reservationKey) {
          return (
            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
              <Input
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("supervisor.approvals.reasonPlaceholder")}
                className="h-8 w-56"
              />
              <Button
                type="button"
                size="sm"
                disabled={busy || reason.trim() === ""}
                onClick={() => void reject(r)}
              >
                {t("supervisor.approvals.confirmReject")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRejecting(null);
                  setReason("");
                }}
              >
                {t("common.cancel")}
              </Button>
            </div>
          );
        }
        return (
          <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setRejecting(r.reservationKey);
                setReason("");
              }}
            >
              {t("supervisor.approvals.reject")}
            </Button>
            <Button type="button" size="sm" disabled={busy} onClick={() => void approve(r)}>
              {busy ? t("common.loading") : t("supervisor.approvals.approve")}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title={t("nav.approvals")} subtitle={t("supervisor.approvals.subtitle")} />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label={t("supervisor.approvals.tileSupervisor")} value={counts?.supervisor} />
        <Tile label={t("supervisor.approvals.tileStaff")} value={counts?.staff} />
        <Tile label={t("supervisor.approvals.tileOverdue")} value={counts?.overdueToDecide} warn />
        <Tile label={t("supervisor.approvals.tileAuto")} value={counts?.autoApprovedToday} />
        <Tile label={t("supervisor.approvals.tileRetirement")} value={counts?.retirement} />
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

      <div className="mb-3">
        <Segmented<"requests" | "extensions" | "retirements">
          value={view}
          onChange={(v) => {
            setView(v);
            setRejecting(null);
            setResult(null);
          }}
          options={[
            { value: "requests", label: t("supervisor.approvals.viewRequests") },
            { value: "extensions", label: t("supervisor.approvals.viewExtensions") },
            { value: "retirements", label: t("supervisor.approvals.viewRetirements") },
          ]}
        />
      </div>

      {view === "extensions" ? (
        <DataTable
          columns={extColumns}
          rows={extRows ?? []}
          rowKey={(r) => String(r.extensionKey)}
          pageSize={15}
          beforeRows={
            <div className="border-b border-border px-3.5 py-2.5">
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("supervisor.approvals.searchPlaceholder")}
                className="max-w-sm"
              />
            </div>
          }
          emptyTitle={extLoading ? t("common.loading") : t("supervisor.approvals.extEmptyTitle")}
          emptyDescription={extLoading ? undefined : t("supervisor.approvals.extEmptyDesc")}
          rangeLabel={(start, end, total) => t("common.showingRange", { start, end, total })}
        />
      ) : view === "retirements" ? (
        <DataTable
          columns={retirementColumns}
          rows={retirementRows ?? []}
          rowKey={(r) => String(r.requestKey)}
          pageSize={15}
          emptyTitle={retirementLoading ? t("common.loading") : t("supervisor.approvals.retirementEmptyTitle")}
          emptyDescription={retirementLoading ? undefined : t("supervisor.approvals.retirementEmptyDesc")}
          rangeLabel={(start, end, total) => t("common.showingRange", { start, end, total })}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows ?? []}
          rowKey={(r) => String(r.reservationKey)}
          pageSize={15}
          onRowClick={(row) => setHistoryBorrower(row.borrower)}
          beforeRows={
            <div className="border-b border-border px-3.5 py-2.5">
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("supervisor.approvals.searchPlaceholder")}
                className="max-w-sm"
              />
            </div>
          }
          emptyTitle={isLoading ? t("common.loading") : t("supervisor.approvals.emptyTitle")}
          emptyDescription={isLoading ? undefined : t("supervisor.approvals.emptyDesc")}
          rangeLabel={(start, end, total) => t("common.showingRange", { start, end, total })}
        />
      )}

      {historyBorrower && (
        <BorrowerHistoryDialog
          borrower={historyBorrower}
          onClose={() => setHistoryBorrower(null)}
        />
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: number | undefined;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="text-xs text-t3">{label}</div>
      <div
        className={
          warn && (value ?? 0) > 0
            ? "mt-0.5 font-mono text-xl font-semibold tabular-nums text-[var(--s-warn-t)]"
            : "mt-0.5 font-mono text-xl font-semibold tabular-nums text-foreground"
        }
      >
        {value ?? "-"}
      </div>
    </div>
  );
}

// Main Adding
function BorrowerHistoryDialog({
  borrower,
  onClose,
}: {
  borrower: ApprovalQueueRow["borrower"];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: history, isLoading } = useBorrowerHistory(borrower.accountKey);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Borrower History: {borrower.firstName} {borrower.lastName} ({borrower.studentId})
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-t3">{t("common.loading")}</div>
        ) : !history ? (
          <div className="py-8 text-center text-t3">Failed to load history</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              <Tile label="Total Loans" value={history.totalLoans} />
              <Tile label="Late Returns" value={history.lateReturns} warn={history.lateReturns > 0} />
              <Tile label="Damage (B1+)" value={history.damageIncidents} warn={history.damageIncidents > 0} />
              <div className="rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="text-xs text-t3">Last Damage</div>
                <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-foreground">
                  {history.lastDamageDate ? fmtDate(history.lastDamageDate) : "-"}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <h4 className="mb-2 text-sm font-medium">Past Loans</h4>
              <div className="max-h-[300px] overflow-y-auto rounded-md border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-muted px-3 py-2 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 font-medium">Borrowed</th>
                      <th className="px-3 py-2 font-medium">Returned</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.items.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-t3">
                          No past loans found.
                        </td>
                      </tr>
                    ) : (
                      history.items.map((item) => (
                        <tr key={item.usageKey} className="border-t border-border">
                          <td className="px-3 py-2">
                            <div className="truncate text-foreground">{item.itemName}</div>
                            <div className="font-mono text-[11px] text-t4">{item.serialNo ?? "-"}</div>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{fmtDateTime(item.checkoutAt)}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {item.returnedAt ? fmtDateTime(item.returnedAt) : "-"}
                          </td>
                          <td className="px-3 py-2">
                            {item.overdueDays > 0 ? (
                              <Badge tone="warn">Late ({item.overdueDays}d)</Badge>
                            ) : (
                              <Badge tone="neutral">{item.status}</Badge>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}