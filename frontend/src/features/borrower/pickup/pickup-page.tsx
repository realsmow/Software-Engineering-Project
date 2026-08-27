import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { th } from "date-fns/locale";
import { Camera, Check, Package, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { BUSINESS, ROUTES, UPLOAD } from "@/constants";
import { cn } from "@/lib/utils";
import { uploadAcceptAttr, validateUploadFile } from "@/lib/upload-validation";
import type { MyRequest } from "../mock-data";
import { useMyRequests } from "../loans/use-my-requests";
import { useSubmittedRequests } from "../loans/submitted-requests.store";

/**
 * Pick up equipment — the counter step between "staff have it ready" and
 * "the loan has started".
 *
 * One request is one unit, so this page has no quantity stepper: collecting
 * two of three items means ticking two of the three rows waiting here. What is
 * left unticked simply stays `ready` and shows up again next visit, which is
 * the same outcome the old per-line "collected 2 of 3" counter produced with
 * far more state to get wrong.
 *
 * Fixed facilities (T3) are never collected — they are used in place — so only
 * equipment appears here.
 */
export default function PickupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { requests } = useMyRequests();
  const pickUp = useSubmittedRequests((s) => s.pickUp);

  const rows = requests.filter((r) => r.kind === "equipment" && r.status === "ready");

  /** Rows the borrower has un-ticked. Absent means selected — everything waiting is taken by default. */
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  /** Condition photo per request id, as an object URL. */
  const [shots, setShots] = useState<Record<string, string>>({});

  const selected = rows.filter((r) => !dropped.has(r.id));
  const missingShots = selected.filter((r) => !shots[r.id]);
  const canConfirm = selected.length > 0 && missingShots.length === 0;

  function toggle(id: string) {
    setDropped((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function confirm() {
    if (!canConfirm) return;
    // TODO: POST /loans/pickup with { ids, photos }. Until then the collection
    // is recorded in the session store so the cards move to "on loan".
    pickUp(selected);
    navigate(ROUTES.MY_LOANS);
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
                    url={shots[row.id]}
                    onPicked={(url) => setShots((prev) => ({ ...prev, [row.id]: url }))}
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
              ) : null}

              <Button type="button" className="h-10 w-full" disabled={!canConfirm} onClick={confirm}>
                {t("borrower.pickup.confirm")}
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
 * One row waiting at the counter: tick to take it, or ask for a different unit.
 *
 * Swapping is a T1 affair. T0 items are interchangeable stock with nothing to
 * choose between, and a T2 unit was approved by a supervisor as *that* unit —
 * picking a different one afterwards would step around the approval.
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
  const patch = useSubmittedRequests((s) => s.patch);
  const [asking, setAsking] = useState(false);

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
            {row.tier}
          </span>
        </div>
        <div className="mt-1 font-mono text-xs text-t3">
          {row.id} · {fmtRange(row.startDate, row.endDate)} · {row.serial}
        </div>

        {canSwap ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-7 text-[11.5px]"
              disabled={photographed}
              onClick={() => setAsking(true)}
            >
              {photographed ? t("borrower.pickup.swapLocked") : t("borrower.pickup.swapAsk")}
            </Button>
            {photographed ? (
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-t4">
                {t("borrower.pickup.swapNote")}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title={t("borrower.pickup.swapConfirmTitle")}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setAsking(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setAsking(false);
                // Back to the staff bench — they have another unit to find.
                patch(row.id, { status: "preparing" });
              }}
            >
              {t("borrower.pickup.swapConfirmYes")}
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-t2">
          {t("borrower.pickup.swapConfirmBody", { name: row.name, serial: row.serial })}
        </p>
      </Modal>
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
  url,
  onPicked,
}: {
  row: MyRequest;
  url?: string;
  onPicked: (url: string) => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  // The object URL belongs to this page, so this page has to release it: one
  // on replacement, and whatever is left when the box unmounts.
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
          ? t("borrower.pickup.photoTooLarge", { max: UPLOAD.MAX_MB })
          : t("borrower.pickup.photoBadType"),
      );
      return;
    }

    setError(null);
    if (ownedRef.current) URL.revokeObjectURL(ownedRef.current);
    // TODO: upload via api-client.uploadFile and keep the returned key; the
    // object URL is a stand-in that dies with the tab.
    const next = URL.createObjectURL(file);
    ownedRef.current = next;
    onPicked(next);
  }

  const taken = Boolean(url);

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
        )}
      >
        <input
          type="file"
          accept={uploadAcceptAttr()}
          onChange={onPick}
          className="sr-only"
        />
        {url ? (
          <>
            <img src={url} alt="" className="h-full w-full object-cover" />
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

/** "11–18 ส.ค." — collapses to one date when start and end match. */
function fmtRange(start: string, end: string): string {
  if (start === end) return fmtDay(end);
  return `${format(parseISO(start), "d", { locale: th })}–${fmtDay(end)}`;
}

function fmtDay(iso: string): string {
  return format(parseISO(iso), "d MMM", { locale: th });
}
