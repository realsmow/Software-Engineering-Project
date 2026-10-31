import { cap } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { AccountStatus, DepartmentUser } from "./department-users";

const STATUS_TONE: Record<AccountStatus, BadgeTone> = {
  active: "ok",
  disabled: "neutral",
};

/**
 * The department roster.
 */
export function DepartmentUserTable({
  users,
  isLoading,
  q,
  onSearch,
  action,
}: {
  users: DepartmentUser[];
  isLoading: boolean;
  q: string;
  onSearch: (next: string) => void;
  /** Rendered in the last cell. Omit for a read-only directory. */
  action?: (user: DepartmentUser) => React.ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3.5 py-2.5">
        <Input
          type="search"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t("staff.users.searchPlaceholder")}
          className="max-w-sm"
        />
      </div>

      {isLoading ? (
        <div className="px-3.5 py-10 text-center text-sm text-t3">{t("common.loading")}</div>
      ) : users.length === 0 ? (
        <div className="px-3.5 py-10 text-center">
          <div className="text-sm font-semibold text-foreground">
            {t("staff.users.emptyTitle")}
          </div>
          <p className="mt-1 text-xs text-t3">{t("staff.users.emptyDesc")}</p>
        </div>
      ) : (
        // The frame clips, so the table needs its own scroller: without it the
        // status column and the ban control were cut off below about 400px,
        // with no way to reach them. Relative, so the hidden "actions" header
        // label is positioned inside the scroller instead of widening the page.
        // Below sm each row is a small card, so the controls need no sideways swipe.
        <div className="relative overflow-x-auto">
        <table className="w-full border-collapse text-[13px] max-sm:block sm:min-w-[32rem]">
          <thead className="max-sm:hidden">
            <tr className="bg-secondary">
              <Th>{t("staff.users.colPerson")}</Th>
              <Th>{t("staff.users.colRole")}</Th>
              <Th>{t("staff.users.colCredit")}</Th>
              <Th>{t("common.status")}</Th>
              {action ? (
                <Th className="text-right">
                  {/* No visible title; named for screen readers (#226). */}
                  <span className="sr-only">{t("common.actions")}</span>
                </Th>
              ) : null}
            </tr>
          </thead>
          <tbody className="max-sm:block">
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-b-0 max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-1.5 max-sm:px-3.5 max-sm:py-2.5">
                <td className="px-3.5 py-2 max-sm:w-full max-sm:p-0">
                  <div className="text-foreground">
                    {u.firstName} {u.lastName}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-t4 max-sm:break-all">
                    {u.studentId} · {u.email}
                  </div>
                </td>
                <td className="px-3.5 py-2 text-t2 max-sm:p-0">{t(`nav.${u.role}`)}</td>
                <td className="px-3.5 py-2 font-mono tabular-nums text-t2 max-sm:p-0">
                  {/* The column heading is hidden on a phone, and a bare number says nothing. */}
                  <span className="font-sans sm:hidden">{t("staff.users.colCredit")} </span>
                  {u.creditScore}
                </td>
                <td className="px-3.5 py-2 max-sm:p-0">
                  <Badge tone={STATUS_TONE[u.status]}>
                    {t(`staff.users.status${cap(u.status)}`)}
                  </Badge>
                </td>
                {action ? (
                  <td className="px-3.5 py-2 text-right max-sm:ml-auto max-sm:p-0">{action(u)}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
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
