import type { APIRequestContext, Page, Response } from "@playwright/test";
import { writeBusinessClock } from "./business-clock";
import type { z } from "../../../backend/node_modules/zod";
import { expect } from "./api-contracts";
import { loginOutput } from "../../../backend/src/auth/auth.schema";
import {
  itemTypeDetail,
  itemUnitOutput,
  managementGroupOptionOutput,
  authorityRoleOptionOutput,
  eligibilityRule,
} from "../../../backend/src/item/item.schema";

const API = "http://localhost:3000/trpc";
export async function liveCall<T>(
  context: APIRequestContext,
  procedure: string,
  schema: z.ZodType<T>,
  input?: unknown,
  mutation = false,
): Promise<T> {
  const response = mutation
    ? await context.post(`${API}/${procedure}`, { data: input ?? {} })
    : await context.get(
        `${API}/${procedure}?input=${encodeURIComponent(JSON.stringify(input ?? {}))}`,
      );
  const body = (await response.json()) as {
    result?: { data?: unknown };
    error?: unknown;
  };
  expect(response.ok(), `${procedure}: ${JSON.stringify(body)}`).toBeTruthy();
  expect(body.error, procedure).toBeUndefined();
  return schema.parse(body.result?.data);
}
export const users = {
  borrower: { username: "test_borrower", password: "borrower1234" },
  staff: { username: "test_staff", password: "staff1234" },
  supervisor: { username: "test_supervisor", password: "supervisor1234" },
  admin: { username: "test_admin", password: "admin1234" },
};
export async function login(
  context: APIRequestContext,
  role: keyof typeof users,
) {
  return (await liveCall(context, "auth.login", loginOutput, users[role], true))
    .user;
}
export async function visitAs(
  page: Page,
  role: keyof typeof users,
  path: string,
) {
  await page.addInitScript(() => localStorage.setItem("ulms-locale", "en"));
  await login(page.request, role);
  await page.goto(path);
}
export async function freshEquipment(
  context: APIRequestContext,
  name: string,
  tier: "T1" | "T2" = "T2",
) {
  await login(context, "staff");
  const groups = await liveCall(
    context,
    "item.listManagementGroups",
    managementGroupOptionOutput.array(),
  );
  const roles = await liveCall(
    context,
    "item.listAuthorityRoles",
    authorityRoleOptionOutput.array(),
  );
  const borrowerRole = roles.find((row) => row.level === 0);
  expect(borrowerRole, "Seed must provide borrower authority").toBeDefined();
  const type = await liveCall(
    context,
    "item.createType",
    itemTypeDetail,
    { name, creditWeight: 3, price: tier === "T2" ? 2000 : 500 },
    true,
  );
  const units = await liveCall(
    context,
    "item.createUnit",
    itemUnitOutput.array(),
    {
      itemKey: type.id,
      manageGroupKey: groups[0].id,
      tier,
      ...(tier === "T2" ? { serialNo: `WF-${type.id}` } : {}),
      quantity: 1,
      prepDays: 0,
    },
    true,
  );
  await liveCall(
    context,
    "item.setEligibility",
    eligibilityRule.array(),
    {
      itemKey: type.id,
      rules: [
        {
          groupKey: groups[0].id,
          authorityRoleKey: borrowerRole!.authorityRoleKey,
        },
      ],
    },
    true,
  );
  return {
    type,
    unit: units[0],
    group: groups[0],
    borrowerRole: borrowerRole!,
  };
}
export function mutationResponse(page: Page, procedure: string) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname
        .split("/trpc/")[1]
        ?.split(",")
        .includes(procedure) === true && response.request().method() === "POST",
  );
}
export async function mutationData<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  const body: unknown = await response.json();
  const envelope = (Array.isArray(body) ? body[0] : body) as {
    result?: { data?: unknown };
    error?: unknown;
  };
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  expect(envelope.error, JSON.stringify(body)).toBeUndefined();
  return schema.parse(envelope.result?.data);
}
export function pngFile(name = "evidence.png") {
  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1kAAAAASUVORK5CYII=",
      "base64",
    ),
  };
}
export async function advanceBusinessClock(page: Page, instant: string) {
  expect(
    process.env.ULMS_TEST_CLOCK_FILE,
    "Use tests/run-isolated.mjs",
  ).toBeDefined();
  const clockFile = process.env.ULMS_TEST_CLOCK_FILE!;
  await writeBusinessClock(clockFile, instant);
  await page.clock.setFixedTime(new Date(instant));
}
