import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { getErrorMessage } from "@/lib/error-messages";
import { useManagedItems } from "../inventory/use-inventory";
import {
  useDepartmentUsers,
  useSetUserBan,
  type DepartmentUser,
} from "../users/department-users";
import { DepartmentUserTable } from "../users/department-user-table";
import {
  useAuthorityRoles,
  useEligibility,
  useManagementGroups,
  useSetEligibility,
} from "./use-eligibility";
import type { EligibilityRule } from "./permissions.types";

/** Default ban length, matching the server's own default for `days`. */
const DEFAULT_BAN_DAYS = 30;

type PermissionsView = "bans" | "eligibility";

/**
 * Borrowing bans.
 *
 * A ban stops new requests; it does not lock the account out. Someone banned
 * can still sign in and see what they owe, which is the point - taking away
 * the screen that explains the sanction makes it harder to resolve. Disabling
 * an account outright is `admin.setUserActive` and stays with admins.
 *
 * A reason is asked for before the ban, not after: it goes on the record the
 * borrower eventually reads.
 */
export default function StaffPermissionsPage() {
  const { t } = useTranslation();
  const [view, setView] = useState<PermissionsView>("bans");
  const [q, setQ] = useState("");
  const { data: users, isLoading } = useDepartmentUsers(q);
  const setBan = useSetUserBan();

  const [editing, setEditing] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function apply(user: DepartmentUser, banned: boolean) {
    setResult(null);
    try {
      await setBan.mutateAsync({
        id: user.id,
        banned,
        reason: reason.trim() || undefined,
        days: DEFAULT_BAN_DAYS,
      });
      setResult({
        tone: "ok",
        text: banned
          ? t("staff.permissions.doneBanned", {
              who: `${user.firstName} ${user.lastName}`,
              days: DEFAULT_BAN_DAYS,
            })
          : t("staff.permissions.doneLifted", {
              who: `${user.firstName} ${user.lastName}`,
            }),
      });
      setEditing(null);
      setReason("");
    } catch (e) {
      setResult({ tone: "bad", text: getErrorMessage(e) });
    }
  }

  return (
    <div>
      <PageHeader title={t("nav.permissions")} subtitle={t("staff.permissions.subtitle")} />

      <div className="mb-4">
        <Segmented<PermissionsView>
          value={view}
          onChange={setView}
          options={[
            { value: "bans", label: t("staff.permissions.viewBans") },
            { value: "eligibility", label: t("staff.permissions.viewEligibility") },
          ]}
        />
      </div>

      {view === "eligibility" ? (
        <EligibilityPanel />
      ) : (
        <>
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

      <DepartmentUserTable
        users={users ?? []}
        isLoading={isLoading}
        q={q}
        onSearch={setQ}
        action={(u) => {
          const busy = setBan.isPending;
          const banned = u.status === "suspended";

          if (banned) {
            return (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void apply(u, false)}
              >
                {t("staff.permissions.lift")}
              </Button>
            );
          }

          if (editing === u.id) {
            return (
              <div className="flex items-center justify-end gap-2">
                <Input
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("staff.permissions.reasonPlaceholder")}
                  className="h-8 w-52"
                />
                <Button type="button" size="sm" disabled={busy} onClick={() => void apply(u, true)}>
                  {t("staff.permissions.confirmBan", { days: DEFAULT_BAN_DAYS })}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setReason("");
                  }}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            );
          }

          return (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setEditing(u.id);
                setReason("");
              }}
            >
              {t("staff.permissions.ban")}
            </Button>
          );
        }}
      />
        </>
      )}
    </div>
  );
}

/**
 * Who may borrow which catalogue type (proposal §5.9 "กำหนดสิทธิ์การยืม").
 *
 * A rule set belongs to a type but the server keys it per unit, so saving
 * always sends the complete array for the type - an empty save closes it to
 * everyone, which is a real thing staff want and the reason there is no
 * partial "add one rule" call.
 */
function EligibilityPanel() {
  const { t } = useTranslation();
  const { data: items, isLoading: itemsLoading } = useManagedItems();
  const { data: groups } = useManagementGroups();
  const { data: roles } = useAuthorityRoles();

  const [itemKey, setItemKey] = useState<number | null>(null);
  const { data: savedRules, isLoading: rulesLoading } = useEligibility(itemKey);
  const setEligibility = useSetEligibility();

  const [draft, setDraft] = useState<EligibilityRule[]>([]);
  const [groupKey, setGroupKey] = useState<number | "">("");
  const [roleKey, setRoleKey] = useState<number | "">("");
  const [result, setResult] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  // The draft mirrors what the server has whenever the type changes or a fresh
  // load comes in - editing never starts from stale rules.
  useEffect(() => {
    setDraft(savedRules ?? []);
    setResult(null);
  }, [itemKey, savedRules]);

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
    if (itemKey === null) return;
    setResult(null);
    try {
      await setEligibility.mutateAsync({
        itemKey,
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
        <label className="text-xs font-medium text-t3" htmlFor="eligibility-item">
          {t("staff.permissions.pickType")}
        </label>
        <select
          id="eligibility-item"
          className="h-9 max-w-xs rounded-md border border-border bg-card px-3 text-sm text-foreground"
          value={itemKey ?? ""}
          disabled={itemsLoading}
          onChange={(e) => setItemKey(e.target.value === "" ? null : Number(e.target.value))}
        >
          <option value="">{t("staff.permissions.pickTypePlaceholder")}</option>
          {(items ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name ?? "-"}
            </option>
          ))}
        </select>
      </div>

      {itemKey === null ? (
        <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-t3">
          {t("staff.permissions.pickTypeHint")}
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
              {t("staff.permissions.noRules")}
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
                    {r.appliesToUnits > 0 ? (
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
