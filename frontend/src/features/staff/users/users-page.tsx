import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Award } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { SlideOver } from "@/components/ui/modal";
import { CREDIT_BANDS } from "@/constants";
import { fmtDate } from "@/lib/datetime";
import { useDepartmentUsers, type DepartmentUser } from "./department-users";
import { DepartmentUserTable } from "./department-user-table";
import { useCreditDetail } from "./use-credit-detail";
import { penaltyReasonText } from "@/features/borrower/appeals/penalty-reason";

/**
 * Department directory.
 *
 * Read-only: who is in the department, and their credit record.
 */
export default function StaffUsersPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const { data: users, isLoading } = useDepartmentUsers(q);
  const [viewing, setViewing] = useState<DepartmentUser | null>(null);

  return (
    <div>
      <PageHeader title={t("nav.userMgmt")} subtitle={t("staff.users.subtitle")} />
      <DepartmentUserTable
        users={users ?? []}
        isLoading={isLoading}
        q={q}
        onSearch={setQ}
        action={(u) => (
          <Button type="button" variant="outline" size="sm" onClick={() => setViewing(u)}>
            {t("staff.users.viewCredit")}
          </Button>
        )}
      />
      <CreditDetail user={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

/**
 * One borrower's standing (`credit.getById`), read-only.
 *
 * Renders the same fields as the borrower's own credit card on the profile
 * page - score, band, borrow window, penalties - through the shared adapter,
 * so the two never describe one account differently.
 */
function CreditDetail({ user, onClose }: { user: DepartmentUser | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: credit, isLoading } = useCreditDetail(user?.id ?? null);
  const band = CREDIT_BANDS.find((b) => b.band === credit?.band);

  return (
    <SlideOver
      open={user !== null}
      onClose={onClose}
      title={user ? `${user.firstName} ${user.lastName}` : ""}
      subtitle={user ? `${user.studentId} · ${user.email}` : undefined}
    >
      {isLoading ? (
        <div className="py-8 text-center text-sm text-t3">{t("common.loading")}</div>
      ) : credit ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <Award size={22} className="text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">{t("profile.creditScore")}</div>
                <div className="text-2xl font-semibold tabular-nums text-foreground">
                  {credit.score}
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("profile.creditBand")}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-foreground">
                  {credit.band}
                </span>
                {band ? <span className="text-sm text-muted-foreground">{band.label}</span> : null}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("profile.borrowWindow")}</div>
              <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
                {t("borrower.detail.days", { count: credit.maxBorrowDays })}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("staff.users.maxExtends")}</div>
              <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
                {credit.maxExtendTimes}
              </div>
            </div>
          </div>

          {credit.penalties.length > 0 ? (
            <div className="border-t border-border pt-4">
              <div className="mb-2 text-xs text-muted-foreground">
                {t("profile.activePenalties", {
                  count: credit.penalties.length,
                  total: credit.totalDeducted,
                })}
              </div>
              <ul className="flex flex-col gap-1.5">
                {credit.penalties.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-foreground">
                      {p.reason ? penaltyReasonText(p.reason, t) : t("profile.penaltyNoReason")}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      -{p.creditDeducted} ·{" "}
                      {t("profile.penaltyUntil", { date: fmtDate(p.expiresAt) })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="border-t border-border pt-4 text-sm text-t3">
              {t("staff.users.noPenalties")}
            </p>
          )}
        </div>
      ) : null}
    </SlideOver>
  );
}
