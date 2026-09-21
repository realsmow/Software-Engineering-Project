import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shared/page-header";
import { ImageThumb } from "@/components/shared/image-thumb";
import { TierDot } from "@/components/shared/tier-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { getErrorMessage, getErrorPayload } from "@/lib/error-messages";
import { fmtDateTime } from "@/features/borrower/format";
import type { ConditionType } from "@/features/staff/queue/queue.types";
import { UnitHistory } from "./unit-history";
import {
  useFinishRepair,
  useProposeDecommission,
  useRepairTargetUnits,
  useRepairTargets,
  useRepairs,
  useStartRepair,
} from "./use-repairs";
import { CONDITIONS, isUsable, type Repair } from "./repairs.types";

/**
 * The repair workshop (R02 "การติดตามการซ่อมบำรุง").
 *
 * The grading desk decides what damage costs the borrower; this decides what
 * happens to the thing itself. A B2 or B3 grade takes a unit out of the pool
 * and leaves it there, and until this screen existed nothing could put it back:
 * the RepairLog rows the server has always been willing to write had no way in.
 *
 * Both actions are one-way in the server's eyes. Starting a repair withdraws
 * the unit; closing one sets its condition, and whether the result counts as
 * usable is what returns it to the shelf. Neither is undone here - a repair
 * that closed wrongly is corrected by opening another.
 */
export default function StaffRepairsPage() {
  const { t } = useTranslation();
  const [openOnly, setOpenOnly] = useState(true);
  const { data: repairs, isLoading } = useRepairs(openOnly);
  const [starting, setStarting] = useState(false);

  const rows = repairs ?? [];
  // A unit with a repair already open must not be sent again: the server has no
  // guard against a second RepairLog on the same resource, and two open rows
  // for one unit cannot both be closed truthfully.
  const busyResourceKeys = new Set(
    rows.filter((r) => r.finishedAt === null).map((r) => r.resourceKey),
  );

  return (
    <div>
      <PageHeader
        title={t("nav.repairs")}
        subtitle={t("staff.repairs.subtitle")}
        actions={
          <Button type="button" size="sm" onClick={() => setStarting(!starting)}>
            {starting ? t("staff.repairs.startCancel") : t("staff.repairs.startNew")}
          </Button>
        }
      />

      {starting ? (
        <StartPanel
          busyResourceKeys={busyResourceKeys}
          onDone={() => setStarting(false)}
        />
      ) : null}

      <div className="mb-3">
        <Segmented
          options={[
            { value: "open", label: t("staff.repairs.filterOpen") },
            { value: "all", label: t("staff.repairs.filterAll") },
          ]}
          value={openOnly ? "open" : "all"}
          onChange={(next) => setOpenOnly(next === "open")}
        />
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-t3">{t("common.loading")}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-10 text-center">
          <div className="text-sm font-semibold text-foreground">
            {t("staff.repairs.emptyTitle")}
          </div>
          <p className="mt-1 text-xs text-t3">{t("staff.repairs.emptyDesc")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <RepairCard key={row.repairKey} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One repair, closed from here while it is still open. */
function RepairCard({ row }: { row: Repair }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const isOpenRepair = row.finishedAt === null;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">
            {row.itemName ?? "-"}
            {row.serialNo ? (
              <span className="ml-2 font-mono text-[11px] font-normal text-t4">
                {row.serialNo}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-t4">
            <span>{t("staff.repairs.repairNo", { key: row.repairKey })}</span>
            <span>· {row.repairedByName}</span>
            <span>· {fmtDateTime(row.beganAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">
            {t("staff.repairs.wentIn", {
              condition: t(`staff.inspection.cond${row.conditionBefore}`),
            })}
          </Badge>
          {isOpenRepair ? (
            <Badge tone="warn">{t("staff.repairs.statusOpen")}</Badge>
          ) : (
            <Badge tone={isUsable(row.conditionAfter ?? "Broken") ? "ok" : "alert"}>
              {t("staff.repairs.cameOut", {
                condition: row.conditionAfter
                  ? t(`staff.inspection.cond${row.conditionAfter}`)
                  : "-",
              })}
            </Badge>
          )}
          <span className="text-xs font-medium text-accent">
            {open ? t("staff.inspection.close") : t("staff.repairs.openRow")}
          </span>
        </div>
      </button>

      {open ? (
        <div className="border-t border-border">
          {isOpenRepair ? <FinishForm row={row} /> : <ClosedSummary row={row} />}

          <div className="border-t border-border px-3.5 py-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
              {t("staff.inspection.unitHistory")}
            </div>
            <UnitHistory resourceKey={row.resourceKey} />
          </div>

          {isOpenRepair ? <DecommissionForm resourceKey={row.resourceKey} /> : null}
        </div>
      ) : null}
    </section>
  );
}

/** What a finished repair left behind. Nothing here is editable. */
function ClosedSummary({ row }: { row: Repair }) {
  const { t } = useTranslation();
  const after = row.conditionAfter;

  return (
    <div className="px-3.5 py-3 text-[13px] leading-relaxed text-t2">
      {t("staff.repairs.closedOn", {
        when: fmtDateTime(row.finishedAt ?? undefined),
        condition: after ? t(`staff.inspection.cond${after}`) : "-",
      })}{" "}
      {after === null
        ? null
        : isUsable(after)
          ? t("staff.repairs.closedBackInPool")
          : t("staff.repairs.closedStillOut")}
    </div>
  );
}

/**
 * Close a repair.
 *
 * The condition picker is the whole decision, so what each choice does to the
 * unit is spelled out before the button is pressed rather than reported after.
 */
function FinishForm({ row }: { row: Repair }) {
  const { t } = useTranslation();
  const finish = useFinishRepair();
  const [condition, setCondition] = useState<ConditionType>("Normal");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return (
      <div className="bg-[var(--s-ok-bg)] px-3.5 py-3 text-[13px] leading-relaxed text-[var(--s-ok-t)]">
        {done}
      </div>
    );
  }

  async function submit() {
    setError(null);
    try {
      const out = await finish.mutateAsync({
        repairKey: row.repairKey,
        condition,
        note: note.trim() || undefined,
      });
      const outcome = out.conditionAfter ?? condition;
      setDone(
        t("staff.repairs.finishDone", {
          condition: t(`staff.inspection.cond${outcome}`),
          outcome: isUsable(outcome)
            ? t("staff.repairs.closedBackInPool")
            : t("staff.repairs.closedStillOut"),
        }),
      );
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <div className="px-3.5 py-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
        {t("staff.repairs.finishTitle")}
      </div>

      <div className="mb-2.5 flex flex-wrap gap-2">
        {CONDITIONS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCondition(c)}
            className={[
              "rounded border px-2.5 py-1.5 text-left transition-colors",
              condition === c
                ? "border-accent bg-[var(--accent-soft)]"
                : "border-border hover:bg-muted",
            ].join(" ")}
          >
            <span className="text-xs font-medium text-foreground">
              {t(`staff.inspection.cond${c}`)}
            </span>
          </button>
        ))}
      </div>

      <p className="mb-2.5 text-xs leading-relaxed text-t3">
        {isUsable(condition)
          ? t("staff.repairs.finishHintUsable")
          : t("staff.repairs.finishHintUnusable")}
      </p>

      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("staff.repairs.notePlaceholder")}
        className="mb-2.5 max-w-xl"
      />

      {error ? <p className="mb-2.5 text-xs text-[var(--s-warn-t)]">{error}</p> : null}

      <Button
        type="button"
        size="sm"
        disabled={finish.isPending}
        onClick={() => void submit()}
      >
        {finish.isPending ? t("common.loading") : t("staff.repairs.finishAction")}
      </Button>
    </div>
  );
}

/**
 * Propose writing the unit off.
 *
 * The server refuses this one. It checks the caller's scope and then answers
 * NOT_IMPLEMENTED, because a proposal needs a row with a proposer, a
 * supervisor's decision and an audit entry, and the schema has none of those
 * tables. The form is here anyway, wired to the real procedure: the workshop is
 * exactly where somebody decides a thing is beyond fixing, and the refusal is
 * shown with what the server itself says to do instead. When the table lands,
 * this starts working without being rewritten.
 */
function DecommissionForm({ resourceKey }: { resourceKey: number }) {
  const { t } = useTranslation();
  const propose = useProposeDecommission();
  const [openForm, setOpenForm] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    setFallback(null);
    if (reason.trim() === "") {
      setError(t("staff.repairs.decommissionNeedsReason"));
      return;
    }
    try {
      await propose.mutateAsync({ resourceKey, reason: reason.trim() });
      setDone(true);
    } catch (e) {
      setError(getErrorMessage(e));
      // The server names what is missing and what to use meanwhile. Reading it
      // off the error beats repeating it here, where it would rot.
      const note = getErrorPayload(e)?.note;
      if (typeof note === "string") setFallback(note);
    }
  }

  if (done) {
    return (
      <div className="border-t border-border bg-[var(--s-ok-bg)] px-3.5 py-3 text-[13px] text-[var(--s-ok-t)]">
        {t("staff.repairs.decommissionSent")}
      </div>
    );
  }

  return (
    <div className="border-t border-border px-3.5 py-3">
      {openForm ? (
        <>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
            {t("staff.repairs.decommissionTitle")}
          </div>
          <p className="mb-2.5 text-xs leading-relaxed text-t3">
            {t("staff.repairs.decommissionHint")}
          </p>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("staff.repairs.decommissionReasonPlaceholder")}
            className="mb-2.5 max-w-xl"
          />

          {error ? (
            <p className="mb-2 text-xs text-[var(--s-warn-t)]">{error}</p>
          ) : null}
          {fallback ? (
            <p className="mb-2.5 max-w-xl text-xs leading-relaxed text-t3">{fallback}</p>
          ) : null}

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={propose.isPending}
              onClick={() => void submit()}
            >
              {propose.isPending
                ? t("common.loading")
                : t("staff.repairs.decommissionAction")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOpenForm(false)}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpenForm(true)}
        >
          {t("staff.repairs.decommissionOpen")}
        </Button>
      )}
    </div>
  );
}

/**
 * Pick the thing that needs fixing.
 *
 * Units are reached through their type rather than listed flat, because a
 * department's whole unit list is long and the person opening this already
 * knows what broke. Rooms sit alongside equipment: `startRepair` takes a
 * ResourceKey, and a room out of service is the same row in the same table.
 */
function StartPanel({
  busyResourceKeys,
  onDone,
}: {
  busyResourceKeys: Set<number>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { data: targets, isLoading } = useRepairTargets();
  const [itemKey, setItemKey] = useState<number | null>(null);
  const { data: detail, isLoading: unitsLoading } = useRepairTargetUnits(itemKey);
  const start = useStartRepair();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function send(resourceKey: number) {
    setError(null);
    try {
      await start.mutateAsync({ resourceKey, note: note.trim() || undefined });
      onDone();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <section className="mb-4 rounded-lg border border-border bg-card p-3.5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
        {t("staff.repairs.startTitle")}
      </div>
      <p className="mb-2.5 text-xs leading-relaxed text-t3">
        {t("staff.repairs.startHint")}
      </p>

      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("staff.repairs.startNotePlaceholder")}
        className="mb-3 max-w-xl"
      />

      {error ? <p className="mb-2.5 text-xs text-[var(--s-warn-t)]">{error}</p> : null}

      {isLoading ? (
        <p className="text-xs text-t3">{t("common.loading")}</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-2">
            {(targets?.types ?? []).map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => setItemKey(itemKey === type.id ? null : type.id)}
                className={[
                  "flex items-center gap-2 rounded border px-2.5 py-1.5 text-left transition-colors",
                  itemKey === type.id
                    ? "border-accent bg-[var(--accent-soft)]"
                    : "border-border hover:bg-muted",
                ].join(" ")}
              >
                <ImageThumb src={type.imageUrl} size={24} />
                <span className="text-xs font-medium text-foreground">
                  {type.name ?? "-"}
                </span>
                <span className="font-mono text-[11px] text-t4">{type.totalUnits}</span>
              </button>
            ))}
          </div>

          {itemKey !== null ? (
            unitsLoading ? (
              <p className="text-xs text-t3">{t("common.loading")}</p>
            ) : (
              <ul className="mb-3 flex flex-col gap-1">
                {(detail?.units ?? []).map((unit) => (
                  <li
                    key={unit.resourceKey}
                    className="flex flex-wrap items-center gap-2 border-b border-border py-1.5 last:border-b-0"
                  >
                    <TierDot tier={unit.tier} />
                    <span className="font-mono text-xs text-foreground">
                      {unit.serialNo}
                    </span>
                    <span className="text-[11px] text-t3">
                      {unit.condition
                        ? t(`staff.inspection.cond${unit.condition}`)
                        : t("staff.repairs.conditionUnrecorded")}
                    </span>
                    {unit.lendable ? null : (
                      <Badge tone="warn">{t("staff.repairs.withdrawn")}</Badge>
                    )}
                    <span className="ml-auto">
                      {busyResourceKeys.has(unit.resourceKey) ? (
                        <span className="text-[11px] text-t4">
                          {t("staff.repairs.alreadyInRepair")}
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={start.isPending}
                          onClick={() => void send(unit.resourceKey)}
                        >
                          {t("staff.repairs.startAction")}
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {(targets?.rooms ?? []).length > 0 ? (
            <>
              <div className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
                {t("staff.repairs.roomsHeading")}
              </div>
              <ul className="flex flex-col gap-1">
                {(targets?.rooms ?? []).map((room) => (
                  <li
                    key={room.resourceKey}
                    className="flex flex-wrap items-center gap-2 border-b border-border py-1.5 last:border-b-0"
                  >
                    <TierDot tier={room.tier} />
                    <span className="text-xs text-foreground">{room.name ?? "-"}</span>
                    <span className="text-[11px] text-t3">
                      {room.condition
                        ? t(`staff.inspection.cond${room.condition}`)
                        : t("staff.repairs.conditionUnrecorded")}
                    </span>
                    {room.lendable ? null : (
                      <Badge tone="warn">{t("staff.repairs.withdrawn")}</Badge>
                    )}
                    <span className="ml-auto">
                      {busyResourceKeys.has(room.resourceKey) ? (
                        <span className="text-[11px] text-t4">
                          {t("staff.repairs.alreadyInRepair")}
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={start.isPending}
                          onClick={() => void send(room.resourceKey)}
                        >
                          {t("staff.repairs.startAction")}
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
