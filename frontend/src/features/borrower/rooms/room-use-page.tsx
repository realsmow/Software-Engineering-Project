import { useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Camera, Check, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ImageThumb } from "@/components/shared/image-thumb";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { BUSINESS, ROUTES, UPLOAD } from "@/constants";
import { getErrorMessage } from "@/lib/error-messages";
import { cn } from "@/lib/utils";
import { uploadAcceptAttr, validateUploadFile } from "@/lib/upload-validation";
import { TIME_SLOTS, type MyRequest } from "../mock-data";
import { fmtDayMonth } from "../format";
import { useMyRequests, type LoanRow } from "../loans/use-my-requests";
import { useCancelRequest } from "../loans/use-my-requests-api";
import {
  useFinalizePickup,
  usePickupImageUpload,
  useUsagePhotos,
  type UsagePhoto,
} from "../pickup/use-pickup-image-upload";
import { prepareBorrowerImage, releaseBorrowerImage } from "../uploads/prepared-image";

/**
 * Use a room - where an approved T3 booking is checked in, and where the
 * borrower records the room as they left it.
 *
 * One page for every booking rather than one per room: the borrower comes here
 * to answer "what do I have today", so the room arrives as a card in the list
 * instead of an id in the URL.
 *
 * The lifecycle, as the server runs it:
 *   book -> staff approve -> staff open it (Prepared) -> photo before, check in
 *   (loan.confirmMyPickup) -> in use -> photo after -> staff close it
 *
 * The last step is staff's, not the borrower's. There is no borrower check-out
 * procedure: a room is handed back the way equipment is, through
 * `loan.recordReturn` at the counter, where staff compare the two photos. This
 * page used to offer a "check out" button that only changed a local status,
 * which left the booking open on the server while telling the borrower it was
 * finished. It now says who closes it instead.
 *
 * Photos go to the server (`image.attachUsagePhotos`) under the loan, so staff
 * see them in the inspection screen. The before photo gates check-in on the
 * server as well (PICKUP_PHOTO_REQUIRED); the button waits for it here too.
 */
export default function RoomUsePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { requests } = useMyRequests();

  const rows = requests.filter((r) => r.kind === "room" && PHASE_OF[r.status] !== undefined);

  return (
    <div>
      <PageHeader title={t("nav.roomUse")} subtitle={t("borrower.roomUse.subtitle")} />

      <div className="mb-4 rounded-lg border border-border border-l-[3px] border-l-accent bg-accent-soft px-3.5 py-3">
        <p className="text-xs leading-relaxed text-t2">{t("borrower.roomUse.intro")}</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState onBrowse={() => navigate(ROUTES.ROOMS)} />
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row) => (
            <BookingCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Which part of the visit a status puts the booking in. */
type Phase = "waiting" | "before" | "using" | "returned" | "done";

/**
 * Only these statuses belong on this page. Cancelled and rejected bookings have
 * released the room and are read about under "my requests" instead.
 */
const PHASE_OF: Partial<Record<MyRequest["status"], Phase>> = {
  pending: "waiting",
  approved: "waiting",
  preparing: "waiting",
  ready: "before",
  inUse: "using",
  returned: "returned",
  done: "done",
};

const PHASE_TONE: Record<Phase, BadgeTone> = {
  waiting: "warn",
  before: "info",
  using: "ok",
  returned: "neutral",
  done: "neutral",
};

const PHASE_LABEL: Record<Phase, string> = {
  waiting: "borrower.roomUse.stWaiting",
  before: "borrower.roomUse.stBooked",
  using: "borrower.roomUse.stUsing",
  returned: "borrower.roomUse.stReturned",
  done: "borrower.roomUse.stDone",
};

function BookingCard({ row }: { row: LoanRow }) {
  const { t } = useTranslation();
  const usageKey = row.usageKey ?? null;
  const { data: photos } = useUsagePhotos(usageKey);
  const checkIn = useFinalizePickup();
  const cancel = useCancelRequest();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phase = PHASE_OF[row.status] ?? "waiting";
  const before = photos?.before ?? [];
  const after = photos?.after ?? [];
  // The server says whether it can still be called off; the button follows it.
  const cancellable = "cancellable" in row && row.cancellable === true;

  const slots = row.slots ?? [];
  const first = slots.length > 0 ? Math.min(...slots) : null;
  const last = slots.length > 0 ? Math.max(...slots) : null;
  const timeLabel =
    first === null || last === null
      ? "-"
      : `${TIME_SLOTS[first].start}–${TIME_SLOTS[last].end}`;

  async function doCheckIn() {
    if (usageKey === null) return;
    setError(null);
    try {
      await checkIn.mutateAsync([usageKey]);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function doCancel() {
    setError(null);
    try {
      await cancel.mutateAsync({ reservationKey: Number(row.id) });
      setConfirmingCancel(false);
    } catch (e) {
      setConfirmingCancel(false);
      setError(getErrorMessage(e));
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold leading-snug text-foreground">{row.name}</h2>
            <span className="rounded bg-surface-inset px-1.5 py-0.5 text-[10.5px] font-semibold text-t3">
              {row.tier}
            </span>
          </div>
          <div className="mt-1 font-mono text-[11.5px] text-t4">{row.id}</div>
        </div>
        <Badge tone={PHASE_TONE[phase]}>{t(PHASE_LABEL[phase])}</Badge>
      </header>

      <div className="grid gap-3 border-b border-border px-4 py-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        <Field label={t("borrower.roomUse.dateCol")}>{fmtDayMonth(row.startDate)}</Field>
        <Field label={t("borrower.roomUse.timeCol")}>{timeLabel}</Field>
        <Field label={t("borrower.roomUse.totalCol")}>
          {t("borrower.roomUse.hours", {
            count: (slots.length * BUSINESS.ROOM_SLOT_MINUTES) / 60,
          })}
        </Field>
      </div>

      {usageKey !== null ? (
        <div className="grid grid-cols-2 gap-3.5 px-4 py-3.5">
          <PhotoBox
            usageKey={usageKey}
            stage="before"
            label={t("borrower.roomUse.takeBefore")}
            photos={before}
            // Each photo is evidence of one moment: the room as found, and the
            // room as left. Only the phase it belongs to may add to it.
            editable={phase === "before"}
          />
          <PhotoBox
            usageKey={usageKey}
            stage="after"
            label={t("borrower.roomUse.takeAfter")}
            photos={after}
            editable={phase === "using" || phase === "returned"}
          />
        </div>
      ) : null}

      {error ? (
        <div className="px-4 pb-2">
          <Warning>{error}</Warning>
        </div>
      ) : null}

      {phase === "waiting" ? (
        <div className="px-4 pb-4">
          <p className="mb-2.5 rounded bg-secondary px-3 py-2.5 text-xs leading-relaxed text-t3">
            {t("borrower.roomUse.waitStaff")}
          </p>
          {cancellable ? (
            <Button
              type="button"
              variant="outline"
              className="h-[42px] w-full border-[var(--s-alert-b)] text-[var(--s-alert-t)] hover:bg-[var(--s-alert-bg)]"
              onClick={() => setConfirmingCancel(true)}
            >
              {t("borrower.roomUse.cancel")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {phase === "before" ? (
        <div className="px-4 pb-4">
          {before.length === 0 ? <Warning>{t("borrower.roomUse.needBefore")}</Warning> : null}
          <div className="flex flex-wrap gap-2.5">
            <Button
              type="button"
              className="h-[42px] min-w-[180px] flex-1"
              disabled={before.length === 0 || checkIn.isPending}
              onClick={() => void doCheckIn()}
            >
              {checkIn.isPending ? t("common.loading") : t("borrower.roomUse.checkIn")}
            </Button>
            {cancellable ? (
              <Button
                type="button"
                variant="outline"
                className="h-[42px] border-[var(--s-alert-b)] px-5 text-[var(--s-alert-t)] hover:bg-[var(--s-alert-bg)]"
                onClick={() => setConfirmingCancel(true)}
              >
                {t("borrower.roomUse.cancel")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {phase === "using" || phase === "returned" ? (
        <div className="px-4 pb-4">
          {after.length === 0 ? <Warning>{t("borrower.roomUse.needAfter")}</Warning> : null}
          <p className="rounded bg-secondary px-3 py-2.5 text-xs leading-relaxed text-t3">
            {t(phase === "using" ? "borrower.roomUse.handBack" : "borrower.roomUse.staffChecking")}
          </p>
        </div>
      ) : null}

      {phase === "done" ? (
        <div className="px-4 pb-4">
          <p className="flex items-start gap-2 rounded bg-[var(--s-ok-bg)] px-3 py-2.5 text-xs font-medium leading-relaxed text-[var(--s-ok-t)]">
            <Check size={13} strokeWidth={2.6} className="mt-0.5 shrink-0" />
            {t("borrower.roomUse.stDone")} · {t("borrower.roomUse.doneNote")}
          </p>
        </div>
      ) : null}

      <Modal
        open={confirmingCancel}
        onClose={() => setConfirmingCancel(false)}
        title={t("borrower.roomUse.cancelConfirmTitle")}
        subtitle={`${row.id} · ${row.name}`}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setConfirmingCancel(false)}>
              {t("borrower.roomUse.cancelConfirmNo")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={cancel.isPending}
              onClick={() => void doCancel()}
            >
              {t("borrower.roomUse.cancelConfirmYes")}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-t2">
          {t("borrower.roomUse.cancelConfirmBody")}
        </p>
      </Modal>
    </section>
  );
}

/**
 * One condition photo, filed to the server against the loan.
 *
 * The size and type rules the backend enforces are checked here first, so a
 * 12 MB burst from a phone camera fails while the borrower can still retake it
 * rather than after the upload.
 */
function PhotoBox({
  usageKey,
  stage,
  label,
  photos,
  editable,
}: {
  usageKey: number;
  stage: "before" | "after";
  label: string;
  photos: UsagePhoto[];
  editable: boolean;
}) {
  const { t } = useTranslation();
  const upload = usePickupImageUpload();
  const [error, setError] = useState<string | null>(null);
  const latest = photos[photos.length - 1];

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Let the same file be chosen again after a rejection.
    e.target.value = "";
    if (!file) return;

    const result = validateUploadFile(file);
    if (!result.ok) {
      setError(
        result.code === "FILE_TOO_LARGE"
          ? t("borrower.roomUse.photoTooLarge", { max: UPLOAD.MAX_MB })
          : t("borrower.roomUse.photoBadType"),
      );
      return;
    }

    setError(null);
    // The preview is the server's copy once it lands, so this one's blob URL
    // is only needed for the upload and is released either way.
    const prepared = prepareBorrowerImage(file);
    try {
      await upload.mutateAsync({ usageKey, stage, image: prepared });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      releaseBorrowerImage(prepared);
    }
  }

  const taken = Boolean(latest);
  const canPick = editable && !upload.isPending;

  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
        {label}
      </div>

      <label
        className={cn(
          "relative flex h-[126px] items-center justify-center overflow-hidden rounded border border-dashed",
          taken
            ? "border-[var(--s-ok-t)] bg-[var(--s-ok-bg)] text-[var(--s-ok-t)]"
            : "border-line-strong bg-surface-inset text-t4",
          canPick ? "cursor-pointer" : "cursor-default opacity-80",
        )}
      >
        <input
          type="file"
          accept={uploadAcceptAttr()}
          disabled={!canPick}
          onChange={(e) => void onPick(e)}
          className="sr-only"
        />
        {latest ? (
          <>
            <ImageThumb src={latest.imageUrl} alt="" className="h-full w-full" icon={Camera} />
            <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded bg-[var(--s-ok-t)] px-1.5 py-0.5 text-[11px] font-semibold text-white">
              <Check size={11} strokeWidth={3} />
              {t("borrower.roomUse.shotDone")}
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-2">
            <Camera size={26} strokeWidth={1.5} />
            <span className="text-[12.5px] font-medium">
              {upload.isPending ? t("common.loading") : label}
            </span>
          </span>
        )}
      </label>

      {error ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--s-alert-t)]">{error}</p>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">{label}</div>
      <div className="mt-1 font-mono text-[13px] text-foreground">{children}</div>
    </div>
  );
}

/** Says which photo is still missing before the phase can end. */
function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2.5 flex items-start gap-2 rounded bg-[var(--s-warn-bg)] px-3 py-2.5 text-xs font-medium leading-relaxed text-[var(--s-warn-t)]">
      <TriangleAlert size={13} strokeWidth={2.4} className="mt-0.5 shrink-0" />
      {children}
    </p>
  );
}

function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-6 py-11 text-center shadow-sm">
      <div className="text-[15px] font-semibold text-foreground">
        {t("borrower.roomUse.none")}
      </div>
      <div className="max-w-sm text-[13px] leading-relaxed text-t3">
        {t("borrower.roomUse.noneBody")}
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onBrowse}>
        {t("borrower.roomUse.goRooms")}
      </Button>
    </div>
  );
}
