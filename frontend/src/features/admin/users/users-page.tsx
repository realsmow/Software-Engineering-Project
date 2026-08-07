import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Download, Plus, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Modal, SlideOver } from "@/components/ui/modal";
import { ChartCard } from "@/components/ui/chart-card";
import { ChartTooltip, CHART_SERIES, axisProps, gridProps } from "@/components/ui/chart-kit";
import type { Role } from "@/types/domain";
import {
  ADMIN_USERS,
  FACULTIES,
  TOP_ACTIVE_USERS,
  departmentsByFaculty,
  deptName,
  initials,
  type AccountStatus,
  type AdminUser,
  type AuthMethod,
} from "../mock-data";
import { fmtDate, fmtDateTime } from "../format";

const ACTIVITY_ROLE_ORDER: Role[] = ["borrower", "staff", "supervisor", "admin"];

const ROLE_TONE: Record<Role, BadgeTone> = {
  borrower: "neutral",
  staff: "info",
  supervisor: "warn",
  admin: "ok",
};
const STATUS_TONE: Record<AccountStatus, BadgeTone> = {
  active: "ok",
  suspended: "alert",
  invited: "warn",
};
const ROLES: Role[] = ["borrower", "staff", "supervisor", "admin"];
const STATUSES: AccountStatus[] = ["active", "suspended", "invited"];

interface NewUserForm {
  name: string;
  email: string;
  role: Role;
  facultyId: string;
  departmentId: string;
  auth: AuthMethod;
}

const EMPTY_FORM: NewUserForm = {
  name: "",
  email: "",
  role: "borrower",
  facultyId: "eng",
  departmentId: "cpe",
  auth: "local",
};

function UserKvRow({ label, mono, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={`text-right text-sm text-foreground${mono ? " font-mono" : ""}`}>{children}</div>
    </div>
  );
}

export default function AdminUsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUser[]>(ADMIN_USERS);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">("all");
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<NewUserForm>(EMPTY_FORM);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.govId.toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter, statusFilter]);

  const roleLabel = (r: Role) => t(`nav.${r}`);
  const statusLabel = (s: AccountStatus) =>
    t(`admin.users.status${s.charAt(0).toUpperCase() + s.slice(1)}`);

  const setStatus = (id: string, status: AccountStatus) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, status } : u)));
    setSelected((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
  };
  const setRole = (id: string, role: Role) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    setSelected((prev) => (prev && prev.id === id ? { ...prev, role } : prev));
  };

  const submitCreate = () => {
    if (!form.name.trim() || !form.email.trim()) return;
    const id = `u-${Math.floor(1000 + Math.random() * 8999)}`;
    const created: AdminUser = {
      id,
      name: form.name.trim(),
      email: form.email.trim(),
      govId: "-",
      role: form.role,
      departmentId: form.departmentId,
      auth: form.auth,
      status: "invited",
      lastActiveAt: "-",
      createdAt: new Date().toISOString(),
    };
    setUsers((prev) => [created, ...prev]);
    setCreateOpen(false);
    setForm(EMPTY_FORM);
  };

  const exportCsv = () => {
    const header = ["id", "name", "email", "govId", "role", "department", "auth", "status"];
    const lines = filtered.map((u) =>
      [u.id, u.name, u.email, u.govId, u.role, deptName(u.departmentId), u.auth, u.status]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ulms-users.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: Column<AdminUser>[] = [
    {
      key: "user",
      header: t("admin.users.colUser"),
      render: (u) => (
        <div className="u-cell">
          <div className={`u-avatar${u.role === "borrower" ? " gray" : ""}`}>{initials(u.name)}</div>
          <div className="u-meta">
            <div className="u-name">{u.name}</div>
            <div className="u-sub">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: t("admin.users.colRole"),
      render: (u) => <Badge tone={ROLE_TONE[u.role]}>{roleLabel(u.role)}</Badge>,
    },
    {
      key: "dept",
      header: t("admin.users.colDept"),
      render: (u) => <span className="t-strong">{deptName(u.departmentId)}</span>,
    },
    {
      key: "auth",
      header: t("admin.users.colAuth"),
      render: (u) => (
        <span className="t-muted">
          {u.auth === "ku" ? t("admin.users.authKu") : t("admin.users.authLocal")}
        </span>
      ),
    },
    {
      key: "status",
      header: t("admin.users.colStatus"),
      render: (u) => (
        <Badge tone={STATUS_TONE[u.status]} dot>
          {statusLabel(u.status)}
        </Badge>
      ),
    },
    {
      key: "lastActive",
      header: t("admin.users.colLastActive"),
      align: "right",
      render: (u) => <span className="mono t-muted">{fmtDateTime(u.lastActiveAt)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("admin.users.title")}
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus size={15} strokeWidth={2} />
            {t("admin.users.createUser")}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search
            size={15}
            strokeWidth={2}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("table.searchPlaceholder")}
            aria-label={t("common.search")}
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as Role | "all")}>
          <SelectTrigger className="w-48" aria-label={t("admin.users.filterRole")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("admin.users.filterRole")}: {t("table.filterAll")}
            </SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {roleLabel(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AccountStatus | "all")}>
          <SelectTrigger className="w-48" aria-label={t("admin.users.filterStatus")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("admin.users.filterStatus")}: {t("table.filterAll")}
            </SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto" />
        <Button type="button" variant="outline" onClick={exportCsv}>
          <Download size={15} strokeWidth={2} />
          {t("common.export")}
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(u) => u.id}
        onRowClick={setSelected}
        pageSize={10}
        emptyTitle={t("table.empty")}
        emptyDescription={t("table.emptyDesc")}
        rangeLabel={(s, e, total) => t("table.range", { start: s, end: e, total })}
      />

      <div className="mt-4">
        <ChartCard title={t("admin.charts.topUsers")} height={260}>
          <BarChart
            data={TOP_ACTIVE_USERS}
            layout="vertical"
            margin={{ top: 6, right: 16, left: 8, bottom: 0 }}
          >
            <CartesianGrid {...gridProps} horizontal={false} vertical />
            <XAxis type="number" {...axisProps} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={150}
              {...axisProps}
              tick={{ fill: "var(--s-t3)", fontSize: 11 }}
            />
            <Tooltip content={<ChartTooltip unit={` ${t("admin.charts.actions")}`} />} cursor={{ fill: "var(--s-inset)", opacity: 0.5 }} />
            <Bar dataKey="actions" name={t("admin.charts.actions")} radius={[0, 3, 3, 0]} maxBarSize={22}>
              {TOP_ACTIVE_USERS.map((u) => (
                <Cell
                  key={u.name}
                  fill={CHART_SERIES[ACTIVITY_ROLE_ORDER.indexOf(u.role) % CHART_SERIES.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartCard>
      </div>

      {/* Detail slide-over */}
      <SlideOver
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        subtitle={selected ? t("admin.users.detailTitle") : undefined}
        footer={
          selected ? (
            <>
              {selected.status === "active" ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setStatus(selected.id, "suspended")}
                >
                  {t("admin.users.deactivate")}
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => setStatus(selected.id, "active")}>
                  {t("admin.users.activate")}
                </Button>
              )}
              <Button type="button" onClick={() => setSelected(null)}>
                {t("common.close")}
              </Button>
            </>
          ) : undefined
        }
      >
        {selected ? (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <div
                className={`u-avatar${selected.role === "borrower" ? " gray" : ""}`}
                style={{ width: 42, height: 42, fontSize: 14 }}
              >
                {initials(selected.name)}
              </div>
              <div className="flex flex-col">
                <div className="text-[15px] font-semibold text-foreground">{selected.name}</div>
                <div className="text-xs text-muted-foreground">{selected.email}</div>
              </div>
              <div className="ml-auto">
                <Badge tone={STATUS_TONE[selected.status]} dot>
                  {statusLabel(selected.status)}
                </Badge>
              </div>
            </div>

            <div className="flex flex-col divide-y divide-border">
              <UserKvRow label={t("admin.users.userId")} mono>{selected.id}</UserKvRow>
              <UserKvRow label={t("admin.users.studentId")} mono>{selected.govId}</UserKvRow>
              <UserKvRow label={t("common.department")}>{deptName(selected.departmentId)}</UserKvRow>
              <UserKvRow label={t("admin.users.colAuth")}>
                {selected.auth === "ku" ? t("admin.users.authKu") : t("admin.users.authLocal")}
              </UserKvRow>
              <UserKvRow label={t("common.createdAt")} mono>{fmtDate(selected.createdAt)}</UserKvRow>
              <UserKvRow label={t("admin.users.colLastActive")} mono>
                {fmtDateTime(selected.lastActiveAt)}
              </UserKvRow>
            </div>

            <div className="mt-5 flex flex-col gap-1.5">
              <Label>{t("admin.users.changeRole")}</Label>
              <Select value={selected.role} onValueChange={(v) => setRole(selected.id, v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="button" variant="outline" className="mt-3 w-full">
              {t("admin.users.resetPassword")}
            </Button>
          </div>
        ) : null}
      </SlideOver>

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("admin.users.createUserTitle")}
        subtitle={t("admin.users.createUserSub")}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!form.name.trim() || !form.email.trim()}
              onClick={submitCreate}
            >
              {t("admin.users.createSubmit")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>
              {t("admin.users.fullName")}
              <span className="text-[var(--s-alert-t)]">*</span>
            </Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t("admin.users.namePlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>
              {t("common.email")}
              <span className="text-[var(--s-alert-t)]">*</span>
            </Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="name@ku.th"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("common.role")}</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {roleLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("admin.users.faculty")}</Label>
              <Select
                value={form.facultyId}
                disabled={FACULTIES.length <= 1}
                onValueChange={(facultyId) => {
                  // Reset department to the first one within the chosen faculty.
                  const first = departmentsByFaculty(facultyId)[0]?.id ?? "";
                  setForm({ ...form, facultyId, departmentId: first });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FACULTIES.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("common.department")}</Label>
              <Select
                value={form.departmentId}
                onValueChange={(v) => setForm({ ...form, departmentId: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {departmentsByFaculty(form.facultyId).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("admin.users.authMethod")}</Label>
            <Select value={form.auth} onValueChange={(v) => setForm({ ...form, auth: v as AuthMethod })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">{t("admin.users.authLocal")}</SelectItem>
                <SelectItem value="ku">{t("admin.users.authKu")}</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">{t("admin.users.createUserSub")}</div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
