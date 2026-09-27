import { expect, test } from "../fixtures/api-contracts";
import { liveCall, login } from "../fixtures/live-workflow";
import { createUserOutput } from "../../../backend/src/admin/admin.schema";
import { borrowerHistoryOutput } from "../../../backend/src/approval/approval.schema";

test("history enforces authentication, role and department scope over the real API", async ({
  page,
}) => {
  await login(page.request, "admin");
  const token = `history-${test.info().testId}`;
  const created = await liveCall(
    page.request,
    "admin.createUser",
    createUserOutput,
    {
      email: `${token}@example.test`,
      studentId: token.slice(0, 50),
      firstName: "History",
      lastName: "Privacy",
      role: "borrower",
      password: "History1234!",
    },
    true,
  );
  const accountKey = created.user.id;
  expect(
    await liveCall(
      page.request,
      "approval.borrowerHistory",
      borrowerHistoryOutput,
      { accountKey },
    ),
  ).toEqual({
    totalLoans: 0,
    lateReturns: 0,
    damageIncidents: 0,
    lastDamageDate: null,
    items: [],
  });
  const url = `http://localhost:3000/trpc/approval.borrowerHistory?input=${encodeURIComponent(JSON.stringify({ accountKey }))}`;
  for (const role of ["staff", "supervisor"] as const) {
    await login(page.request, role);
    const response = await page.request.get(url);
    expect(response.ok()).toBe(false);
    expect(JSON.stringify(await response.json())).toContain(
      "OUT_OF_MANAGEMENT_SCOPE",
    );
  }
  await login(page.request, "borrower");
  const forbidden = await page.request.get(url);
  expect(forbidden.status()).toBe(403);
  await page.context().clearCookies();
  const anonymous = await page.request.get(url);
  expect(anonymous.status()).toBe(401);
  // The isolated runner disposes this account along with the whole test database.
});
