import { useState, type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { getErrorMessage } from "@/lib/error-messages";
import {
  useAdminOrg,
  useCreateFaculty,
  useCreateGroup,
  useDeleteOrg,
  useRenameOrg,
} from "./use-org";

type Notice = { text: string; bad?: boolean } | null;

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <div
      role={notice.bad ? "alert" : "status"}
      className={
        notice.bad
          ? "mt-2 rounded-md border border-[var(--s-warn-b)] bg-[var(--s-warn-bg)] px-3 py-2 text-sm text-[var(--s-warn-t)]"
          : "mt-2 rounded-md border border-[var(--s-ok-b)] bg-[var(--s-ok-bg)] px-3 py-2 text-sm text-[var(--s-ok-t)]"
      }
    >
      {notice.text}
    </div>
  );
}

/** One faculty, department or club, with rename and delete. */
function OrgRow({
  kind,
  id,
  name,
  strong = false,
  onNotice,
}: {
  kind: "faculty" | "group";
  id: number;
  name: string;
  strong?: boolean;
  onNotice: (notice: Notice) => void;
}) {
  const { t } = useTranslation();
  const rename = useRenameOrg(kind);
  const remove = useDeleteOrg(kind);
  const [draft, setDraft] = useState<string | null>(null);
  const fail = (e: unknown) => onNotice({ text: getErrorMessage(e).split("\n")[0], bad: true });

  if (draft !== null) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          aria-label={t("admin.org.name")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8"
        />
        <Button
          type="button"
          size="sm"
          disabled={!draft.trim() || rename.isPending}
          onClick={() =>
            rename.mutate(
              { id, name: draft.trim() },
              {
                onSuccess: () => {
                  setDraft(null);
                  onNotice({ text: t("admin.org.renamed", { name: draft.trim() }) });
                },
                onError: fail,
              },
            )
          }
        >
          {t("common.save")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setDraft(null)}>
          {t("common.cancel")}
        </Button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-1.5">
      <span className={strong ? "text-sm font-medium text-foreground" : "text-[13px] text-foreground"}>
        {name}
      </span>
      <button
        type="button"
        aria-label={t("admin.org.rename", { name })}
        onClick={() => setDraft(name)}
        className="rounded p-1 text-t4 hover:bg-muted hover:text-foreground"
      >
        <Pencil size={12} />
      </button>
      <button
        type="button"
        aria-label={t("admin.org.delete", { name })}
        disabled={remove.isPending}
        onClick={() => {
          if (!window.confirm(t("admin.org.deleteConfirm", { name }))) return;
          remove.mutate(id, {
            onSuccess: () => onNotice({ text: t("admin.org.deleted", { name }) }),
            onError: fail,
          });
        }}
        className="rounded p-1 text-t4 hover:bg-muted hover:text-[var(--s-alert-t)]"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

export default function AdminOrgPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useAdminOrg();
  const createFaculty = useCreateFaculty();
  const createGroup = useCreateGroup();
  const faculties = data?.faculties ?? [];
  const groups = data?.groups ?? [];
  const clubs = groups.filter((g) => g.facultyId === null);

  const [facultyName, setFacultyName] = useState("");
  const [deptName, setDeptName] = useState("");
  const [deptFaculty, setDeptFaculty] = useState("");
  const [clubName, setClubName] = useState("");
  const [notice, setNotice] = useState<Notice>(null);

  const label = (name: string | null, id: number) => name ?? `#${id}`;
  const onError = (e: unknown) =>
    setNotice({ text: getErrorMessage(e).split("\n")[0], bad: true });

  const addFaculty = () => {
    const name = facultyName.trim();
    createFaculty.mutate(
      { name },
      {
        onSuccess: () => {
          setFacultyName("");
          setNotice({ text: t("admin.org.created", { name }) });
        },
        onError,
      },
    );
  };

  const addGroup = (name: string, facultyId: number | undefined, reset: () => void) => {
    createGroup.mutate(
      facultyId === undefined ? { name } : { name, facultyId },
      {
        onSuccess: () => {
          reset();
          setNotice({ text: t("admin.org.created", { name }) });
        },
        onError,
      },
    );
  };

  return (
    <div>
      <PageHeader title={t("admin.org.title")} />
      <NoticeBox notice={notice} />

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Panel title={t("admin.org.addFaculty")}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="org-faculty-name">{t("admin.org.name")}</Label>
            <Input
              id="org-faculty-name"
              value={facultyName}
              onChange={(e) => setFacultyName(e.target.value)}
            />
            <Button
              type="button"
              disabled={!facultyName.trim() || createFaculty.isPending}
              onClick={addFaculty}
            >
              {t("admin.org.addFaculty")}
            </Button>
          </div>
        </Panel>

        <Panel title={t("admin.org.addDepartment")}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="org-dept-name">{t("admin.org.name")}</Label>
            <Input
              id="org-dept-name"
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
            />
            <Label>{t("admin.org.faculty")}</Label>
            <Select value={deptFaculty} onValueChange={setDeptFaculty}>
              <SelectTrigger aria-label={t("admin.org.faculty")}>
                <SelectValue placeholder={t("admin.org.pickFaculty")} />
              </SelectTrigger>
              <SelectContent>
                {faculties.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {label(f.name, f.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              disabled={!deptName.trim() || !deptFaculty || createGroup.isPending}
              onClick={() =>
                addGroup(deptName.trim(), Number(deptFaculty), () => setDeptName(""))
              }
            >
              {t("admin.org.addDepartment")}
            </Button>
          </div>
        </Panel>

        <Panel title={t("admin.org.addClub")}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="org-club-name">{t("admin.org.name")}</Label>
            <Input
              id="org-club-name"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
            />
            <Button
              type="button"
              disabled={!clubName.trim() || createGroup.isPending}
              onClick={() => addGroup(clubName.trim(), undefined, () => setClubName(""))}
            >
              {t("admin.org.addClub")}
            </Button>
          </div>
        </Panel>
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Panel title={t("admin.org.faculties")}>
            {faculties.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("admin.org.noFaculties")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {faculties.map((f) => {
                  const depts = groups.filter((g) => g.facultyId === f.id);
                  return (
                    <li key={f.id}>
                      <OrgRow
                        kind="faculty"
                        id={f.id}
                        name={label(f.name, f.id)}
                        strong
                        onNotice={setNotice}
                      />
                      {depts.length === 0 ? (
                        <p className="ml-3 text-xs text-muted-foreground">
                          {t("admin.org.noDepartments")}
                        </p>
                      ) : (
                        <ul className="ml-3 flex flex-col gap-0.5">
                          {depts.map((d) => (
                            <li key={d.id}>
                              <OrgRow
                                kind="group"
                                id={d.id}
                                name={label(d.name, d.id)}
                                onNotice={setNotice}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          <Panel title={t("admin.org.clubs")}>
            {clubs.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("admin.org.noClubs")}</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {clubs.map((c) => (
                  <li key={c.id}>
                    <OrgRow kind="group" id={c.id} name={label(c.name, c.id)} onNotice={setNotice} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
