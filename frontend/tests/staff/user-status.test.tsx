import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import StaffUsersPage from "../../src/features/staff/users/users-page";
import type { DepartmentUser } from "../../src/features/staff/users/department-users";
import {
  toAdminUserSummary,
  type AdminAccountRow,
} from "../../../backend/src/common/mappers/admin-user.mapper";
import { adminUserSummary } from "../../../backend/src/admin/admin.schema";

const hooks = vi.hoisted(() => ({
  useDepartmentUsers: vi.fn(),
  useCreditDetail: vi.fn(),
}));

vi.mock("../../src/features/staff/users/department-users", () => ({
  useDepartmentUsers: hooks.useDepartmentUsers,
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
const disabled: DepartmentUser = adminUserSummary
  .strict()
  .parse(
    toAdminUserSummary({
      ...account,
      AccountKey: 8,
      UserID: "S12346",
      UserFName: "Grace",
      UserLName: "Hopper",
      Email: "grace@ku.th",
      IsActive: false,
    })
  );

describe("staff credit deduction and account status", () => {
  beforeEach(() => {
    void i18n.changeLanguage("en");
    vi.clearAllMocks();
    hooks.useDepartmentUsers.mockReturnValue({
      data: [deductionOnly, disabled],
      isLoading: false,
    });
    hooks.useCreditDetail.mockReturnValue({ data: null, isLoading: false });
  });

  it("keeps a credit deduction active and marks a deactivated account disabled", () => {
    render(<StaffUsersPage />);

    const ada = screen.getByText("Ada Lovelace").closest("tr")!;
    const grace = screen.getByText("Grace Hopper").closest("tr")!;
    expect(within(ada).getByText(i18n.t("staff.users.statusActive"))).toBeInTheDocument();
    expect(
      within(grace).getByText(i18n.t("staff.users.statusDisabled"))
    ).toBeInTheDocument();
  });
});
