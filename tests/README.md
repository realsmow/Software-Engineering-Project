# Running the current test coverage

Install the root, backend and frontend lockfile dependencies and Chromium first:

```sh
npm ci
npm ci --prefix backend
npm ci --prefix frontend
npx playwright install chromium
```

Use the Node version from `.nvmrc`. PostgreSQL must be running locally; the account in `DATABASE_URL` needs permission to create a database. The runner reads `backend/.env` when the environment does not already provide settings. It accepts only a local database host and refuses to use occupied application ports.

## Commands

```sh
node tests/run-isolated.mjs --all
node tests/run-isolated.mjs --backend
node tests/run-isolated.mjs --e2e
node tests/run-isolated.mjs --e2e tests/e2e/lending/lending-lifecycle.spec.ts
node backend/node_modules/typescript/bin/tsc --project tests/tsconfig.e2e.json
node scripts/check-test-traceability.mjs
```

`--all` runs backend coverage, frontend coverage and all browser tests once. `--backend` runs only backend coverage. Browser tests use one worker because they advance one shared test clock and exercise shared seeded accounts. Frontend tests retain their normal parallel execution.

## Browser test folders

- `e2e/auth/`: sign-in and role access
- `e2e/lending/`: loan requests, reservations, pickup and lending lifecycle
- `e2e/equipment/`: equipment catalogue and staff inventory
- `e2e/admin/`: administration pages and user-management workflows
- `e2e/documents/`: PDF and page-layout regressions
- `e2e/fixtures/`: shared API contracts, live workflow helpers and test clock

The runner creates a uniquely named `ulms_test_*` database, applies all migrations and seeds it for browser tests. It stops only the servers it starts and drops only its own database in `finally`. The existing development database is not migrated, seeded or dropped.

The committed generated Prisma client is currently missing newer retirement models. For local E2E, the runner copies backend code/schema to `tests/.artifacts`, generates the client there and compiles that copy. Repository `src` stays unchanged. Backend CI regenerates the client in its disposable checkout before its ordinary build/typecheck.

Browser/backend business time starts at 07:00 Bangkok on 26 September 2031. The test-only preload refuses to run outside `NODE_ENV=test` and an isolated test database. A lifecycle can advance both clocks to collection time; network timers remain real. Clock file replacement is atomic, with bounded Windows sharing retries. Each browser test resets the business clock.

Uploaded evidence goes to a unique temporary directory and is removed after server shutdown. This avoids Express's refusal to serve files beneath hidden ancestors such as `.gemini`. Live API response bodies are buffered and validated before navigation, and in-flight routes are drained before browser teardown.

## Reports and expected defects

- `backend/coverage/coverage-summary.json` and `frontend/coverage/coverage-summary.json`: all-source measurements, including unvisited files, excluding generated backend code/specs.
- `tests/.artifacts/e2e-results.json`: ordinary passes and expected defects reported separately by `check-e2e-report.mjs`; skips, unexpected failures/passes and unknown expected failures fail the check.
- `test-results/`: browser failure context/screenshots. Expected-defect screenshots are evidence, not an indication the whole suite failed.
- `tests/.artifacts/backend.log` and `frontend.log`: latest isolated server diagnostics.
- [SRS map](../docs/test-requirement-matrix.md) and [PDF map](../docs/pdf-regression-matrix.md): current evidence and remaining limits. A mapped ID or coverage floor does not prove complete requirement compliance.

The five known product defects are three Vitest expected failures (popularity depends on inventory, cart survives logout, green stock check survives a clash) and two browser expected failures (real asset-tag search, missing damage-credit alert). The browser markers are applied only after real setup/API transactions succeed. A product fix should make the marker report an unexpected pass; remove the marker after confirming the desired assertion passes.

Normal PR/push CI runs tests without coverage, runs E2E with browser test typechecking and runs the admin system load test in a separate job. It does not upload browser reports or run the traceability checker. There is no coverage workflow. Coverage and traceability checks can be run manually with the commands above and below.

## Manual coverage commands

From the repository root, with dependencies installed and local PostgreSQL running:

```sh
node tests/run-isolated.mjs --backend
npm --prefix frontend run test:coverage
```

The backend command uses a new disposable database and leaves the development database untouched. The frontend command runs unit tests with all-source coverage. Reports are written to `backend/coverage/` and `frontend/coverage/`. For manual comparison with the latest baseline, backend statements were 80.63%, lines 80.94%, branches 70.43%, functions 72.02%; frontend statements/lines were 72.05%, branches 73.22%, functions 67.83%. These measurements do not mean every critical workflow or SRS requirement is covered.

## Separate performance profile

With k6 installed:

```sh
node tests/run-isolated.mjs --load
```

This uses real time and a new test database, ramps to 50 virtual users over 110 seconds and targets only `admin.getSystemStatus`. It checks p95 < 250 ms, < 1% HTTP failures and > 99% valid API responses, so a fast HTTP 200 error body cannot pass. The summary is `tests/.artifacts/load-summary.json`. CI runs the same command in its `admin system load` job, using k6 2.2.0 and PostgreSQL on that runner. The load job installs only backend dependencies; it does not start the frontend or collect coverage. A failed threshold fails the job. This measures performance on the CI runner and cannot establish production capacity, catalogue scale or all SRS performance requirements.
