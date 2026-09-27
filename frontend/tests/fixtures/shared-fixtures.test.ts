import { describe, expect, it } from "vitest";
import { ADMIN_USER_RESPONSES, ADMIN_USERS } from "./admin-users";
import {
  CATALOG_ITEM_RESPONSES,
  CATALOG_ITEMS,
  MANAGED_ITEM_RESPONSES,
} from "./catalog-items";

describe("shared fixture consistency", () => {
  it("uses account keys and the real adapter without invented activity dates or login methods", () => {
    expect(new Set(ADMIN_USERS.map((user) => user.id)).size).toBe(ADMIN_USERS.length);
    for (const user of ADMIN_USERS) {
      expect(Number.isSafeInteger(Number(user.id))).toBe(true);
      expect(user.lastActiveAt).toBe("-");
      expect(user.createdAt).toBe("-");
      expect(user.auth).toBe("ku"); // Every record has a @ku.th address.
    }
    expect(
      ADMIN_USER_RESPONSES.filter((user) => user.role === "borrower").every(
        (user) => user.managementGroup === null
      )
    ).toBe(true);
  });

  it("keeps stock counts, availability dates and maintenance states coherent across catalog and staff fixtures", () => {
    expect(new Set(CATALOG_ITEMS.map((item) => item.id)).size).toBe(CATALOG_ITEMS.length);
    for (const [index, item] of CATALOG_ITEM_RESPONSES.entries()) {
      expect(item.availableUnits).toBeLessThanOrEqual(item.totalUnits);
      expect(CATALOG_ITEMS[index].categoryId).toBe("");
      expect(CATALOG_ITEMS[index].code).toBe("");
      expect(MANAGED_ITEM_RESPONSES[index]).toMatchObject({
        id: item.id,
        name: item.name,
        totalUnits: item.totalUnits,
        availableUnits: item.availableUnits,
      });
      if (item.availableUnits > 0) {
        expect(item.stockStatus).toBe("ok");
        expect(item.nextAvailableAt).toBeNull();
        expect(item.allowBorrow).toBe(true);
      } else if (item.stockStatus === "maintenance") {
        expect(item.allowBorrow).toBe(false);
        expect(item.nextAvailableAt).toBeNull();
      } else {
        expect(item.stockStatus).toBe("queue");
        expect(item.allowBorrow).toBe(true);
        expect(item.nextAvailableAt).not.toBeNull();
      }
      if (item.tier === "T3") expect(item.prepDays).toBe(0);
    }
  });
});
