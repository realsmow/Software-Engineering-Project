import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/shared/page-header";
import { TierDot } from "@/components/shared/tier-badge";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ROUTES, UPLOAD } from "@/constants";
import { uploadAcceptAttr } from "@/lib/upload-validation";
import { takePhotos } from "@/lib/photo-picks";
import {
  useDetachUsagePhoto,
  usePickupImageUpload,
  useUsagePhotos,
} from "@/features/borrower/pickup/use-pickup-image-upload";
import { UsagePhotoGallery } from "@/components/shared/usage-photo-gallery";
import { PhotoCount } from "@/components/shared/photo-count";
import {
  prepareBorrowerImage,
  releaseBorrowerImage,
} from "@/features/borrower/uploads/prepared-image";
import { getErrorMessage } from "@/lib/error-messages";
import { fmtDateTime } from "@/features/borrower/format";
import type { ExtensionReviewRow } from "@/features/supervisor/approvals/approval.types";
import { useUploadImage } from "@/features/staff/inventory/use-item-image";
import { ImageThumb } from "@/components/shared/image-thumb";
import {
  useAllocate,
  useAllocateCart,
  useConfirmPickup,
  useConfirmPickupCart,
  useCopyGroupPhotos,
  useMarkLost,
  usePrepareOptions,
  useRecordReturn,
  useRecordReturnCart,
  useRemindSupervisor,
  useWaitingOnSupervisor,
  useStaffDecideExtension,
  useStaffExtensionQueue,
  useStaffInspectExtension,
  useStaffQueue,
  useStaffQueueCounts,
} from "./use-staff-queue";
import {
  STAFF_QUEUE_BUCKETS,
  type ConditionType,
  type StaffQueueBucket,
  type StaffQueueRow,
} from "./queue.types";
import { UnitSchedule } from "./unit-schedule";

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
  const [view, setView] = useState<"queue" | "extensions" | "supervisor">("queue");
  const [bucket, setBucket] = useState<StaffQueueBucket>("toPrepare");
  const [search, setSearch] = useState("");

  const { data: counts } = useStaffQueueCounts();
  const { data: rows, isLoading } = useStaffQueue(bucket, search);
  // Demo feedback: one submit for several units is one row, acted on together.
  // "Split" shows its units separately again.
  const [split, setSplit] = useState<Set<string>>(() => new Set());
  const entries = useMemo(() => groupQueueRows(rows ?? [], split), [rows, split]);
  const copyPhotos = useCopyGroupPhotos();
  const { data: supervisorRows, isLoading: supervisorLoading } = useWaitingOnSupervisor(
    view === "supervisor" ? search : "",
  );
  const remind = useRemindSupervisor();
  const [remindingKey, setRemindingKey] = useState<number | null>(null);

  function remindButton(reservationKey: number) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={remindingKey === reservationKey}
        onClick={() => void remindSupervisor(reservationKey)}
      >
        {remindingKey === reservationKey ? t("common.loading") : t("staff.queue.remindSupervisor")}
      </Button>
    );
  }

  async function remindSupervisor(reservationKey: number) {
    setRemindingKey(reservationKey);
    setResult(null);
    try {
      const out = await remind.mutateAsync(reservationKey);
      setResult({ tone: "ok", text: t("staff.queue.reminded", { count: out.notified }) });
    } catch (error) {
      setResult({ tone: "bad", text: getErrorMessage(error) });
    } finally {
      setRemindingKey(null);
    }
  }

  // One row at a time: the button that was pressed is the one that spins, and
  // the rest of the queue stays usable.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const allocate = useAllocate();
  const confirmPickup = useConfirmPickup();
  const recordReturn = useRecordReturn();
  const allocateCart = useAllocateCart();
  const confirmPickupCart = useConfirmPickupCart();
  const recordReturnCart = useRecordReturnCart();
  const markLost = useMarkLost();

  const { data: extRows, isLoading: extLoading } = useStaffExtensionQueue(
    view === "extensions" ? search : "",
  );
  const decideExtension = useStaffDecideExtension();
  const inspectExtension = useStaffInspectExtension();
  const [extBusyKey, setExtBusyKey] = useState<number | null>(null);
  const [extRejecting, setExtRejecting] = useState<number | null>(null);
  const [extReason, setExtReason] = useState("");
  const [extConditions, setExtConditions] = useState<Record<number, ConditionType>>({});
  const extConditionOf = (key: number): ConditionType => extConditions[key] ?? "Normal";
  // #205: photos and a note taken at the condition check, per extension row,
  // sent with the check so the supervisor sees the unit they are deciding on.
  const uploadImage = useUploadImage();
  const [extPhotos, setExtPhotos] = useState<
    Record<number, { imageUrl: string; previewUrl: string }[]>
  >({});
  const [extNotes, setExtNotes] = useState<Record<number, string>>({});
  const [extUploading, setExtUploading] = useState<number | null>(null);

  async function addExtPhotos(row: ExtensionReviewRow, files: File[]) {
    const pick = takePhotos(files, (extPhotos[row.extensionKey] ?? []).length);
    if (pick.problem !== null) {
      setResult({
        tone: "bad",
        text:
          pick.problem === "TOO_MANY"
            ? t("common.photoCapReached", { max: UPLOAD.MAX_PHOTOS_PER_STAGE })
            : t("staff.queue.returnPhotoBad"),
      });
    } else {
      setResult(null);
    }
    if (pick.accepted.length === 0) return;
    setExtUploading(row.extensionKey);
    try {
      for (const file of pick.accepted) {
        const ticket = await uploadImage.mutateAsync({ file, purpose: "inspection" });
        const photo = { imageUrl: ticket.imageUrl, previewUrl: URL.createObjectURL(file) };
        setExtPhotos((all) => ({
          ...all,
          [row.extensionKey]: [...(all[row.extensionKey] ?? []), photo],
        }));
      }
    } catch (error) {
      setResult({ tone: "bad", text: getErrorMessage(error) });
    } finally {
      setExtUploading(null);
    }
  }

  function removeExtPhoto(extensionKey: number, imageUrl: string) {
    setExtPhotos((all) => {
      const list = all[extensionKey] ?? [];
      const gone = list.find((p) => p.imageUrl === imageUrl);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return { ...all, [extensionKey]: list.filter((p) => p.imageUrl !== imageUrl) };
    });
  }

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

  // #156: a supervisor-routed extension gets its condition check here, and
  // the supervisor decides it afterwards with this record on screen.
  async function checkExt(row: ExtensionReviewRow) {
    setExtBusyKey(row.extensionKey);
    setResult(null);
    try {
      const photos = extPhotos[row.extensionKey] ?? [];
      const note = (extNotes[row.extensionKey] ?? "").trim();
      await inspectExtension.mutateAsync({
        extensionKey: row.extensionKey,
        condition: extConditionOf(row.extensionKey),
        ...(note ? { note } : {}),
        ...(photos.length > 0 ? { imageUrls: photos.map((p) => p.imageUrl) } : {}),
      });
      for (const p of photos) URL.revokeObjectURL(p.previewUrl);
      setExtPhotos((all) => ({ ...all, [row.extensionKey]: [] }));
      setExtNotes((all) => ({ ...all, [row.extensionKey]: "" }));
      setResult({ tone: "ok", text: t("staff.queue.doneExtCheck", { item: row.itemName ?? "" }) });
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
            {r.serialNo && r.tier !== "T0" ? ` · ${r.serialNo}` : ""}
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
        <div className="flex min-w-[10rem] flex-col gap-1.5">
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
          {r.route === "supervisor" ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {(extPhotos[r.extensionKey] ?? []).map((p) => (
                  <div key={p.imageUrl} className="relative">
                    <a href={p.previewUrl} target="_blank" rel="noreferrer" aria-label={t("common.viewPhoto")}>
                      <ImageThumb src={p.previewUrl} size={32} />
                    </a>
                    <button
                      type="button"
                      aria-label={t("borrower.pickup.removePhoto")}
                      onClick={() => removeExtPhoto(r.extensionKey, p.imageUrl)}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card text-t3 shadow-sm"
                    >
                      <X size={10} strokeWidth={2.6} />
                    </button>
                  </div>
                ))}
                <label className="cursor-pointer whitespace-nowrap rounded border border-dashed border-border px-1.5 py-1 text-[11px] text-t3 hover:text-foreground">
                  {extUploading === r.extensionKey ? t("common.loading") : t("staff.queue.addPhoto")}
                  <input
                    type="file"
                    accept={uploadAcceptAttr()}
                    multiple
                    className="sr-only"
                    aria-label={t("staff.queue.extCheckPhoto")}
                    disabled={
                      extUploading === r.extensionKey ||
                      (extPhotos[r.extensionKey] ?? []).length >= UPLOAD.MAX_PHOTOS_PER_STAGE
                    }
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      void addExtPhotos(r, files);
                    }}
                  />
                </label>
                {(extPhotos[r.extensionKey] ?? []).length > 0 ? (
                  <PhotoCount count={(extPhotos[r.extensionKey] ?? []).length} />
                ) : null}
              </div>
              <Input
                value={extNotes[r.extensionKey] ?? ""}
                onChange={(e) => setExtNotes((n) => ({ ...n, [r.extensionKey]: e.target.value }))}
                placeholder={t("staff.queue.extCheckNote")}
                aria-label={t("staff.queue.extCheckNote")}
                className="h-7 text-xs"
              />
            </>
          ) : null}
        </div>
      ),
    },
    {
      key: "act",
      header: "",
      align: "right",
      className: "sticky right-0 bg-card",
      render: (r) =>
        r.route === "supervisor" ? (
          <div className="flex items-center justify-end gap-2">
            <Badge tone="neutral">{t("staff.queue.extForSupervisor")}</Badge>
            <Button
              type="button"
              size="sm"
              disabled={extBusyKey === r.extensionKey || extUploading === r.extensionKey}
              onClick={() => void checkExt(r)}
            >
              {extBusyKey === r.extensionKey ? t("common.loading") : t("staff.queue.extRecordCheck")}
            </Button>
          </div>
        ) : extRejecting === r.extensionKey ? (
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

  async function act(row: StaffQueueRow, resourceKey?: number) {
    const key = rowKey(row);
    setBusyKey(key);
    setResult(null);
    const who = `${row.borrower.firstName} ${row.borrower.lastName}`;

    try {
      if (bucket === "toPrepare") {
        if (row.reservationKey === null) return;
        const loan = await allocate.mutateAsync({
          reservationKey: row.reservationKey,
          ...(resourceKey === undefined ? {} : { resourceKey }),
        });
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
        const early = isBeforePickup(row);
        // The borrower is at the counter ahead of time; handing over now
        // moves their return date earlier, so they hear that first.
        if (early && !window.confirm(t("staff.queue.confirmEarly", { who }))) return;
        const loan = await confirmPickup.mutateAsync({ usageKey: row.usageKey, early });
        setResult({
          tone: "ok",
          text: early
            ? t("staff.queue.doneHandoverEarly", { who, due: fmtDateTime(loan.dueAt) })
            : t("staff.queue.doneHandover", { who }),
        });
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

  /** Runs the bucket's action on every unit of a group, one after another. */
  async function actGroup(entry: QueueEntry) {
    const members = entry.members;
    const who = `${entry.borrower.firstName} ${entry.borrower.lastName}`;
    const early = bucket === "toHandover" && isBeforePickup(entry);
    if (early && !window.confirm(t("staff.queue.confirmEarly", { who }))) return;
    setBusyKey(rowKey(entry));
    setResult(null);
    let lateCredit = 0;
    const usageKeys = members.flatMap((m) => (m.usageKey === null ? [] : [m.usageKey]));
    try {
      // One return photo covers the group: copy the first unit's onto the rest.
      // #237: never the handover photo - that is each unit's own, taken by the
      // borrower on their pickup page, and a staff copy would not count.
      if ((bucket === "onLoan" || bucket === "overdue") && members[0].usageKey !== null) {
        await copyPhotos.mutateAsync({
          from: members[0].usageKey,
          to: members.slice(1).flatMap((m) => (m.usageKey === null ? [] : [m.usageKey])),
          stage: "after",
        });
      }
      // #236 step 2 (D-01): one call for the whole cart - every unit or none.
      if (bucket === "toPrepare") {
        await allocateCart.mutateAsync({
          lines: members.flatMap((m) => (m.reservationKey === null ? [] : [{ reservationKey: m.reservationKey }])),
        });
      } else if (bucket === "toHandover") {
        await confirmPickupCart.mutateAsync({ usageKeys, early });
      } else {
        const out = await recordReturnCart.mutateAsync({ usageKeys });
        lateCredit = out.reduce((sum, r) => sum + (r.latePenalty?.creditDeducted ?? 0), 0);
      }
      setResult({
        tone: "ok",
        text:
          t("staff.queue.doneGroup", { count: members.length, item: entry.itemName ?? "", who }) +
          (lateCredit > 0 ? ` ${t("staff.queue.doneGroupLate", { credit: lateCredit })}` : ""),
      });
    } catch (error) {
      // One transaction, so a refused cart changed nothing; the queue reloads.
      setResult({ tone: "bad", text: `${t("staff.queue.groupNothingDone")} ${getErrorMessage(error)}` });
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

  const columns: Column<QueueEntry>[] = [
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
      render: (r) => {
        // T0 goes out by count; its serials mean nothing at the counter.
        const serials = r.members.flatMap((m) => (m.serialNo && m.tier !== "T0" ? [m.serialNo] : []));
        // A cart can mix items: one line per item name with its count.
        const counts = new Map<string, number>();
        for (const m of r.members) counts.set(m.itemName ?? "-", (counts.get(m.itemName ?? "-") ?? 0) + 1);
        return (
          <div className="min-w-0">
            {[...counts].map(([name, n]) => (
              <div key={name} className="truncate text-foreground">
                {name}
                {n > 1 || r.members.length > 1 ? (
                  <span className="ml-1.5 font-semibold text-accent">×{n}</span>
                ) : null}
              </div>
            ))}
            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-t4">
              <TierDot tier={r.tier} />
              {r.tier ?? t("borrower.catalog.tierUnknown")}
              {serials.length ? ` · ${serials.join(", ")}` : ""}
            </div>
          </div>
        );
      },
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
        if (r.members.length > 1) {
          const groupId = groupKey(r);
          const allLabel = t(
            bucket === "toPrepare"
              ? "staff.queue.prepareAll"
              : bucket === "toHandover"
                ? "staff.queue.handoverAll"
                : "staff.queue.returnAll",
            { count: r.members.length },
          );
          return (
            <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSplit((prev) => new Set(prev).add(groupId))}
              >
                {t("staff.queue.split")}
              </Button>
              {bucket === "toHandover" && r.usageKey !== null ? (
                <HandoverAction
                  usageKey={r.usageKey}
                  borrowerKey={r.borrower.accountKey}
                  busy={busy}
                  label={allLabel}
                  onAct={() => void actGroup(r)}
                />
              ) : bucket !== "toPrepare" && r.usageKey !== null ? (
                <PhotoGatedAction
                  usageKey={r.usageKey}
                  stage="after"
                  busy={busy}
                  label={allLabel}
                  onAct={() => void actGroup(r)}
                />
              ) : (
                <Button type="button" size="sm" disabled={busy} onClick={() => void actGroup(r)}>
                  {busy ? t("common.loading") : allLabel}
                </Button>
              )}
            </div>
          );
        }
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
              <PhotoGatedAction
                usageKey={r.usageKey}
                stage="after"
                busy={busy}
                label={t("staff.queue.actionReturn")}
                onAct={() => void act(r)}
              />
            ) : bucket === "toHandover" && r.usageKey !== null ? (
              <HandoverAction
                usageKey={r.usageKey}
                borrowerKey={r.borrower.accountKey}
                busy={busy}
                label={t(isBeforePickup(r) ? "staff.queue.actionHandoverEarly" : ACTION_LABEL[bucket])}
                onAct={() => void act(r)}
              />
            ) : bucket === "toPrepare" && r.tier !== "T3" && r.tier !== "T0" ? (
              <PrepareAction row={r} busy={busy} onPrepare={(key) => void act(r, key)} />
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
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {STAFF_QUEUE_BUCKETS.map((b) => (
          <CountTile
            key={b}
            label={t(BUCKET_LABEL[b])}
            value={counts?.[b]}
            active={view === "queue" && b === bucket}
            // #158: the table follows `view`, so a bucket tile has to leave
            // the extensions pile as well as pick the bucket.
            onClick={() => {
              setBucket(b);
              setView("queue");
            }}
          />
        ))}
        {/* toInspect belongs to the inspection desk's own page, so its tile
            goes there. Extensions are this desk's own second pile, so its
            tile opens straight into it. */}
        <CountTile
          label={t("staff.queue.tileToInspect")}
          value={counts?.toInspect}
          onClick={() => navigate(ROUTES.STAFF_INSPECTION)}
        />
        <CountTile
          label={t("staff.queue.tileExtensions")}
          value={counts?.extensionsToInspect}
          active={view === "extensions"}
          onClick={() => setView("extensions")}
        />
        {/* Staff cannot decide these; they can see them and nudge a supervisor. */}
        <CountTile
          label={t("staff.queue.tileWaitingSupervisor")}
          value={supervisorRows?.length}
          active={view === "supervisor"}
          onClick={() => setView("supervisor")}
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

      {view === "supervisor" ? (
        <DataTable
          columns={[
            {
              key: "borrower",
              header: t("staff.queue.colBorrower"),
              render: (r) => (
                <>
                  <span className="font-medium text-foreground">
                    {r.borrower.firstName} {r.borrower.lastName}
                  </span>
                  {/* On a phone the last column sits past the edge, so the button comes here. */}
                  <div className="mt-1.5 sm:hidden">{remindButton(r.reservationKey)}</div>
                </>
              ),
            },
            {
              key: "item",
              header: t("staff.queue.colItem"),
              render: (r) => (
                <span className="inline-flex items-center gap-1.5">
                  <TierDot tier={r.tier} />
                  {r.itemName ?? "-"}
                </span>
              ),
            },
            {
              key: "when",
              header: t("staff.queue.colPickup"),
              render: (r) => (
                <span className="whitespace-nowrap font-mono text-xs text-t2">{fmtDateTime(r.startTime)}</span>
              ),
            },
            {
              key: "act",
              header: "",
              align: "right",
              className: "max-sm:hidden",
              render: (r) => remindButton(r.reservationKey),
            },
          ]}
          rows={supervisorRows ?? []}
          rowKey={(r) => String(r.reservationKey)}
          pageSize={15}
          beforeRows={
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("staff.queue.searchPlaceholder")}
                className="max-w-sm"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setView("queue")}>
                {t("staff.queue.backToQueue")}
              </Button>
            </div>
          }
          emptyTitle={supervisorLoading ? t("common.loading") : t("staff.queue.supervisorEmpty")}
          rangeLabel={(start, end, total) => t("common.showingRange", { start, end, total })}
        />
      ) : view === "extensions" ? (
        <DataTable
          columns={extColumns}
          rows={extRows ?? []}
          rowKey={(r) => String(r.extensionKey)}
          pageSize={15}
          // Not `headerActions`: DataTable only renders those with a title.
          beforeRows={
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("staff.queue.searchPlaceholder")}
                className="max-w-sm"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setView("queue")}>
                {t("staff.queue.backToQueue")}
              </Button>
            </div>
          }
          emptyTitle={extLoading ? t("common.loading") : t("staff.queue.extEmptyTitle")}
          emptyDescription={extLoading ? undefined : t("staff.queue.extEmptyDesc")}
          rangeLabel={(start, end, total) => t("common.showingRange", { start, end, total })}
        />
      ) : (
      <DataTable
        columns={columns}
        rows={entries}
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
/** A queue row standing for one or more units from the same submit. */
type QueueEntry = StaffQueueRow & { members: StaffQueueRow[] };

// One cart is one borrow, whatever mix of items it holds. Rows from before
// carts fall back to borrower + type + window (#209: type, not display name).
function groupKey(r: StaffQueueRow): string {
  if (r.cartKey != null) return `cart:${r.cartKey}|${r.status}`;
  // A display name is not unique (#209): without a type id, no grouping.
  if (r.itemKey == null) return `row:${rowKey(r)}`;
  return [r.borrower.accountKey, r.itemKey, r.pickupAt, r.dueAt, r.status].join("|");
}

function groupQueueRows(rows: StaffQueueRow[], split: Set<string>): QueueEntry[] {
  const groups = new Map<string, StaffQueueRow[]>();
  for (const row of rows) {
    const key = groupKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].flatMap(([key, members]) =>
    split.has(key) || members.length === 1
      ? members.map((m) => ({ ...m, members: [m] }))
      : [{ ...members[0], members }],
  );
}

function rowKey(r: StaffQueueRow | QueueEntry): string {
  if ("members" in r && r.members.length > 1) return `g${groupKey(r)}`;
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
/**
 * A counter action that needs a photo first: the handover ("before") and the
 * return ("after"). The server refuses both without one (FR-PKP-03, FR-RTN-01).
 */
function PhotoGatedAction({
  usageKey,
  stage,
  busy,
  label,
  onAct,
}: {
  usageKey: number;
  stage: "before" | "after";
  busy: boolean;
  label: string;
  onAct: () => void;
}) {
  const { t } = useTranslation();
  const { data: photos } = useUsagePhotos(usageKey);
  const upload = usePickupImageUpload();
  const detach = useDetachUsagePhoto();
  const [error, setError] = useState<string | null>(null);
  const hasPhoto = (photos?.[stage].length ?? 0) > 0;

  // Removing lets staff retake a bad shot.
  async function remove(imageKey: number) {
    setError(null);
    try {
      await detach.mutateAsync({ usageKey, imageKey });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  // #238: several photos per pick, uploaded one after another, up to the cap.
  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const pick = takePhotos(Array.from(e.target.files ?? []), photos?.[stage].length ?? 0);
    e.target.value = "";
    setError(
      pick.problem === null
        ? null
        : pick.problem === "TOO_MANY"
          ? t("common.photoCapReached", { max: UPLOAD.MAX_PHOTOS_PER_STAGE })
          : t("staff.queue.returnPhotoBad")
    );
    for (const file of pick.accepted) {
      const prepared = prepareBorrowerImage(file);
      try {
        await upload.mutateAsync({ usageKey, stage, image: prepared });
      } catch (err) {
        setError(getErrorMessage(err));
        return;
      } finally {
        releaseBorrowerImage(prepared);
      }
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {hasPhoto ? <PhotoCount count={photos?.[stage].length ?? 0} /> : null}
      {photos ? (
        <UsagePhotoGallery
          photos={photos}
          stages={[stage]}
          size={36}
          showLabels={false}
          disabled={upload.isPending}
          pendingImageKey={detach.isPending ? detach.variables?.imageKey : undefined}
          onRemove={(imageKey) => void remove(imageKey)}
        />
      ) : null}
      <div className="flex items-center gap-2">
      {error ? <span className="max-w-[160px] text-[11px] text-[var(--s-alert-t)]">{error}</span> : null}
      <label
        className={[
          "inline-flex h-8 cursor-pointer items-center whitespace-nowrap rounded-md border px-2.5 text-xs font-medium",
          hasPhoto
            ? "border-[var(--s-ok-t)] bg-[var(--s-ok-bg)] text-[var(--s-ok-t)]"
            : "border-border bg-card text-t2 hover:text-foreground",
        ].join(" ")}
      >
        <input
          type="file"
          accept={uploadAcceptAttr()}
          multiple
          className="sr-only"
          // #238: closed at the cap; the count beside it says why.
          disabled={upload.isPending || (photos?.[stage].length ?? 0) >= UPLOAD.MAX_PHOTOS_PER_STAGE}
          onChange={(e) => void onPick(e)}
        />
        {upload.isPending
          ? t("common.loading")
          : hasPhoto
            ? t("staff.queue.addPhoto")
            : t(stage === "before" ? "staff.queue.handoverPhoto" : "staff.queue.returnPhoto")}
      </label>
      <Button type="button" size="sm" disabled={busy || !hasPhoto} onClick={onAct}>
        {busy ? t("common.loading") : label}
      </Button>
      </div>
    </div>
  );
}

/**
 * #237 (team decision D-05, FR-PKP-02/03): the handover photo is the
 * borrower's own record of the condition they accept, taken on their pickup
 * page; staff cannot take it for them. The button waits for that photo and
 * shows it, read-only, for the check at the counter. For a cart, the first
 * unit's photo is shown; the server checks every unit.
 */
function HandoverAction({
  usageKey,
  borrowerKey,
  busy,
  label,
  onAct,
}: {
  usageKey: number;
  borrowerKey: number;
  busy: boolean;
  label: string;
  onAct: () => void;
}) {
  const { t } = useTranslation();
  const { data: photos } = useUsagePhotos(usageKey);
  const theirs = (photos?.before ?? []).filter((p) => p.submittedBy === borrowerKey);

  return (
    <div className="flex flex-col items-end gap-1.5">
      {photos && theirs.length > 0 ? (
        <UsagePhotoGallery
          photos={{ ...photos, before: theirs }}
          stages={["before"]}
          size={36}
          showLabels={false}
          disabled
        />
      ) : (
        <span className="max-w-[220px] text-right text-[11px] leading-snug text-t3">
          {t("staff.queue.waitBorrowerPhoto")}
        </span>
      )}
      <Button type="button" size="sm" disabled={busy || theirs.length === 0} onClick={onAct}>
        {busy ? t("common.loading") : label}
      </Button>
    </div>
  );
}

/**
 * Prepare with a chosen unit (demo feedback): staff, not the borrower, decide
 * which serial goes out. The booked unit is preselected.
 */
function PrepareAction({
  row,
  busy,
  onPrepare,
}: {
  row: StaffQueueRow;
  busy: boolean;
  onPrepare: (resourceKey: number | undefined) => void;
}) {
  const { t } = useTranslation();
  const { data: options } = usePrepareOptions(row.reservationKey);
  const [picked, setPicked] = useState<number | null>(null);
  // Only units on the shelf are listed; the booked one is preselected when it is there.
  const chosen = picked ?? options?.find((o) => o.reserved)?.resourceKey ?? options?.[0]?.resourceKey ?? null;
  // #235: closed until asked for, so the queue stays one line per request.
  const [showSchedule, setShowSchedule] = useState(false);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {options && options.length > 0 ? (
          <select
            aria-label={t("staff.queue.pickUnit")}
            value={chosen ?? ""}
            onChange={(e) => setPicked(Number(e.target.value))}
            className="h-8 rounded border border-border bg-card px-1.5 font-mono text-xs text-foreground"
          >
            {options.map((o) => (
              <option key={o.resourceKey} value={o.resourceKey}>
                {o.serialNo}
              </option>
            ))}
          </select>
        ) : options ? (
          <span className="text-xs text-[var(--s-alert-t)]">{t("staff.queue.noFreeUnit")}</span>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={busy || options?.length === 0}
          onClick={() => onPrepare(chosen ?? undefined)}
        >
          {busy ? t("common.loading") : t("staff.queue.actionPrepare")}
        </Button>
        {row.itemKey != null ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={showSchedule}
            onClick={() => setShowSchedule((open) => !open)}
          >
            {showSchedule ? t("staff.queue.hideUnitSchedule") : t("staff.queue.showUnitSchedule")}
          </Button>
        ) : null}
      </div>
      {showSchedule && row.itemKey != null ? (
        <UnitSchedule
          itemKey={row.itemKey}
          window={row.pickupAt && row.dueAt ? { start: row.pickupAt, end: row.dueAt } : null}
          exclude={row.reservationKey}
          options={options}
        />
      ) : null}
    </div>
  );
}

/** Before the booked pickup time. The server decides how early is too early. */
function isBeforePickup(row: StaffQueueRow): boolean {
  return row.pickupAt !== null && new Date(row.pickupAt).getTime() > Date.now();
}
