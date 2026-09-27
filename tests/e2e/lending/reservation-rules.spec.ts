import { expect, test } from "../fixtures/api-contracts";
import { type APIRequestContext } from "@playwright/test";
import { itemDetail, paginatedItems } from "../../../backend/src/item/item.schema";

/**
 * FR-RSV-03: T0 stock is borrowed on the spot, never reserved for a later day.
 * Checked at the API so it does not depend on which catalogue rows exist today.
 */
const API = "http://localhost:3000/trpc";

async function call(api: APIRequestContext, proc: string, input: unknown) {
  const res = await api.post(`${API}/${proc}`, { data: input });
  return (await res.json()) as {
    result?: { data: unknown };
    error?: { data?: { businessCode?: string } };
  };
}

async function query(api: APIRequestContext, proc: string, input: unknown) {
  const url = `${API}/${proc}?input=${encodeURIComponent(JSON.stringify(input))}`;
  return ((await (await api.get(url)).json()) as { result: { data: unknown } })
    .result.data;
}

test("a T0 item cannot be booked for next week", async ({ playwright }) => {
  const api = await playwright.request.newContext();
  await call(api, "auth.login", {
    username: "test_borrower",
    password: "borrower1234",
  });

  const items = paginatedItems.parse(await query(api, "item.list", { page: 1, pageSize: 50 }));
  const t0 = items.items.find((item) => item.tier === "T0");
  expect(t0, "The isolated database must contain a T0 item").toBeDefined();
  const detail = itemDetail.parse(await query(api, "item.getById", { id: t0!.id }));
  // A unit switched off or missing is refused earlier, for that reason instead.
  const lendable = detail.units.find(
    (u: { allowBorrow: boolean; status: string }) =>
      u.allowBorrow && u.status === "InStorage",
  );
  expect(lendable, "The isolated database must contain a lendable T0 unit").toBeDefined();

  const start = new Date(Date.now() + 7 * 86_400_000);
  const end = new Date(start.getTime() + 86_400_000);
  const res = await call(api, "loan.create", {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    lines: [{ resourceKey: lendable!.resourceKey }],
  });

  // Refused per line or for the whole basket; either way nothing is created.
  const refused =
    res.error?.data?.businessCode ??
    (res.result?.data as { rejected?: { code: string }[] })?.rejected?.[0]
      ?.code;
  expect(refused).toBe("T0_NOT_RESERVABLE");
  expect(
    (res.result?.data as { created?: unknown[] })?.created ?? [],
  ).toHaveLength(0);
  await api.dispose();
});
