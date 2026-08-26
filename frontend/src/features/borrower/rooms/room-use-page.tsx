import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { parseISO } from "date-fns";
import { Camera, Check, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTES, UPLOAD } from "@/constants";
import { cn } from "@/lib/utils";
import { uploadAcceptAttr, validateUploadFile } from "@/lib/upload-validation";
import { TIME_SLOTS, type MyRequest } from "../mock-data";
import { fmtDayMonth } from "../format";
import { useMyRequests } from "../loans/use-my-requests";
import { useSubmittedRequests, type RoomUseShots } from "../loans/submitted-requests.store";

/**
 * Use a room — where a confirmed T3 booking is checked in and handed back.
 *
 * One page for every booking rather than one page per room: the borrower comes
 * here to answer "what do I have today", not to look a room up, so the room
 * arrives as a card in the list instead of an id in the URL.
 *
 * The lifecycle ends here. Fixed facilities run
 *   submit → staff approval → photo before → in use → photo after
 * and that is the whole of it — nothing goes to a counter afterwards, so
 * checking out completes the request rather than queueing an inspection.
 *
 * A booking still awaiting staff is listed too, greyed. It already holds the
 * room, so leaving it off this page would make the borrower's only held
 * booking the one thing they cannot see here.
 *
 * Both photos are mandatory gates, not decoration: staff compare the pair
 * during the daily condition check, so the button that ends each phase stays
 * disabled until its photo exists.
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

/** Which phase of the visit a status puts the booking in. */
type Phase = "waiting" | "before" | "using" | "done";

/**
 * Only these statuses belong on this page. Cancelled and rejected bookings
 * have released the room and are read about under "my requests" instead.
 */
const PHASE_OF: Partial<Record<MyRequest["status"], Phase>> = {
  pending: "waiting",
  ready: "before",
  inUse: "using",
  done: "done",
};

const PHASE_TONE: Record<Phase, BadgeTone> = {
  waiting: "warn",
  before: "info",
  using: "ok",
  done: "neutral",
};

const PHASE_LABEL: Record<Phase, string> = {
  waiting: "borrower.roomUse.stWaiting",
  before: "borrower.roomUse.stBooked",
  using: "borrower.roomUse.stUsing",
  done: "borrower.roomUse.stDone",
};

function BookingCard({ row }: { row: MyRequest }) {
  const { t } = useTranslation();
  const setStatus = useSubmittedRequests((s) => s.setStatus);
  const cancel = useSubmittedRequests((s) => s.cancel);
  const shots = useSubmittedRequests((s) => s.roomUse[row.id]);

  const phase = PHASE_OF[row.status] ?? "before";
  const hasBefore = Boolean(shots?.before);
  const hasAfter = Boolean(shots?.after);

  const slots = row.slots ?? [];
  const first = slots.length > 0 ? Math.min(...slots) : null;
  const last = slots.length > 0 ? Math.max(...slots) : null;
  const timeLabel =
    first === null || last === null
      ? "—"
      : `${TIME_SLOTS[first].start}–${TIME_SLOTS[last].end}`;

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
          <div className="mt-1 font-mono text-[11.5px] text-t4">
            {row.id} · {row.serial}
          </div>
        </div>
        <Badge tone={PHASE_TONE[phase]}>{t(PHASE_LABEL[phase])}</Badge>
      </header>

      <div className="grid gap-3 border-b border-border px-4 py-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        <Field label={t("borrower.roomUse.dateCol")}>{fmtDayMonth(parseISO(row.startDate))}</Field>
        <Field label={t("borrower.roomUse.timeCol")}>{timeLabel}</Field>
        <Field label={t("borrower.roomUse.totalCol")}>
          {t("borrower.roomUse.hours", { count: slots.length })}
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3.5 px-4 py-3.5">
        <PhotoBox
          requestId={row.id}
          which="before"
          label={t("borrower.roomUse.takeBefore")}
          url={shots?.before}
          // Each photo is evidence of one moment: the room as found, and the
          // room as left. Locking them outside their phase keeps a check-out
          // shot from being passed off as the arrival one.
          editable={phase === "before"}
        />
        <PhotoBox
          requestId={row.id}
          which="after"
          label={t("borrower.roomUse.takeAfter")}
          url={shots?.after}
          editable={phase === "using"}
        />
      </div>

      {phase === "waiting" ? (
        <div className="px-4 pb-4">
          <p className="mb-2.5 rounded bg-secondary px-3 py-2.5 text-xs leading-relaxed text-t3">
            {t("borrower.roomUse.waitStaff")}
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-[42px] w-full border-[var(--s-alert-b)] text-[var(--s-alert-t)] hover:bg-[var(--s-alert-bg)]"
            onClick={() => cancel(row.id)}
          >
            {t("borrower.roomUse.cancel")}
          </Button>
        </div>
      ) : null}

      {phase === "before" ? (
        <div className="px-4 pb-4">
          {!hasBefore ? <Warning>{t("borrower.roomUse.needBefore")}</Warning> : null}
          <div className="flex flex-wrap gap-2.5">
            <Button
              type="button"
              className="h-[42px] min-w-[180px] flex-1"
              disabled={!hasBefore}
              onClick={() => setStatus(row.id, "inUse")}
            >
              {t("borrower.roomUse.checkIn")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-[42px] border-[var(--s-alert-b)] px-5 text-[var(--s-alert-t)] hover:bg-[var(--s-alert-bg)]"
              onClick={() => cancel(row.id)}
            >
              {t("borrower.roomUse.cancel")}
            </Button>
          </div>
        </div>
      ) : null}

      {phase === "using" ? (
        <div className="px-4 pb-4">
          {!hasAfter ? <Warning>{t("borrower.roomUse.needAfter")}</Warning> : null}
          <Button
            type="button"
            className="h-[42px] w-full"
            disabled={!hasAfter}
            onClick={() => setStatus(row.id, "done")}
          >
            {t("borrower.roomUse.checkOut")}
          </Button>
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
    </section>
  );
}

/**
 * One condition photo. A real file picker rather than the mockup's click-to-
 * toggle placeholder, so the size and type rules that the backend enforces are
 * felt here too — a 12 MB burst from a phone camera should fail at the point
 * the borrower can still retake it.
 */
function PhotoBox({
  requestId,
  which,
  label,
  url,
  editable,
}: {
  requestId: string;
  which: keyof RoomUseShots;
  label: string;
  url?: string;
  editable: boolean;
}) {
  const { t } = useTranslation();
  const setRoomPhoto = useSubmittedRequests((s) => s.setRoomPhoto);
  const [error, setError] = useState<string | null>(null);

  // Object URLs are handed to the store, so this page is what has to release
  // them: one on replacement, and whatever is left when the card unmounts.
  const ownedRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (ownedRef.current) URL.revokeObjectURL(ownedRef.current);
    };
  }, []);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
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
    if (ownedRef.current) URL.revokeObjectURL(ownedRef.current);
    // TODO: upload via api-client.uploadFile and store the returned key; the
    // object URL is a stand-in that dies with the tab.
    const next = URL.createObjectURL(file);
    ownedRef.current = next;
    setRoomPhoto(requestId, which, next);
  }

  const taken = Boolean(url);

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
          editable ? "cursor-pointer" : "cursor-default opacity-80",
        )}
      >
        <input
          type="file"
          accept={uploadAcceptAttr()}
          disabled={!editable}
          onChange={onPick}
          className="sr-only"
        />
        {url ? (
          <>
            <img src={url} alt="" className="h-full w-full object-cover" />
            <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded bg-[var(--s-ok-t)] px-1.5 py-0.5 text-[11px] font-semibold text-white">
              <Check size={11} strokeWidth={3} />
              {t("borrower.roomUse.shotDone")}
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-2">
            <Camera size={26} strokeWidth={1.5} />
            <span className="text-[12.5px] font-medium">{label}</span>
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
