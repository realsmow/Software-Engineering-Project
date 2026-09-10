import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/error-messages";
import {
  useDepartmentUsers,
  useSetUserBan,
  type DepartmentUser,
} from "../users/department-users";
import { DepartmentUserTable } from "../users/department-user-table";

/** Default ban length, matching the server's own default for `days`. */
const DEFAULT_BAN_DAYS = 30;

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
    </div>
  );
}
