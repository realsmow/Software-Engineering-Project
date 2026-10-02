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
node tests/run-isolated.mjs --backend --no-coverage --runTestsByPath tests/item/serial-concurrency-persistence.spec.ts
node tests/run-isolated.mjs --e2e
node tests/run-isolated.mjs --e2e tests/e2e/lending/lending-lifecycle.spec.ts
node backend/node_modules/typescript/bin/tsc --project tests/tsconfig.e2e.json
node scripts/check-test-traceability.mjs
```

`--all` runs backend coverage, frontend coverage and all browser tests once. `--backend` runs backend coverage and forwards additional Jest arguments; `--no-coverage` disables coverage for that run. Backend file arguments are relative to `backend/`. Browser tests use one worker because they advance one shared test clock and exercise shared seeded accounts. Frontend tests retain their normal parallel execution.

## Browser test folders

- `e2e/auth/`: sign-in and role access
- `e2e/lending/`: loan requests, reservations, pickup and lending lifecycle
- `e2e/equipment/`: equipment catalogue and staff inventory
- `e2e/admin/`: administration pages and user-management workflows
- `e2e/documents/`: PDF and page-layout regressions
- `e2e/fixtures/`: shared API contracts, live workflow helpers and test clock

The runner creates a uniquely named `ulms_test_*` database and applies all migrations. Backend runs bootstrap reference data through the existing `seedReference()` before business fixtures; browser runs seed the application data. It stops only the servers it starts and drops only its own database in `finally`. The existing development database is not migrated, seeded or dropped. All 20 backend suites that share the runner database check `NODE_ENV=test`, a local PostgreSQL URL and the runner's `ulms_test_<time>_<pid>` name before database setup. Use this runner for the full backend suite. Their savepoint adapter is shared with the existing pickup fixture through `backend/tests/fixtures/borrower-history.ts`.

Four suites own a separate database through `backend/tests/fixtures/isolated-database.ts`: serial concurrency, reservation persistence, Google OAuth HTTP and AuditService. They keep independent transactions and isolate whole-table account counts/latest audit rows from other suites. The helper migrates each new database, optionally calls the existing `seedReference()`, tracks all of its clients and drops only its generated database at teardown or after setup failure. It does not change `process.env.DATABASE_URL`. The other suites keep their existing rollback or key-based cleanup; they do not each migrate another database.

These four suites can also run directly or in parallel against a local PostgreSQL server with CREATE DATABASE permission, even when the supplied base database is empty. Run from `backend/` with `DATABASE_URL` configured:

```sh
npm test -- --maxWorkers=4 --runTestsByPath tests/item/serial-concurrency-persistence.spec.ts tests/loan/reservation-persistence.spec.ts tests/auth/google-oauth-http.spec.ts src/common/audit/audit.service.spec.ts
```

Full backend CI and a separate four-worker run passed on 2 October 2026 (100 suites / 932 outcomes; 4 suites / 28 outcomes). Expected-defect cases still use `it.failing`; a passing suite does not mean those product defects are fixed. 

The committed generated Prisma client is currently missing newer retirement models. For local E2E, the runner copies backend code/schema to `tests/.artifacts`, generates the client there and compiles that copy. Repository `src` stays unchanged. Backend CI regenerates the client in its disposable checkout before its ordinary build/typecheck.

Browser/backend business time starts at 07:00 Bangkok on 26 September 2031. The test-only preload refuses to run outside `NODE_ENV=test` and an isolated test database. A lifecycle can advance both clocks to collection time; network timers remain real. Clock file replacement is atomic, with bounded Windows sharing retries. Each browser test resets the business clock.

Uploaded evidence goes to a unique temporary directory and is removed after server shutdown. This avoids Express's refusal to serve files beneath hidden ancestors such as `.gemini`. Live API response bodies are buffered and validated before navigation, and in-flight routes are drained before browser teardown.

## Reports and expected defects

- `backend/coverage/coverage-summary.json` and `frontend/coverage/coverage-summary.json`: all-source measurements, including unvisited files, excluding generated backend code/specs.
- `tests/.artifacts/e2e-results.json`: ordinary passes and expected defects reported separately by `check-e2e-report.mjs`; skips, unexpected failures/passes and unknown expected failures fail the check.
- `test-results/`: browser failure context/screenshots. Expected-defect screenshots are evidence, not an indication the whole suite failed.
- `tests/.artifacts/backend.log` and `frontend.log`: latest isolated server diagnostics.
- [SRS map](../docs/test-requirement-matrix.md): current evidence and remaining limits. A mapped ID or coverage floor does not prove complete requirement compliance.

The 1 October main QA run reproduces three current issues in five assertions: duplicate serials under concurrent registration (T2/T0/T1), the OAuth configuration reporting disabled for an enabled provider, and an expired session staying on the authenticated SPA until reload. Backend expected defects are isolated in `it.failing` assertions; the session browser marker is applied only after setup, real API refusal and cleanup succeed. A product fix should make these markers report an unexpected pass; remove a marker after confirming its desired assertion. Older defects concerning popularity, logout drafts, availability clashes, asset-tag search and damage-credit alerts were fixed on main.

Normal PR/push CI runs backend tests through `run-isolated.mjs --backend --no-coverage`, runs E2E with browser test typechecking and runs the admin system load test in a separate job. It does not upload browser reports or run the traceability checker. There is no coverage workflow. The changed backend command was checked locally; this does not establish a completed GitHub-hosted CI run. Coverage and traceability checks can be run manually with the commands above and below.

## Manual coverage commands

From the repository root, with dependencies installed and local PostgreSQL running:

```sh
node tests/run-isolated.mjs --backend
npm --prefix frontend run test:coverage
```

The backend command uses a new disposable database and leaves the development database untouched. The frontend command runs unit tests with all-source coverage. Reports are written to `backend/coverage/` and `frontend/coverage/`.

## Separate performance profile

With k6 installed:

```sh
node tests/run-isolated.mjs --load
```

This uses real time and a new test database, ramps to 50 virtual users over 110 seconds and targets only `admin.getSystemStatus`. It checks p95 < 250 ms, < 1% HTTP failures and > 99% valid API responses, so a fast HTTP 200 error body cannot pass. The summary is `tests/.artifacts/load-summary.json`. CI runs the same command in its `admin system load` job, using k6 2.2.0 and PostgreSQL on that runner. The load job installs only backend dependencies; it does not start the frontend or collect coverage. A failed threshold fails the job. This measures performance on the CI runner and cannot establish production capacity, catalogue scale or all SRS performance requirements.
