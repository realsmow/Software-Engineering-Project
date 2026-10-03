import { useState, type ReactNode } from "react";
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
import { useAdminOrg, useCreateFaculty, useCreateGroup } from "./use-org";

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
                      <div className="text-sm font-medium text-foreground">{label(f.name, f.id)}</div>
                      {depts.length === 0 ? (
                        <p className="ml-3 text-xs text-muted-foreground">
                          {t("admin.org.noDepartments")}
                        </p>
                      ) : (
                        <ul className="ml-3 flex flex-col gap-0.5">
                          {depts.map((d) => (
                            <li key={d.id} className="text-[13px] text-foreground">
                              {label(d.name, d.id)}
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
                  <li key={c.id} className="text-[13px] text-foreground">
                    {label(c.name, c.id)}
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
