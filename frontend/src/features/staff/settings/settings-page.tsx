import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shared/page-header";
import { TierDot } from "@/components/shared/tier-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/error-messages";
import type { Tier } from "@/types/domain";
import { useLendingSettings, useUpdateLendingSettings } from "./use-lending-settings";
import {
  PENALTY_REASONS,
  type BorrowRuleSetting,
  type PenaltyReason,
} from "./settings.types";

/**
 * Lending rules (SRS FR-AUTH-05: a department sets the rules for its own kit).
 *
 * This is the T-tier x D-band matrix the rest of the system reads. The row for
 * (this item's tier, this borrower's credit band) is what `credit.me` resolves
 * to answer "how many days may I keep it", so a number changed here moves the
 * cap on every borrower's request screen.
 *
 * Because of that reach, nothing here saves on its own. Edits are held locally
 * until the rule's own Save is pressed, and one rule is sent at a time: the
 * API upserts the rows it is given and leaves the rest alone, so two people
 * editing different tiers do not overwrite each other.
 */
export default function LendingSettingsPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useLendingSettings();
  const save = useUpdateLendingSettings();
  const [result, setResult] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-t3">{t("common.loading")}</div>;
  }

  if (!data || data.borrowRules.length === 0) {
    return (
      <div>
        <PageHeader title={t("nav.lendingSettings")} subtitle={t("staff.settings.subtitle")} />
        <div className="rounded-lg border border-border bg-card px-4 py-10 text-center">
          <div className="text-sm font-semibold text-foreground">
            {t("staff.settings.emptyTitle")}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-t3">{t("staff.settings.emptyDesc")}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t("nav.lendingSettings")} subtitle={t("staff.settings.subtitle")} />

      <p className="mb-4 rounded border border-border bg-secondary px-3 py-2 text-xs leading-relaxed text-t2">
        {t("staff.settings.reachNote")}
      </p>

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

      <div className="flex flex-col gap-4">
        {data.borrowRules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            saving={save.isPending}
            onSave={async (input) => {
              setResult(null);
              try {
                await save.mutateAsync(input);
                setResult({
                  tone: "ok",
                  text: t("staff.settings.saved", { rule: rule.name ?? `#${rule.id}` }),
                });
              } catch (error) {
                setResult({ tone: "bad", text: getErrorMessage(error) });
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** One borrow rule: its credit-band matrix and its penalty table. */
function RuleCard({
  rule,
  saving,
  onSave,
}: {
  rule: BorrowRuleSetting;
  saving: boolean;
  onSave: (input: {
    borrowRuleKey: number;
    constraints: { creditTierKey: number; maxBorrowDays: number; maxExtendTimes: number }[];
    penalties: { reason: PenaltyReason; amount: number; lengthDays: number }[];
  }) => Promise<void>;
}) {
  const { t } = useTranslation();

  // Local until Save. Re-seeded whenever the server sends a new version, so a
  // save elsewhere is picked up instead of being masked by stale local state.
  const [days, setDays] = useState<Record<number, number>>({});
  const [extends_, setExtends] = useState<Record<number, number>>({});
  const [penalties, setPenalties] = useState<Record<string, { amount: number; lengthDays: number }>>({});

  useEffect(() => {
    setDays(Object.fromEntries(rule.constraints.map((c) => [c.creditTierKey, c.maxBorrowDays])));
    setExtends(Object.fromEntries(rule.constraints.map((c) => [c.creditTierKey, c.maxExtendTimes])));
    setPenalties(
      Object.fromEntries(
        rule.penalties.map((p) => [p.reason, { amount: p.amount, lengthDays: p.lengthDays }]),
      ),
    );
  }, [rule]);

  const tier = isTier(rule.name) ? rule.name : null;
  const dirty =
    rule.constraints.some(
      (c) =>
        days[c.creditTierKey] !== c.maxBorrowDays ||
        extends_[c.creditTierKey] !== c.maxExtendTimes,
    ) ||
    rule.penalties.some(
      (p) =>
        penalties[p.reason]?.amount !== p.amount ||
        penalties[p.reason]?.lengthDays !== p.lengthDays,
    );

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <TierDot tier={tier} />
          {rule.name ?? t("staff.settings.unnamedRule", { id: rule.id })}
          {tier ? (
            <span className="font-normal text-t3">· {t(`borrower.catalog.tierNote${tier}`)}</span>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving}
          onClick={() =>
            void onSave({
              borrowRuleKey: rule.id,
              constraints: rule.constraints.map((c) => ({
                creditTierKey: c.creditTierKey,
                maxBorrowDays: days[c.creditTierKey] ?? c.maxBorrowDays,
                maxExtendTimes: extends_[c.creditTierKey] ?? c.maxExtendTimes,
              })),
              penalties: rule.penalties.map((p) => ({
                reason: p.reason,
                amount: penalties[p.reason]?.amount ?? p.amount,
                lengthDays: penalties[p.reason]?.lengthDays ?? p.lengthDays,
              })),
            })
          }
        >
          {saving ? t("common.loading") : t("staff.settings.save")}
        </Button>
      </div>

      {rule.constraints.length === 0 ? (
        <p className="px-3.5 py-4 text-xs text-t3">{t("staff.settings.noConstraints")}</p>
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-secondary">
              <Th>{t("staff.settings.colBand")}</Th>
              <Th className="text-right">{t("staff.settings.colDays")}</Th>
              <Th className="text-right">{t("staff.settings.colExtends")}</Th>
              <Th className="text-right">{t("staff.settings.colAuthority")}</Th>
            </tr>
          </thead>
          <tbody>
            {rule.constraints.map((c) => (
              <tr key={c.creditTierKey} className="border-b border-border last:border-b-0">
                <td className="px-3.5 py-2 font-mono text-xs text-foreground">
                  {c.creditTierName ?? `#${c.creditTierKey}`}
                </td>
                <td className="px-3.5 py-2 text-right">
                  <NumField
                    value={days[c.creditTierKey] ?? c.maxBorrowDays}
                    min={1}
                    onChange={(n) => setDays((s) => ({ ...s, [c.creditTierKey]: n }))}
                  />
                </td>
                <td className="px-3.5 py-2 text-right">
                  <NumField
                    value={extends_[c.creditTierKey] ?? c.maxExtendTimes}
                    min={0}
                    onChange={(n) => setExtends((s) => ({ ...s, [c.creditTierKey]: n }))}
                  />
                </td>
                <td className="px-3.5 py-2 text-right font-mono text-xs text-t3">
                  {c.minimumAuthorityLevel ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rule.penalties.length > 0 ? (
        <div className="border-t border-border">
          <div className="px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
            {t("staff.settings.penalties")}
          </div>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-secondary">
                <Th>{t("staff.settings.colReason")}</Th>
                <Th className="text-right">{t("staff.settings.colAmount")}</Th>
                <Th className="text-right">{t("staff.settings.colLength")}</Th>
              </tr>
            </thead>
            <tbody>
              {PENALTY_REASONS.filter((r) => rule.penalties.some((p) => p.reason === r)).map((r) => {
                const row = rule.penalties.find((p) => p.reason === r)!;
                return (
                  <tr key={r} className="border-b border-border last:border-b-0">
                    <td className="px-3.5 py-2 text-foreground">{t(`staff.settings.reason${r}`)}</td>
                    <td className="px-3.5 py-2 text-right">
                      <NumField
                        value={penalties[r]?.amount ?? row.amount}
                        min={0}
                        onChange={(n) =>
                          setPenalties((s) => ({
                            ...s,
                            [r]: { amount: n, lengthDays: s[r]?.lengthDays ?? row.lengthDays },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3.5 py-2 text-right">
                      <NumField
                        value={penalties[r]?.lengthDays ?? row.lengthDays}
                        min={0}
                        onChange={(n) =>
                          setPenalties((s) => ({
                            ...s,
                            [r]: { amount: s[r]?.amount ?? row.amount, lengthDays: n },
                          }))
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function NumField({
  value,
  min,
  onChange,
}: {
  value: number;
  min: number;
  onChange: (n: number) => void;
}) {
  return (
    <Input
      type="number"
      className="ml-auto h-8 w-20 text-right font-mono"
      value={String(value)}
      min={min}
      onChange={(e) => {
        const n = Number(e.target.value);
        // An empty or half-typed box must not send NaN to the server.
        if (Number.isInteger(n) && n >= min) onChange(n);
      }}
    />
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

function isTier(name: string | null): name is Tier {
  return name === "T0" || name === "T1" || name === "T2" || name === "T3";
}
