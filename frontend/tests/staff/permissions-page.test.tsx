import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import StaffPermissionsPage from "../../src/features/staff/permissions/permissions-page";
import {
  authorityRoleOptionOutput,
  eligibilityRule,
  itemTypeSummary,
  managementGroupOptionOutput,
  roomOutput,
  setEligibilityInput,
} from "../../../backend/src/item/item.schema";
import { mutationResult, queryResult } from "../fixtures/query-results";
import { MANAGED_ITEM_RESPONSES } from "../fixtures/catalog-items";

const hooks = vi.hoisted(() => ({
  useManagedItems: vi.fn(),
  useManagedRooms: vi.fn(),
  useManagementGroups: vi.fn(),
  useAuthorityRoles: vi.fn(),
  useEligibility: vi.fn(),
  useSetEligibility: vi.fn(),
}));
vi.mock("../../src/features/staff/inventory/use-inventory", () => hooks);
vi.mock("../../src/features/staff/permissions/use-eligibility", () => hooks);

const group = managementGroupOptionOutput
  .strict()
  .parse({ id: 8, name: "Engineering", type: "Faculty" });
const rule = eligibilityRule.strict().parse({
  groupKey: group.id,
  groupName: group.name,
  authorityRoleKey: 1,
  authorityRoleName: "Student",
  appliesToUnits: 2,
});
const item = itemTypeSummary.strict().parse({
  ...MANAGED_ITEM_RESPONSES[0],
  id: 7,
  totalUnits: 2,
  availableUnits: 2,
});
const room = roomOutput.strict().parse({
  roomKey: 7,
  resourceKey: 70,
  name: "Study room",
  description: null,
  location: null,
  imageUrl: null,
  creditWeight: 0,
  capacity: 12,
  tier: "T3",
  status: "InStorage",
  lendable: true,
  condition: "Normal",
  managementGroup: group,
  openMinutes: 420,
  closeMinutes: 1080,
  breakStartMinutes: 720,
  breakEndMinutes: 780,
});

describe("staff eligibility permissions", () => {
  const save = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    void i18n.changeLanguage("en");
    hooks.useManagedItems.mockReturnValue(queryResult([item]));
    hooks.useManagedRooms.mockReturnValue(queryResult([room]));
    hooks.useManagementGroups.mockReturnValue(queryResult([group]));
    hooks.useAuthorityRoles.mockReturnValue(
      queryResult([
        authorityRoleOptionOutput
          .strict()
          .parse({ authorityRoleKey: 1, name: "Student", level: 0 }),
      ])
    );
    hooks.useEligibility.mockReturnValue(queryResult([rule]));
    hooks.useSetEligibility.mockReturnValue(mutationResult(save));
    save.mockResolvedValue([]);
  });

  it.each([
    ["type:7", { itemKey: 7 }],
    ["room:7", { roomKey: 7 }],
  ])(
    "clears the complete rule set for %s, keeping equal type and room keys distinct",
    async (value, target) => {
      render(<StaffPermissionsPage />);
      expect(hooks.useEligibility).toHaveBeenCalledWith(null);
      fireEvent.change(
        screen.getByRole("combobox", { name: i18n.t("staff.permissions.pickTarget") }),
        {
          target: { value },
        }
      );
      expect(hooks.useEligibility).toHaveBeenLastCalledWith(target);
      const button = screen.getByRole("button", {
        name: i18n.t("staff.permissions.saveRules"),
      });
      expect(button).toBeDisabled();
      fireEvent.click(
        screen.getByRole("button", { name: i18n.t("staff.permissions.removeRule") })
      );
      fireEvent.click(button);
      await waitFor(() =>
        expect(save).toHaveBeenCalledWith(
          setEligibilityInput.parse({ ...target, rules: [] })
        )
      );
      expect(await screen.findByRole("status")).toHaveTextContent(
        i18n.t("staff.permissions.eligibilitySaved")
      );
    }
  );

  it("ignores a duplicate group and role pair and adds a new pair only once", async () => {
    hooks.useEligibility.mockReturnValue(queryResult([]));
    render(<StaffPermissionsPage />);
    fireEvent.change(
      screen.getByRole("combobox", { name: i18n.t("staff.permissions.pickTarget") }),
      {
        target: { value: "type:7" },
      }
    );
    for (let attempt = 0; attempt < 2; attempt += 1) {
      fireEvent.change(
        screen.getByRole("combobox", { name: i18n.t("staff.permissions.colGroup") }),
        { target: { value: "8" } }
      );
      fireEvent.change(
        screen.getByRole("combobox", { name: i18n.t("staff.permissions.colRole") }),
        { target: { value: "1" } }
      );
      fireEvent.click(
        screen.getByRole("button", { name: i18n.t("staff.permissions.addRule") })
      );
    }
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("staff.permissions.saveRules") })
    );
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        setEligibilityInput.parse({
          itemKey: 7,
          rules: [{ groupKey: 8, authorityRoleKey: 1 }],
        })
      )
    );
  });
});
