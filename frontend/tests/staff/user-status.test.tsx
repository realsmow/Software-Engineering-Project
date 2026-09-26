import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import StaffUsersPage from "../../src/features/staff/users/users-page";
import StaffPermissionsPage from "../../src/features/staff/permissions/permissions-page";
import type { DepartmentUser } from "../../src/features/staff/users/department-users";
import {
  toAdminUserSummary,
  type AdminAccountRow,
} from "../../../backend/src/common/mappers/admin-user.mapper";
import { adminUserSummary } from "../../../backend/src/admin/admin.schema";

const hooks = vi.hoisted(() => ({
  useDepartmentUsers: vi.fn(),
  useSetUserBan: vi.fn(),
  useCreditDetail: vi.fn(),
}));

vi.mock("../../src/features/staff/users/department-users", () => ({
  useDepartmentUsers: hooks.useDepartmentUsers,
  useSetUserBan: hooks.useSetUserBan,
}));
vi.mock("../../src/features/staff/users/use-credit-detail", () => ({
  useCreditDetail: hooks.useCreditDetail,
}));

const account: AdminAccountRow = {
  AccountKey: 7,
  UserID: "S12345",
  UserFName: "Ada",
  UserLName: "Lovelace",
  Email: "ada@ku.th",
  Role: { RoleName: "Student" },
  UserCredit: 91,
  IsActive: true,
  Authorities: [],
  Penalties: [
    {
      PenaltyKey: 20,
      Reason: "ReturnLate",
      UsageKey: 42,
      CreditDeducted: 9,
      ActionTime: new Date("2026-09-25T08:00:00.000Z"),
      ExpirationTime: new Date("2031-10-10T08:00:00.000Z"),
      Appealed: false,
    },
  ],
};
const deductionOnly: DepartmentUser = adminUserSummary
  .strict()
  .parse(toAdminUserSummary(account));
const banned: DepartmentUser = adminUserSummary.strict().parse(
  toAdminUserSummary({
    ...account,
    AccountKey: 8,
    UserID: "S12346",
    UserFName: "Grace",
    UserLName: "Hopper",
    Email: "grace@ku.th",
    Penalties: [
      {
        ...account.Penalties[0],
        UsageKey: null,
        CreditDeducted: null,
        Reason: "Borrowing ban",
      },
    ],
  })
);

describe("staff credit deduction and ban display", () => {
  beforeEach(() => {
    void i18n.changeLanguage("en");
    vi.clearAllMocks();
    hooks.useDepartmentUsers.mockReturnValue({
      data: [deductionOnly, banned],
      isLoading: false,
    });
    hooks.useSetUserBan.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    hooks.useCreditDetail.mockReturnValue({ data: null, isLoading: false });
  });

  it("labels a borrower with a credit deduction as active and a banned borrower as suspended", () => {
    render(<StaffUsersPage />);

    const ada = screen.getByText("Ada Lovelace").closest("tr")!;
    const grace = screen.getByText("Grace Hopper").closest("tr")!;
    expect(within(ada).getByText(i18n.t("staff.users.statusActive"))).toBeInTheDocument();
    expect(
      within(grace).getByText(i18n.t("staff.users.statusSuspended"))
    ).toBeInTheDocument();
  });

  it("offers a ban for a deduction-only borrower and a lift action for a banned borrower", () => {
    render(<StaffPermissionsPage />);

    const ada = screen.getByText("Ada Lovelace").closest("tr")!;
    const grace = screen.getByText("Grace Hopper").closest("tr")!;
    fireEvent.click(
      within(ada).getByRole("button", { name: i18n.t("staff.permissions.ban") })
    );
    expect(
      within(ada).getByRole("button", {
        name: i18n.t("staff.permissions.confirmBan", { days: 30 }),
      })
    ).toBeInTheDocument();
    expect(
      within(grace).getByRole("button", { name: i18n.t("staff.permissions.lift") })
    ).toBeInTheDocument();
  });
});
