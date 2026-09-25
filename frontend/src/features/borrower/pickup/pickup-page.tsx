import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { fmtDayMonth, fmtDayNum } from "@/lib/datetime";
import { useNavigate } from "react-router-dom";
import { Camera, Check, Package, TriangleAlert, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ImageThumb } from "@/components/shared/image-thumb";
import { BUSINESS, ROUTES, UPLOAD } from "@/constants";
import { getErrorMessage } from "@/lib/error-messages";
import { cn } from "@/lib/utils";
import { uploadAcceptAttr, validateUploadFile } from "@/lib/upload-validation";
import type { MyRequest } from "../mock-data";
import { useMyRequests } from "../loans/use-my-requests";
import {
  prepareBorrowerImage,
  releaseBorrowerImage,
  releaseBorrowerImages,
  type PreparedBorrowerImage,
} from "../uploads/prepared-image";
import {
  useDetachUsagePhoto,
  useFinalizePickup,
  usePickupImageUpload,
  useUsagePhotos,
  type UsagePhotoSet,
} from "./use-pickup-image-upload";

/**
 * Pick up equipment - the counter step between "staff have it ready" and
 * "the loan has started".
 *
 * One request is one unit, so this page has no quantity stepper: collecting
 * two of three items means ticking two of the three rows waiting here. What is
 * left unticked simply stays `ready` and shows up again next visit, which is
 * the same outcome the old per-line "collected 2 of 3" counter produced with
 * far more state to get wrong.
 *
 * Fixed facilities (T3) are never collected - they are used in place - so only
 * equipment appears here.
 */
export default function PickupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { requests } = useMyRequests();
  const uploadPickupImage = usePickupImageUpload();
  const finalizePickup = useFinalizePickup();

  const rows = requests.filter((r) => r.kind === "equipment" && r.status === "ready");

  /** Rows the borrower has un-ticked. Absent means selected - everything waiting is taken by default. */
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  /** Validated File + preview and upload state per request id. */
  const [shots, setShots] = useState<Record<string, PreparedBorrowerImage>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  useEffect(() => {
    return () => releaseBorrowerImages(Object.values(shotsRef.current));
  }, []);

  const selected = rows.filter((r) => !dropped.has(r.id));
  const missingShots = selected.filter((r) => !shots[r.id]);
  const missingUsage = selected.some((r) => r.usageKey == null);
  const canConfirm =
    selected.length > 0 &&
    missingShots.length === 0 &&
    !missingUsage &&
    !uploadPickupImage.isPending &&
    !finalizePickup.isPending;

  function toggle(id: string) {
    setDropped((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function replaceShot(id: string, image: PreparedBorrowerImage) {
    releaseBorrowerImage(shotsRef.current[id]);
    const next = { ...shotsRef.current, [id]: image };
    shotsRef.current = next;
    setShots(next);
    setUploadError(null);
  }

  function patchShot(id: string, changes: Partial<PreparedBorrowerImage>) {
    const current = shotsRef.current[id];
    if (!current) return;
    const next = { ...shotsRef.current, [id]: { ...current, ...changes } };
    shotsRef.current = next;
    setShots(next);
  }

  async function confirm() {
    if (!canConfirm) return;
    setUploadError(null);

    for (const row of selected) {
      const usageKey = row.usageKey;
      const image = shotsRef.current[row.id];
      if (usageKey == null || !image) return;
      if (image.status === "uploaded") continue;

      patchShot(row.id, { status: "uploading", error: undefined });
      try {
        const uploaded = await uploadPickupImage.mutateAsync({ usageKey, image });
        patchShot(row.id, uploaded.image);
      } catch (error) {
        const message = getErrorMessage(error);
        patchShot(row.id, { status: "error", error: message });
        setUploadError(message);
        return;
      }
    }

    try {
      await finalizePickup.mutateAsync(
        selected.flatMap((row) => (row.usageKey == null ? [] : [row.usageKey])),
      );
      navigate(ROUTES.MY_LOANS);
    } catch (error) {
      setUploadError(getErrorMessage(error));
    }
  }

  if (rows.length === 0) {
    return (
      <div>
        <PageHeader title={t("nav.pickup")} subtitle={t("borrower.pickup.subtitle")} />
        <EmptyState onGo={() => navigate(ROUTES.MY_LOANS)} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t("nav.pickup")} subtitle={t("borrower.pickup.subtitle")} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_312px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title={t("borrower.pickup.pick")}>
            <p className="px-3.5 pb-1 pt-2.5 text-xs leading-relaxed text-t3">
              {t("borrower.pickup.pickHelp")}
            </p>

            <div className="flex flex-col gap-2 px-3.5 pb-3.5 pt-1.5">
              {rows.map((row) => (
                <PickRow
                  key={row.id}
                  row={row}
                  selected={!dropped.has(row.id)}
                  photographed={Boolean(shots[row.id])}
                  onToggle={() => toggle(row.id)}
                />
              ))}
            </div>

            <p className="border-t border-border px-3.5 py-2.5 text-xs leading-relaxed text-t4">
              {t("borrower.pickup.verifyHelp")}
            </p>
          </Panel>

          <Panel title={t("borrower.pickup.photoTitle")}>
            <div className="px-3.5 pb-1 pt-2.5">
              <p className="text-xs leading-relaxed text-t3">
                {t("borrower.pickup.photoHelp")}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-t4">
                {t("borrower.pickup.photoPer")} ·{" "}
                <span className="font-mono tabular-nums">
                  {t("borrower.pickup.photoCount", {
                    done: selected.length - missingShots.length,
                    total: selected.length,
                  })}
                </span>
              </p>
            </div>

            {selected.length === 0 ? (
              <p className="px-3.5 pb-4 pt-2 text-[12.5px] text-t4">
                {t("borrower.pickup.photoNone")}
              </p>
            ) : (
              <div className="grid gap-3 p-3.5 [grid-template-columns:repeat(auto-fill,minmax(205px,1fr))]">
                {selected.map((row) => (
                  <PhotoBox
                    key={row.id}
                    row={row}
                    image={shots[row.id]}
                    disabled={
                      uploadPickupImage.isPending ||
                      finalizePickup.isPending ||
                      shots[row.id]?.status === "uploaded"
                    }
                    onPicked={(image) => replaceShot(row.id, image)}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <aside className="lg:sticky lg:top-0">
          <Panel
            title={
              <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-t3">
                {t("borrower.pickup.summary")}
              </span>
            }
          >
            <div className="flex flex-col gap-2.5 p-3.5 text-[13px]">
              <SumRow label={t("borrower.pickup.count")}>
                {t("borrower.pickup.units", { count: selected.length })}
              </SumRow>
              <SumRow label={t("borrower.pickup.within")} plain>
                {t("borrower.pickup.withinVal", { count: BUSINESS.PICKUP_DEADLINE_DAYS })}
              </SumRow>
            </div>

            <div className="px-3.5 pb-3.5">
              {selected.length === 0 ? (
                <Warning>{t("borrower.pickup.blockPick")}</Warning>
              ) : missingShots.length > 0 ? (
                <Warning>
                  {t("borrower.pickup.blockShots", { count: missingShots.length })}
                </Warning>
              ) : missingUsage ? (
                <Warning>{t("borrower.pickup.blockUsage")}</Warning>
              ) : uploadError ? (
                <div
                  role="alert"
                  className="mb-2 rounded border border-[var(--s-alert-b)] bg-[var(--s-alert-bg)] px-3 py-2.5 text-xs leading-relaxed text-[var(--s-alert-t)]"
                >
                  {uploadError}
                </div>
              ) : null}

              <Button
                type="button"
                className="h-10 w-full"
                disabled={!canConfirm}
                onClick={() => void confirm()}
              >
                {finalizePickup.isPending
                  ? t("borrower.pickup.finalizing")
                  : uploadPickupImage.isPending
                  ? t("borrower.pickup.uploading")
                  : t("borrower.pickup.confirm")}
              </Button>
            </div>

            <p className="border-t border-border px-3.5 py-2.5 text-xs leading-relaxed text-t4">
              {t("borrower.pickup.after")}
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

/**
 * One row waiting at the counter: tick to take it.
 *
 * Swapping is a T1 affair. T0 items are interchangeable stock with nothing to
 * choose between, and a T2 unit was approved by a supervisor as *that* unit -
 * picking a different one afterwards would step around the approval. The swap
 * itself is staff's (`loan.swapUnit`, with no borrower procedure), so the row
 * says who to ask rather than offering a button.
 */
function PickRow({
  row,
  selected,
  photographed,
  onToggle,
}: {
  row: MyRequest;
  selected: boolean;
  photographed: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  const canSwap = row.tier === "T1";

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded border border-border p-3 shadow-[inset_3px_0_0_transparent]",
        selected && "bg-accent-soft shadow-[inset_3px_0_0_var(--accent)]",
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        aria-label={row.name}
        className="mt-0.5 h-[15px] w-[15px] shrink-0 cursor-pointer accent-[var(--accent)]"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-foreground">{row.name}</span>
          <span className="rounded bg-surface-inset px-1.5 py-0.5 text-[10.5px] font-semibold text-t3">
            {row.tier ?? t("borrower.catalog.tierUnknown")}
          </span>
        </div>
        <div className="mt-1 font-mono text-xs text-t3">
          {row.id} · {fmtRange(row.startDate, row.endDate)} · {row.serial}
        </div>

        {canSwap ? (
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-t4">
            {photographed ? t("borrower.pickup.swapNote") : t("borrower.pickup.swapAtCounter")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The borrower's own record of how the item looked when handed over. A real
 * file picker rather than the mockup's click-to-toggle placeholder, so the
 * size and type limits the backend enforces bite while the photo can still be
 * retaken.
 */
function PhotoBox({
  row,
  image,
  disabled,
  onPicked,
}: {
  row: MyRequest;
  image?: PreparedBorrowerImage;
  disabled: boolean;
  onPicked: (image: PreparedBorrowerImage) => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  // Ground truth for what is actually on file - separate from `image` above,
  // which is only this session's queued shot. Idle for a room booking or a
  // request staff have not allocated a unit for yet.
  const { data: existingPhotos } = useUsagePhotos(row.usageKey ?? null);
  const detachPhoto = useDetachUsagePhoto();

  function removePhoto(imageKey: number) {
    if (row.usageKey == null) return;
    setError(null);
    detachPhoto.mutate(
      { usageKey: row.usageKey, imageKey },
      { onError: (e) => setError(getErrorMessage(e)) },
    );
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Let the same file be chosen again after a rejection.
    e.target.value = "";
    if (!file) return;

    const result = validateUploadFile(file);
    if (!result.ok) {
      setError(
        result.code === "FILE_TOO_LARGE"
          ? t("borrower.pickup.photoTooLarge", { max: UPLOAD.MAX_MB })
          : t("borrower.pickup.photoBadType"),
      );
      return;
    }

    setError(null);
    onPicked(prepareBorrowerImage(file));
  }

  const taken = Boolean(image);

  return (
    <div>
      <div className="truncate text-[12.5px] font-semibold leading-tight text-foreground">
        {row.name}
      </div>
      <div className="mb-1.5 mt-0.5 font-mono text-[11px] text-t4">{row.serial}</div>

      <label
        className={cn(
          "relative flex h-[132px] cursor-pointer items-center justify-center overflow-hidden rounded border border-dashed",
          taken
            ? "border-[var(--s-ok-t)] bg-[var(--s-ok-bg)] text-[var(--s-ok-t)]"
            : "border-line-strong bg-surface-inset text-t4",
          disabled && "cursor-default opacity-80",
        )}
      >
        <input
          type="file"
          accept={uploadAcceptAttr()}
          disabled={disabled}
          onChange={onPick}
          className="sr-only"
        />
        {image ? (
          <>
            <img src={image.previewUrl} alt="" className="h-full w-full object-cover" />
            <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded bg-[var(--s-ok-t)] px-1.5 py-0.5 text-[11px] font-semibold text-white">
              <Check size={11} strokeWidth={3} />
              {t("borrower.pickup.taken")}
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-2">
            <Camera size={26} strokeWidth={1.5} />
            <span className="text-[12.5px] font-medium">{t("borrower.pickup.take")}</span>
          </span>
        )}
      </label>

      {error ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--s-alert-t)]">{error}</p>
      ) : null}

      {existingPhotos ? (
        <UsagePhotoGallery
          photos={existingPhotos}
          disabled={disabled}
          pendingImageKey={detachPhoto.isPending ? detachPhoto.variables?.imageKey : undefined}
          onRemove={removePhoto}
        />
      ) : null}
    </div>
  );
}

/**
 * What the server already has on file for this loan, grouped by stage.
 *
 * Separate from the take-a-photo control above it: that one is this session's
 * queued shot, this is ground truth - including a photo filed on an earlier
 * visit that nothing here previously showed again.
 */
function UsagePhotoGallery({
  photos,
  disabled,
  pendingImageKey,
  onRemove,
}: {
  photos: UsagePhotoSet;
  disabled: boolean;
  pendingImageKey?: number;
  onRemove: (imageKey: number) => void;
}) {
  const { t } = useTranslation();
  const allGroups: { stage: keyof UsagePhotoSet; label: string }[] = [
    { stage: "before", label: t("borrower.pickup.stageBefore") },
    { stage: "after", label: t("borrower.pickup.stageAfter") },
    { stage: "inspection", label: t("borrower.pickup.stageInspection") },
  ];
  const groups = allGroups.filter((g) => photos[g.stage].length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {groups.map((g) => (
        <div key={g.stage}>
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-t4">
            {g.label}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {photos[g.stage].map((photo) => (
              <div key={photo.imageKey} className="relative">
                <ImageThumb src={photo.imageUrl} size={48} />
                {/* Inspection photos come off a re-grading, never this control -
                    the server refuses the call, so it is not offered here. */}
                {g.stage !== "inspection" ? (
                  <button
                    type="button"
                    aria-label={t("borrower.pickup.removePhoto")}
                    disabled={disabled || pendingImageKey === photo.imageKey}
                    onClick={() => onRemove(photo.imageKey)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-t3 shadow-sm disabled:opacity-50"
                  >
                    <X size={11} strokeWidth={2.6} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Card frame with an optional title bar. */
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

function SumRow({
  label,
  plain = false,
  children,
}: {
  label: string;
  plain?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-t3">{label}</span>
      <span className={cn("text-right font-medium text-foreground", !plain && "font-mono")}>
        {children}
      </span>
    </div>
  );
}

/** Says what is standing between the borrower and the confirm button. */
function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 flex items-start gap-2 rounded bg-[var(--s-warn-bg)] px-3 py-2.5 text-xs font-medium leading-relaxed text-[var(--s-warn-t)]">
      <TriangleAlert size={13} strokeWidth={2.4} className="mt-0.5 shrink-0" />
      {children}
    </p>
  );
}

function EmptyState({ onGo }: { onGo: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-6 py-11 text-center shadow-sm">
      <span className="mb-1 text-t4">
        <Package size={26} strokeWidth={1.5} />
      </span>
      <div className="text-[15px] font-semibold text-foreground">
        {t("borrower.pickup.none")}
      </div>
      <div className="max-w-sm text-[13px] leading-relaxed text-t3">
        {t("borrower.pickup.noneBody")}
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onGo}>
        {t("borrower.pickup.goRequests")}
      </Button>
    </div>
  );
}

/** "11–18 ส.ค." - collapses to one date when start and end match. */
function fmtRange(start: string, end: string): string {
  if (start === end) return fmtDay(end);
  return `${fmtDayNum(start)}–${fmtDay(end)}`;
}

function fmtDay(iso: string): string {
  return fmtDayMonth(iso);
}
