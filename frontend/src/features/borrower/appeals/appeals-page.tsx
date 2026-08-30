import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { th } from "date-fns/locale";
import { Camera, Check, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UPLOAD } from "@/constants";
import { cn } from "@/lib/utils";
import { uploadAcceptAttr, validateUploadFile } from "@/lib/upload-validation";
import { creditCutOf, type MyRequest } from "../mock-data";
import { useMyRequests } from "../loans/use-my-requests";
import { useSubmittedRequests } from "../loans/submitted-requests.store";

/**
 * Appeal a damage verdict.
 *
 * The whole page exists because the inspector and the decider must be
 * different people: staff assign the damage level, a supervisor rules on the
 * challenge. Nothing here decides anything — it collects the borrower's side
 * of it and sends it on.
 *
 * B0 verdicts never appear: nothing was deducted, so there is nothing to claim
 * back. Verdicts whose seven days have run out stay listed but unselectable,
 * because "you had a right and it expired" is worth seeing.
 */
export default function AppealsPage() {
  const { t } = useTranslation();
  const { requests } = useMyRequests();
  const sendAppeal = useSubmittedRequests((s) => s.sendAppeal);

  // Deep link from "my requests": the row the borrower pressed appeal on.
  const [params, setParams] = useSearchParams();
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);

  const appealable = useMemo(
    () => requests.filter((r) => r.inspection && r.inspection.damage !== "B0"),
    [requests],
  );

  const wanted = params.get("request");
  const picked = appealable.find((r) => r.id === wanted && isOpen(r)) ?? null;

  function pick(id: string) {
    setParams(id ? { request: id } : {}, { replace: true });
  }

  const why = reason.trim();
  const blockKey = picked === null
    ? "borrower.appeals.needPick"
    : why.length === 0
      ? "borrower.appeals.needWhy"
      : photo === null
        ? "borrower.appeals.needShot"
        : null;

  function submit() {
    if (picked === null || blockKey !== null) return;
    sendAppeal(picked.id);
    setReason("");
    setPhoto(null);
    setParams({}, { replace: true });
  }

  return (
    <div>
      <PageHeader title={t("nav.appeals")} subtitle={t("borrower.appeals.subtitle")} />

      <div className="mb-4 rounded-lg border border-border border-l-[3px] border-l-accent bg-accent-soft px-3.5 py-3">
        <p className="text-xs leading-relaxed text-t2">{t("borrower.appeals.intro")}</p>
      </div>

      {appealable.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_312px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel title={t("borrower.appeals.pickTitle")}>
              <p className="px-3.5 pb-1 pt-2.5 text-xs leading-relaxed text-t3">
                {t("borrower.appeals.pickHelp")}
              </p>
              <div className="flex flex-col gap-2 px-3.5 pb-3.5 pt-1.5">
                {appealable.map((row) => (
                  <VerdictCard
                    key={row.id}
                    row={row}
                    selected={picked?.id === row.id}
                    onPick={() => pick(row.id)}
                  />
                ))}
              </div>
            </Panel>

            {picked ? (
              <Panel title={t("borrower.appeals.formTitle")}>
                <div className="p-3.5">
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
                      {t("borrower.appeals.whyLabel")}
                    </span>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t("borrower.appeals.whyPlaceholder")}
                      className="mt-1.5 h-24 w-full resize-none rounded border border-border bg-surface-inset px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-t4 focus-visible:border-accent"
                    />
                  </label>

                  <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
                    {t("borrower.appeals.shotTitle")}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-t4">
                    {t("borrower.appeals.shotHelp")}
                  </p>
                  <PhotoBox url={photo} onPicked={setPhoto} />
                </div>
              </Panel>
            ) : (
              <Panel>
                <p className="px-5 py-9 text-center text-sm font-semibold text-foreground">
                  {t("borrower.appeals.needPick")}
                </p>
              </Panel>
            )}
          </div>

          <aside className="lg:sticky lg:top-0">
            <Panel
              title={
                <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-t3">
                  {t("borrower.appeals.summary")}
                </span>
              }
            >
              <div className="flex flex-col gap-2.5 p-3.5 text-[13px]">
                <div>
                  <div className="text-t3">{t("borrower.appeals.sumItem")}</div>
                  <div className="mt-1 font-medium leading-snug text-foreground">
                    {picked?.name ?? "—"}
                  </div>
                  {picked ? (
                    <div className="mt-0.5 font-mono text-[11.5px] text-t4">{picked.serial}</div>
                  ) : null}
                </div>
                <SumRow label={t("borrower.appeals.sumDmg")}>
                  {picked?.inspection?.damage ?? "—"}
                </SumRow>
                <SumRow label={t("borrower.appeals.sumCut")}>
                  {picked ? cutOf(picked) : "—"}
                </SumRow>
              </div>

              <div className="px-3.5 pb-3.5">
                {blockKey ? <Warning>{t(blockKey)}</Warning> : null}
                <Button
                  type="button"
                  className="h-[42px] w-full"
                  disabled={blockKey !== null}
                  onClick={submit}
                >
                  {t("borrower.appeals.send")}
                </Button>
              </div>
            </Panel>
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * One verdict, with the three figures that decide whether it is worth
 * contesting: the level given, what it cost, and when the clock started.
 */
function VerdictCard({
  row,
  selected,
  onPick,
}: {
  row: MyRequest;
  selected: boolean;
  onPick: () => void;
}) {
  const { t } = useTranslation();
  const insp = row.inspection;
  if (!insp) return null;

  const open = isOpen(row);
  const window = row.appealSent
    ? { key: "borrower.appeals.sentTag", tone: "ok" as BadgeTone, count: 0 }
    : insp.appealDaysLeft > 0
      ? { key: "borrower.appeals.left", tone: "warn" as BadgeTone, count: insp.appealDaysLeft }
      : { key: "borrower.appeals.closed", tone: "neutral" as BadgeTone, count: 0 };

  return (
    <button
      type="button"
      disabled={!open}
      onClick={onPick}
      className={cn(
        "rounded border p-3 text-left transition-colors",
        selected ? "border-accent bg-accent-soft" : "border-border bg-card",
        open ? "hover:border-line-strong" : "cursor-not-allowed opacity-75",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{row.name}</span>
            <span className="rounded bg-surface-inset px-1.5 py-0.5 text-[10.5px] font-semibold text-t3">
              {row.tier}
            </span>
          </span>
          <span className="mt-1 block font-mono text-[11.5px] text-t4">
            {row.id} · {row.serial}
          </span>
        </span>
        <Badge tone={window.tone}>{t(window.key, { count: window.count })}</Badge>
      </div>

      <div className="mt-2.5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
        <Field label={t("borrower.appeals.colDmg")}>{insp.damage}</Field>
        <Field label={t("borrower.appeals.colCut")}>−{cutOf(row)}</Field>
        <Field label={t("borrower.appeals.colWhen")}>{fmtDay(insp.inspectedAt)}</Field>
      </div>

      {insp.reason ? (
        <p className="mt-2 text-xs leading-relaxed text-t3">
          {t("borrower.appeals.inspectedBy", { name: insp.inspectedBy })} — {insp.reason}
        </p>
      ) : null}

      {row.appealSent ? (
        <p className="mt-2 rounded bg-[var(--s-ok-bg)] px-3 py-2 text-xs font-medium leading-relaxed text-[var(--s-ok-t)]">
          {t("borrower.appeals.sentNote")}
        </p>
      ) : null}
    </button>
  );
}

/**
 * One photo, not the mockup's pair. The borrower already has shots from
 * collection and from return; forcing both slots when either one alone can
 * make the point just blocks the appeal on paperwork.
 */
function PhotoBox({ url, onPicked }: { url: string | null; onPicked: (url: string) => void }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  // The object URL belongs to this page, so this page releases it: one on
  // replacement, and whatever is left at unmount.
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
          ? t("borrower.appeals.photoTooLarge", { max: UPLOAD.MAX_MB })
          : t("borrower.appeals.photoBadType"),
      );
      return;
    }

    setError(null);
    if (ownedRef.current) URL.revokeObjectURL(ownedRef.current);
    // TODO: upload via api-client.uploadFile and send the returned key.
    const next = URL.createObjectURL(file);
    ownedRef.current = next;
    onPicked(next);
  }

  return (
    <div className="mt-2.5">
      <label
        className={cn(
          "relative flex h-[118px] max-w-[280px] cursor-pointer items-center justify-center overflow-hidden rounded border border-dashed",
          url
            ? "border-[var(--s-ok-t)] bg-[var(--s-ok-bg)] text-[var(--s-ok-t)]"
            : "border-line-strong bg-surface-inset text-t4",
        )}
      >
        <input type="file" accept={uploadAcceptAttr()} onChange={onPick} className="sr-only" />
        {url ? (
          <>
            <img src={url} alt="" className="h-full w-full object-cover" />
            <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded bg-[var(--s-ok-t)] px-1.5 py-0.5 text-[11px] font-semibold text-white">
              <Check size={11} strokeWidth={3} />
              {t("borrower.appeals.shotDone")}
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-2">
            <Camera size={26} strokeWidth={1.5} />
            <span className="text-[12.5px] font-medium">{t("borrower.appeals.shotTake")}</span>
          </span>
        )}
      </label>
      {error ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--s-alert-t)]">{error}</p>
      ) : null}
    </div>
  );
}

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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">{label}</div>
      <div className="mt-1 font-mono text-[13px] text-foreground">{children}</div>
    </div>
  );
}

function SumRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-t3">{label}</span>
      <span className="text-right font-mono font-medium text-foreground">{children}</span>
    </div>
  );
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 flex items-start gap-2 rounded bg-[var(--s-warn-bg)] px-3 py-2.5 text-xs font-medium leading-relaxed text-[var(--s-warn-t)]">
      <TriangleAlert size={13} strokeWidth={2.4} className="mt-0.5 shrink-0" />
      {children}
    </p>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-6 py-11 text-center shadow-sm">
      <div className="text-[15px] font-semibold text-foreground">
        {t("borrower.appeals.noneTitle")}
      </div>
      <div className="max-w-sm text-[13px] leading-relaxed text-t3">
        {t("borrower.appeals.noneBody")}
      </div>
    </div>
  );
}

/** Still contestable: a verdict that cost credit, inside its window, not yet sent. */
function isOpen(row: MyRequest): boolean {
  return !row.appealSent && (row.inspection?.appealDaysLeft ?? 0) > 0;
}

function cutOf(row: MyRequest): number {
  return row.inspection ? creditCutOf(row.tier, row.inspection.damage) : 0;
}

function fmtDay(iso: string): string {
  return format(parseISO(iso), "d MMM", { locale: th });
}
