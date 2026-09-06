import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/shared/page-header";
import { useDepartmentUsers } from "./department-users";
import { DepartmentUserTable } from "./department-user-table";

/**
 * Department directory.
 *
 * Read-only: looking somebody up is a different job from sanctioning them, and
 * the two live behind different nav entries. Banning is on the permissions
 * page, which renders the same table with an action column.
 */
export default function StaffUsersPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const { data: users, isLoading } = useDepartmentUsers(q);

  return (
    <div>
      <PageHeader title={t("nav.userMgmt")} subtitle={t("staff.users.subtitle")} />
      <DepartmentUserTable users={users ?? []} isLoading={isLoading} q={q} onSearch={setQ} />
    </div>
  );
}
