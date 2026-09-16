import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { th } from "date-fns/locale";
import { Bell, ChevronDown, ChevronRight } from "lucide-react";
import { NavIcon } from "@/components/layout/nav-icon";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { BUSINESS, ROUTES } from "@/constants";
import { useAuthStore } from "@/features/auth/auth.store";
import { MOCK_NOTIFICATIONS, NOTIFICATION_META } from "@/features/notifications/mock-notifications";
import { cn } from "@/lib/utils";
import { STATUS_TAB, type MyRequest, type MyRequestStatus } from "../mock-data";
import { extensionState } from "../loans/extension-rules";
import { useMyRequests } from "../loans/use-my-requests";
import { useSubmittedRequests } from "../loans/submitted-requests.store";

/**
 * Borrower home - what needs attention today, and the two doors out of it.
 *
 * Everything here is a view over `useMyRequests()`, never its own copy of the
 * data: the greeting, the chips, both tables and the due-date colours all read
 * the same list "my requests" reads, so nothing can drift between the two.
 *
 * There is no "return item" action. Returning happens at the counter, where
 * staff photograph and inspect the item in the same visit - the borrower has
 * nothing to press here. Extending, on the other hand, is theirs to do.
 */
export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { requests } = useMyRequests();
  const name = useAuthStore((s) => s.user?.name) ?? "";

  const loans = useMemo(
    () =>
      requests
        .filter((r) => r.kind === "equipment" && r.status === "inUse")
        // Soonest deadline first - that is the one the greeting talks about.
        .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)),
    [requests],
  );

  const recent = useMemo(() => requests.slice(0, 5), [requests]);

  const chips = [
    { key: "borrowing", count: loans.length, dot: "var(--accent)" },
    {
      key: "pending",
      count: requests.filter((r) => r.status === "pending").length,
      dot: "var(--accent-orange)",
    },
    {
      key: "booking",
      count: requests.filter((r) => r.kind === "room" && STATUS_TAB[r.status] !== "history").length,
      dot: "var(--accent-blue)",
    },
  ];

  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-4">
        <Greeting name={name} next={loans[0]} chips={chips} />

        <Panel
          title={t("borrower.home.currentLoans")}
          action={
            <Button type="button" size="sm" onClick={() => navigate(ROUTES.CATALOG)}>
              {t("borrower.home.borrowMore")}
            </Button>
          }
        >
          <LoansTable rows={loans} />
          <p className="border-t border-border bg-secondary px-3.5 py-2.5 text-xs leading-relaxed text-t3">
            {t("borrower.home.extendHint", { days: BUSINESS.EXTENSION_DAYS })}
          </p>
        </Panel>

        <Panel
          title={t("borrower.home.recentRequests")}
          action={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate(ROUTES.MY_LOANS)}
            >
              {t("borrower.home.viewAll")}
              <ChevronRight size={14} strokeWidth={2} />
            </Button>
          }
        >
          <RequestsTable rows={recent} />
        </Panel>
      </div>

      <div className="min-w-[280px] flex-[1_1_300px]">
        <NoticesPanel />
      </div>
    </div>
  );
}

interface Chip {
  key: string;
  count: number;
  dot: string;
}

/**
 * The one thing worth saying on arrival, said in a sentence rather than left
 * for the borrower to work out of a table. Which sentence depends on the
 * nearest deadline, so an overdue item can never be phrased as "nothing urgent".
 */
function Greeting({ name, next, chips }: { name: string; next?: MyRequest; chips: Chip[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const left = next?.daysLeft ?? 0;
  const overdue = next !== undefined && left < 0;
  const soon = next !== undefined && left >= 0 && left <= 1;

  const titleKey = next === undefined
    ? "borrower.home.titleNone"
    : overdue
      ? "borrower.home.titleOverdue"
      : soon
        ? "borrower.home.titleDue"
        : "borrower.home.titleCalm";

  const body = next === undefined
    ? t("borrower.home.bodyNone")
    : overdue
      ? t("borrower.home.bodyOverdue", {
          name: next.name,
          serial: next.serial,
          count: Math.abs(left),
        })
      : t("borrower.home.bodyNext", {
          name: next.name,
          serial: next.serial,
          date: fmtDay(next.dueAt ?? next.endDate),
        });

  return (
    <section className="rounded-lg border border-border bg-card px-4 py-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-[260px] flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-t3">
            {t("borrower.home.greet", { name })}
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{t(titleKey)}</h1>
          <p
            className={cn(
              "mt-1.5 text-[13px] leading-relaxed",
              overdue ? "text-[var(--s-alert-t)]" : soon ? "text-[var(--s-warn-t)]" : "text-t3",
            )}
          >
            {body}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" className="h-10 px-5" onClick={() => navigate(ROUTES.CATALOG)}>
            {t("borrower.home.borrowMore")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 px-5"
            onClick={() => navigate(ROUTES.MY_LOANS)}
          >
            {t("borrower.home.myRequests")}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <span
            key={c.key}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border px-3 py-1 text-[13px] text-t2"
          >
            <span
              className="h-[7px] w-[7px] rounded-full"
              style={{ background: c.dot }}
              aria-hidden
            />
            {t(`borrower.home.q${c.key.charAt(0).toUpperCase()}${c.key.slice(1)}`, {
              count: c.count,
            })}
          </span>
        ))}
      </div>
    </section>
  );
}

function LoansTable({ rows }: { rows: MyRequest[] }) {
  const { t } = useTranslation();

  if (rows.length === 0) {
    return <p className="px-3.5 py-8 text-center text-[13px] text-t3">{t("borrower.home.noLoans")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-secondary">
            <Th>{t("borrower.home.colItem")}</Th>
            <Th nowrap>{t("borrower.home.colDue")}</Th>
            <Th nowrap>{t("borrower.home.colLeft")}</Th>
            <Th nowrap align="right">
              {t("borrower.home.colActions")}
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <LoanRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoanRow({ row }: { row: MyRequest }) {
  const { t } = useTranslation();
  const band = useAuthStore((s) => s.user?.creditBand) ?? "D0";
  const extendLoan = useSubmittedRequests((s) => s.extendLoan);
  const requestExtension = useSubmittedRequests((s) => s.requestExtension);
  const cancelExtensionRequest = useSubmittedRequests((s) => s.cancelExtensionRequest);
  const ext = extensionState(row, band);
  const [asking, setAsking] = useState(false);

  const left = row.daysLeft ?? 0;

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3.5 py-2">
        <div className="font-medium leading-snug text-foreground">{row.name}</div>
        <div className="mt-0.5 font-mono text-[11px] text-t4">{row.serial}</div>
      </td>
      <td className="whitespace-nowrap px-3.5 py-2 font-mono text-xs text-t2">
        {fmtDay(row.dueAt ?? row.endDate)}
      </td>
      <td className="whitespace-nowrap px-3.5 py-2">
        <Badge tone={daysTone(left)}>{daysLabel(t, left)}</Badge>
      </td>
      <td className="whitespace-nowrap px-3.5 py-2 text-right">
        <span className="inline-flex justify-end gap-1.5">
          {/* Shown even when someone else has to grant it: pressing sends the
              request. Only a credit block leaves nothing to press, and then the
              tooltip says why. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={!ext.canExtend && !ext.canRequest}
            title={t(ext.reasonKey, { count: ext.count })}
            onClick={() => (ext.canExtend ? extendLoan(row) : setAsking(true))}
          >
            {t(ext.labelKey)}
          </Button>
          {ext.isPending ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => cancelExtensionRequest(row.id)}
            >
              {t("borrower.myRequests.cancelExt")}
            </Button>
          ) : null}
        </span>

        {/* Same decision as the card on "my requests", in a dialog: a table
            cell has no room for the note explaining what is being agreed to. */}
        <Modal
          open={asking}
          onClose={() => setAsking(false)}
          title={t("borrower.myRequests.extAskTitle")}
          subtitle={`${row.name} · ${row.serial}`}
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
                {t("borrower.myRequests.extAskNo")}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setAsking(false);
                  requestExtension(row, ext.mode === "supervisor" ? "supervisor" : "staff");
                }}
              >
                {t(ext.confirmLabelKey)}
              </Button>
            </>
          }
        >
          <p className="text-[13px] leading-relaxed text-t2">
            {ext.askNoteKey ? t(ext.askNoteKey) : null}
          </p>
        </Modal>
      </td>
    </tr>
  );
}

function RequestsTable({ rows }: { rows: MyRequest[] }) {
  const { t } = useTranslation();

  if (rows.length === 0) {
    return (
      <p className="px-3.5 py-8 text-center text-[13px] text-t3">{t("borrower.home.noRequests")}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-secondary">
            <Th nowrap>{t("borrower.home.colRef")}</Th>
            <Th>{t("borrower.home.colItem")}</Th>
            <Th nowrap>{t("borrower.home.colPeriod")}</Th>
            <Th nowrap>{t("borrower.home.colStatus")}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-b-0">
              <td className="whitespace-nowrap px-3.5 py-2 font-mono text-xs">{row.id}</td>
              <td className="px-3.5 py-2 text-foreground">{row.name}</td>
              <td className="whitespace-nowrap px-3.5 py-2 font-mono text-xs text-t2">
                {fmtRange(row.startDate, row.endDate)}
              </td>
              <td className="whitespace-nowrap px-3.5 py-2">
                <Badge tone={STATUS_TONE[row.status]}>{t(statusKey(row.status))}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The same notifications the topbar bell holds, opened out on arrival - the
 * bell is easy to miss, and this is the screen where noticing matters.
 */
function NoticesPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  const unread = MOCK_NOTIFICATIONS.filter((n) => !n.read).length;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-accent-soft",
          open && "border-b border-border",
        )}
      >
        <Bell size={14} strokeWidth={2} className="shrink-0 text-t3" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-t3">
          {t("borrower.home.notifications")}
        </span>
        <span className="rounded-full bg-accent-soft px-1.5 font-mono text-[11px] font-medium text-accent">
          {unread}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-t3">
          {open ? t("borrower.home.collapse") : t("borrower.home.expand")}
          <ChevronDown
            size={12}
            strokeWidth={2.2}
            className={cn("transition-transform", open && "rotate-180")}
          />
        </span>
      </button>

      {open ? (
        <div className="flex flex-col">
          {MOCK_NOTIFICATIONS.length === 0 ? (
            <p className="px-3.5 py-8 text-center text-[13px] text-t3">
              {t("borrower.home.noNotices")}
            </p>
          ) : (
            MOCK_NOTIFICATIONS.map((n) => {
              const meta = NOTIFICATION_META[n.kind];
              return (
                <button
                  key={n.id}
                  type="button"
                  disabled={!n.route}
                  onClick={() => n.route && navigate(n.route)}
                  className={cn(
                    "flex gap-2.5 border-b border-border px-3.5 py-2.5 text-left last:border-b-0",
                    n.route ? "hover:bg-secondary" : "cursor-default",
                  )}
                >
                  <span className="mt-0.5 shrink-0 text-t3">
                    <NavIcon name={meta.icon} size={14} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[13px] font-medium leading-snug text-foreground">
                        {n.title}
                      </span>
                      {!n.read ? (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-t3">{n.detail}</span>
                    <span className="mt-1 block font-mono text-[11px] text-t4">
                      {fmtDay(n.at)}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </section>
  );
}

/** Card frame with a title bar and an optional action on the right. */
function Panel({
  title,
  action,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2.5">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

function Th({
  children,
  nowrap = false,
  align = "left",
}: {
  children: ReactNode;
  nowrap?: boolean;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "border-b border-border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.03em] text-t3",
        align === "right" ? "text-right" : "text-left",
        nowrap && "whitespace-nowrap",
      )}
    >
      {children}
    </th>
  );
}

const STATUS_TONE: Record<MyRequestStatus, BadgeTone> = {
  pending: "warn",
  approved: "ok",
  preparing: "info",
  ready: "info",
  inUse: "ok",
  returned: "neutral",
  inspecting: "neutral",
  done: "neutral",
  rejected: "alert",
  cancelled: "neutral",
};

function statusKey(status: MyRequestStatus): string {
  return `borrower.myRequests.st${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

/** Red once past due, amber on the last day, plain otherwise. */
function daysTone(left: number): BadgeTone {
  if (left < 0) return "alert";
  if (left <= 1) return "warn";
  return "neutral";
}

function daysLabel(t: (key: string, opts?: Record<string, unknown>) => string, left: number): string {
  if (left < 0) return t("borrower.myRequests.extOverdue", { count: Math.abs(left) });
  if (left === 0) return t("borrower.home.dueToday");
  return t("borrower.myRequests.extDaysLeft", { count: left });
}

/** "12–16 ส.ค." - collapses to one date when start and end match. */
function fmtRange(start: string, end: string): string {
  if (start === end) return fmtDay(end);
  return `${format(parseISO(start), "d", { locale: th })}–${fmtDay(end)}`;
}

function fmtDay(iso: string): string {
  return format(parseISO(iso), "d MMM", { locale: th });
}
