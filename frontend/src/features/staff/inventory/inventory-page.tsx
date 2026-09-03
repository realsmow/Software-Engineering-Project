import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shared/page-header";
import { TierDot } from "@/components/shared/tier-badge";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/error-messages";
import { fmtDateTime } from "@/features/borrower/format";
import { useManagedItem, useManagedItems, useSetUnitLendable } from "./use-inventory";
import type { ManagedItemType, ManagedUnit } from "./inventory.types";

/**
 * Department inventory (SRS FR-INV: staff register and maintain their own kit).
 *
 * Not the borrower catalogue with extra buttons. This lists what the
 * department owns, including everything a borrower can never see - units out
 * on loan, withdrawn for maintenance, or recorded missing - because the
 * question here is "where is all of it", not "what can I take today".
 *
 * Registering new types and units is deliberately not here yet: those are
 * forms with their own validation (tier, eligibility, serial batches), and
 * they belong in a second pass rather than bolted onto a list.
 */
export default function StaffInventoryPage() {
  const { t } = useTranslation();
  const { data: items, isLoading } = useManagedItems();
  const [openKey, setOpenKey] = useState<number | null>(null);
  const [q, setQ] = useState("");

  const needle = q.trim().toLowerCase();
  const rows = (items ?? []).filter(
    (i) => needle === "" || (i.name ?? "").toLowerCase().includes(needle),
  );

  const totals = (items ?? []).reduce(
    (acc, i) => ({
      types: acc.types + 1,
      units: acc.units + i.totalUnits,
      available: acc.available + i.availableUnits,
    }),
    { types: 0, units: 0, available: 0 },
  );

  return (
    <div>
      <PageHeader title={t("nav.inventory")} subtitle={t("staff.inventory.subtitle")} />

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <Tile label={t("staff.inventory.tileTypes")} value={totals.types} />
        <Tile label={t("staff.inventory.tileUnits")} value={totals.units} />
        <Tile label={t("staff.inventory.tileAvailable")} value={totals.available} />
      </div>

      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("staff.inventory.searchPlaceholder")}
        className="mb-3 max-w-sm"
      />

      {isLoading ? (
        <div className="py-16 text-center text-sm text-t3">{t("common.loading")}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-10 text-center">
          <div className="text-sm font-semibold text-foreground">
            {t("staff.inventory.emptyTitle")}
          </div>
          <p className="mt-1 text-xs text-t3">{t("staff.inventory.emptyDesc")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((item) => (
            <TypeCard
              key={item.id}
              item={item}
              open={openKey === item.id}
              onToggle={() => setOpenKey(openKey === item.id ? null : item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TypeCard({
  item,
  open,
  onToggle,
}: {
  item: ManagedItemType;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{item.name ?? "-"}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-t4">
            {/* Usually one tier. Two means two units of the same type sit on
                different BorrowRules, which is worth seeing, not hiding. */}
            {item.tiers.length === 0 ? (
              <span>{t("borrower.catalog.tierUnknown")}</span>
            ) : (
              item.tiers.map((tier) => (
                <span key={tier} className="inline-flex items-center gap-1">
                  <TierDot tier={tier} />
                  {tier}
                </span>
              ))
            )}
            <span>· {t("staff.inventory.weight", { weight: item.creditWeight })}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-sm tabular-nums text-foreground">
            {item.availableUnits} / {item.totalUnits}
          </span>
          <span className="text-xs font-medium text-accent">
            {open ? t("staff.inspection.close") : t("staff.inventory.openUnits")}
          </span>
        </div>
      </button>

      {open ? <Units itemKey={item.id} /> : null}
    </section>
  );
}

function Units({ itemKey }: { itemKey: number }) {
  const { t } = useTranslation();
  const { data: detail, isLoading } = useManagedItem(itemKey);

  if (isLoading) {
    return (
      <div className="border-t border-border px-3.5 py-6 text-center text-sm text-t3">
        {t("common.loading")}
      </div>
    );
  }
  if (!detail || detail.units.length === 0) {
    return (
      <div className="border-t border-border px-3.5 py-4 text-xs text-t3">
        {t("staff.inventory.noUnits")}
      </div>
    );
  }

  return (
    <div className="border-t border-border">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-secondary">
            <Th>{t("staff.inventory.colSerial")}</Th>
            <Th>{t("common.status")}</Th>
            <Th>{t("staff.inventory.colCondition")}</Th>
            <Th className="text-right">{t("staff.inventory.colActions")}</Th>
          </tr>
        </thead>
        <tbody>
          {detail.units.map((u) => (
            <UnitRow key={u.resourceKey} unit={u} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UnitRow({ unit }: { unit: ManagedUnit }) {
  const { t } = useTranslation();
  const setLendable = useSetUnitLendable();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);

  const busy = setLendable.isPending;
  // A unit in someone's hands cannot be withdrawn; the server refuses it too.
  const outOnLoan = unit.status === "Lended";

  async function toggle() {
    setError(null);
    try {
      await setLendable.mutateAsync({
        resourceKey: unit.resourceKey,
        lendable: !unit.lendable,
        reason: note.trim() || undefined,
      });
      setAsking(false);
      setNote("");
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3.5 py-2 font-mono text-xs text-foreground">
        {unit.serialNo}
        {unit.currentDueAt ? (
          <div className="mt-0.5 text-[11px] font-normal text-t4">
            {t("staff.inventory.dueBack", { when: fmtDateTime(unit.currentDueAt ?? undefined) })}
          </div>
        ) : null}
      </td>
      <td className="px-3.5 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={statusTone(unit)}>{t(`staff.inventory.status${unit.status}`)}</Badge>
          {!unit.lendable ? (
            <Badge tone="warn">{t("staff.inventory.withdrawn")}</Badge>
          ) : null}
        </div>
      </td>
      <td className="px-3.5 py-2 text-t2">
        {unit.condition ? t(`staff.inspection.cond${unit.condition}`) : "-"}
        {unit.conditionNote ? (
          <div className="mt-0.5 max-w-[18rem] truncate text-[11px] text-t3" title={unit.conditionNote}>
            {unit.conditionNote}
          </div>
        ) : null}
      </td>
      <td className="px-3.5 py-2 text-right">
        {asking ? (
          <div className="flex items-center justify-end gap-2">
            <Input
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("staff.inventory.reasonPlaceholder")}
              className="h-8 w-48"
            />
            <Button type="button" size="sm" disabled={busy} onClick={() => void toggle()}>
              {t("staff.inventory.confirm")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setAsking(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || outOnLoan}
            title={outOnLoan ? t("staff.inventory.outOnLoanHint") : undefined}
            onClick={() => setAsking(true)}
          >
            {unit.lendable ? t("staff.inventory.withdraw") : t("staff.inventory.restore")}
          </Button>
        )}
        {error ? (
          <div className="mt-1 text-[11px] text-[var(--s-warn-t)]">{error}</div>
        ) : null}
      </td>
    </tr>
  );
}

function statusTone(unit: ManagedUnit): BadgeTone {
  if (unit.status === "Missing") return "warn";
  if (unit.status === "Lended") return "info";
  return unit.lendable ? "ok" : "neutral";
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="text-xs text-t3">{label}</div>
      <div className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={[
        "border-b border-border px-3.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.03em] text-t3",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </th>
  );
}
