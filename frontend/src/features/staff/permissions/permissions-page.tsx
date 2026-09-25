import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-messages";
import { useManagedItems, useManagedRooms } from "../inventory/use-inventory";
import {
  useAuthorityRoles,
  useEligibility,
  useManagementGroups,
  useSetEligibility,
} from "./use-eligibility";
import type { EligibilityRule, EligibilityTarget } from "./permissions.types";

/**
 * Who may borrow what (Eligibility rows), per equipment type or room.
 *
 * There is no borrowing ban: penalties limit a borrower through the credit band
 * (FR-CRD-08), and switching an account off is `admin.setUserActive`.
 */
export default function StaffPermissionsPage() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t("nav.permissions")} subtitle={t("staff.permissions.subtitle")} />
      <EligibilityPanel />
    </div>
  );
}

/** The picker's option value, "type:7" or "room:1": a type and a room can share a key. */
function targetValue(target: EligibilityTarget | null): string {
  if (target === null) return "";
  return "roomKey" in target ? `room:${target.roomKey}` : `type:${target.itemKey}`;
}

function parseTargetValue(value: string): EligibilityTarget | null {
  const [kind, key] = value.split(":");
  if (kind === "type") return { itemKey: Number(key) };
  if (kind === "room") return { roomKey: Number(key) };
  return null;
}

/**
 * Who may borrow which catalogue type, or book which room (proposal §5.9
 * "กำหนดสิทธิ์การยืม").
 *
 * A rule set belongs to a type but the server keys it per unit, so saving
 * always sends the complete array for the type - an empty save closes it to
 * everyone, which is a real thing staff want and the reason there is no
 * partial "add one rule" call. A room is a single resource with the same
 * semantics, and one with no rules cannot be booked at all.
 */
function EligibilityPanel() {
  const { t } = useTranslation();
  const { data: items, isLoading: itemsLoading } = useManagedItems();
  const { data: rooms, isLoading: roomsLoading } = useManagedRooms();
  const { data: groups } = useManagementGroups();
  const { data: roles } = useAuthorityRoles();

  const [target, setTarget] = useState<EligibilityTarget | null>(null);
  const isRoom = target !== null && "roomKey" in target;
  const { data: savedRules, isLoading: rulesLoading } = useEligibility(target);
  const setEligibility = useSetEligibility();

  const [draft, setDraft] = useState<EligibilityRule[]>([]);
  const [groupKey, setGroupKey] = useState<number | "">("");
  const [roleKey, setRoleKey] = useState<number | "">("");
  const [result, setResult] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  // The draft mirrors what the server has whenever the target changes or a
  // fresh load comes in - editing never starts from stale rules.
  useEffect(() => {
    setDraft(savedRules ?? []);
    setResult(null);
  }, [target, savedRules]);

  const dirty =
    draft.length !== (savedRules ?? []).length ||
    draft.some((r, i) => {
      const s = (savedRules ?? [])[i];
      return !s || s.groupKey !== r.groupKey || s.authorityRoleKey !== r.authorityRoleKey;
    });

  function addRule() {
    if (groupKey === "" || roleKey === "") return;
    if (draft.some((r) => r.groupKey === groupKey && r.authorityRoleKey === roleKey)) return;

    const group = groups?.find((g) => g.id === groupKey);
    const role = roles?.find((r) => r.authorityRoleKey === roleKey);
    setDraft((d) => [
      ...d,
      {
        groupKey,
        groupName: group?.name ?? null,
        authorityRoleKey: roleKey,
        authorityRoleName: role?.name ?? "",
        appliesToUnits: 0,
      },
    ]);
    setGroupKey("");
    setRoleKey("");
  }

  function removeRule(rule: EligibilityRule) {
    setDraft((d) =>
      d.filter((r) => !(r.groupKey === rule.groupKey && r.authorityRoleKey === rule.authorityRoleKey)),
    );
  }

  async function save() {
    if (target === null) return;
    setResult(null);
    try {
      await setEligibility.mutateAsync({
        ...target,
        rules: draft.map((r) => ({ groupKey: r.groupKey, authorityRoleKey: r.authorityRoleKey })),
      });
      setResult({ tone: "ok", text: t("staff.permissions.eligibilitySaved") });
    } catch (e) {
      setResult({ tone: "bad", text: getErrorMessage(e) });
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-t3" htmlFor="eligibility-target">
          {t("staff.permissions.pickTarget")}
        </label>
        <select
          id="eligibility-target"
          className="h-9 max-w-xs rounded-md border border-border bg-card px-3 text-sm text-foreground"
          value={targetValue(target)}
          disabled={itemsLoading || roomsLoading}
          onChange={(e) => setTarget(parseTargetValue(e.target.value))}
        >
          <option value="">{t("staff.permissions.pickTargetPlaceholder")}</option>
          {items && items.length > 0 ? (
            <optgroup label={t("staff.permissions.groupTypes")}>
              {items.map((item) => (
                <option key={item.id} value={targetValue({ itemKey: item.id })}>
                  {item.name ?? "-"}
                </option>
              ))}
            </optgroup>
          ) : null}
          {rooms && rooms.length > 0 ? (
            <optgroup label={t("staff.permissions.groupRooms")}>
              {rooms.map((room) => (
                <option key={room.roomKey} value={targetValue({ roomKey: room.roomKey })}>
                  {room.name ?? "-"}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </div>

      {target === null ? (
        <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-t3">
          {t("staff.permissions.pickTargetHint")}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          {result ? (
            <div
              role="status"
              className={
                result.tone === "ok"
                  ? "m-3.5 mb-0 rounded border border-[var(--s-ok-b)] bg-[var(--s-ok-bg)] px-3 py-2 text-[13px] leading-relaxed text-[var(--s-ok-t)]"
                  : "m-3.5 mb-0 rounded border border-[var(--s-warn-b)] bg-[var(--s-warn-bg)] px-3 py-2 text-[13px] leading-relaxed text-[var(--s-warn-t)]"
              }
            >
              {result.text}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-3">
            <select
              className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground"
              value={groupKey}
              onChange={(e) => setGroupKey(e.target.value === "" ? "" : Number(e.target.value))}
              aria-label={t("staff.permissions.colGroup")}
            >
              <option value="">{t("staff.permissions.pickGroup")}</option>
              {(groups ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name ?? "-"}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground"
              value={roleKey}
              onChange={(e) => setRoleKey(e.target.value === "" ? "" : Number(e.target.value))}
              aria-label={t("staff.permissions.colRole")}
            >
              <option value="">{t("staff.permissions.pickRole")}</option>
              {(roles ?? []).map((r) => (
                <option key={r.authorityRoleKey} value={r.authorityRoleKey}>
                  {r.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={groupKey === "" || roleKey === ""}
              onClick={addRule}
            >
              {t("staff.permissions.addRule")}
            </Button>
          </div>

          {rulesLoading ? (
            <div className="px-3.5 py-8 text-center text-sm text-t3">{t("common.loading")}</div>
          ) : draft.length === 0 ? (
            <div className="px-3.5 py-8 text-center text-sm text-t3">
              {isRoom ? t("staff.permissions.noRoomRules") : t("staff.permissions.noRules")}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {draft.map((r) => (
                <li
                  key={`${r.groupKey}-${r.authorityRoleKey}`}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm text-foreground">
                      {r.groupName ?? t("staff.permissions.unknownGroup")}
                    </span>
                    <Badge tone="neutral">{r.authorityRoleName}</Badge>
                    {!isRoom && r.appliesToUnits > 0 ? (
                      <span className="text-[11px] text-t4">
                        {t("staff.permissions.appliesToUnits", { count: r.appliesToUnits })}
                      </span>
                    ) : null}
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => removeRule(r)}>
                    {t("staff.permissions.removeRule")}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border px-3.5 py-3">
            <Button
              type="button"
              size="sm"
              disabled={!dirty || setEligibility.isPending}
              onClick={() => void save()}
            >
              {setEligibility.isPending ? t("common.loading") : t("staff.permissions.saveRules")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
