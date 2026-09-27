import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path =
  process.argv[2] ??
  fileURLToPath(new URL(".artifacts/e2e-results.json", import.meta.url));
const report = JSON.parse(readFileSync(path, "utf8"));
const expectedDefects = new Set([
  "finds a seeded equipment type by a real unit asset tag",
  "sends a damage-credit notification after independent inspection",
]);
const tests = [];
function visit(suite) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) tests.push({ title: spec.title, ...test });
  }
  for (const child of suite.suites ?? []) visit(child);
}
for (const suite of report.suites) visit(suite);
if (!tests.length || report.errors?.length)
  throw new Error("E2E report is empty or has runner errors");
let passed = 0;
let defects = 0;
for (const test of tests) {
  const result = test.results.at(-1);
  if (
    test.expectedStatus === "failed" &&
    expectedDefects.has(test.title) &&
    result?.status === "failed" &&
    test.status === "expected"
  ) {
    defects++;
  } else if (
    test.expectedStatus === "passed" &&
    result?.status === "passed" &&
    test.status === "expected"
  ) {
    passed++;
  } else {
    throw new Error(
      `E2E skipped or unexpected result: ${test.title} (${result?.status ?? "missing"})`,
    );
  }
}
console.log(
  `E2E: ${passed} ordinary passes, ${defects} reproduced known defects, 0 skipped`,
);
