# Performance testing (NFR-PRF-01..05)

Dependency-light load test for the SRS performance requirements
(`docs/specs/srs_data.py`). Everything here lives under `perf/` — no files
under `backend/`, `frontend/`, or `tests/e2e` were touched.

## What's here

- `load-test.js` — the load generator. Node 22 + built-in `fetch`, no
  framework. Logs in once as `test_borrower` and once as `test_staff` and
  reuses both session cookies for every virtual user (the backend
  rate-limits login itself — see "Rate limits" below).
- `package.json` — one devDependency, `undici`, used only to raise the
  client's own HTTP connection pool (Node's default `fetch` caps concurrent
  connections per origin well below 200, which would measure the test
  client, not the server). Nothing in `backend/` or `frontend/` gained a
  dependency.
- `seed-large-dataset.sql` — bulk SQL (generate_series-based) that adds
  10,000 equipment units and 100,000 historical Reservation/UsageLog rows to
  a throwaway database, for NFR-PRF-05.
- `results-dev.json`, `results-large.json` — raw output of the last runs
  against the normal dev dataset and the bulked-up dataset.

## How to run

Both servers from the task (backend on :3000, frontend on :5173) must
already be running in dev mode.

```bash
cd perf && npm install   # one-time, installs undici locally to perf/

# Against the normal dev database ("app"):
source ~/.nvm/nvm.sh && nvm use 22
node load-test.js --base http://localhost:3000 --vus 200 --duration 60000 --ramp 15000 --out results-dev.json
```

### NFR-PRF-05 (10,000 units / 100,000 loan history rows)

Run against a **throwaway** database, never the dev DB `app`:

```bash
docker exec postgres psql -U postgres -c 'CREATE DATABASE ulms_perf'

cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ulms_perf" npx prisma migrate deploy
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ulms_perf" npm run seed   # reference data + test users
docker exec -i postgres psql -U postgres -d ulms_perf -f - < ../perf/seed-large-dataset.sql

npm run build
PORT=3100 DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ulms_perf" NODE_ENV=development \
  SESSION_SECRET="<any 32+ char value>" node --enable-source-maps dist/src/main.js &

cd ../perf
node load-test.js --base http://localhost:3100 --vus 200 --duration 60000 --ramp 15000 --out results-large.json

# cleanup
kill %1   # the :3100 process
docker exec postgres psql -U postgres -c 'DROP DATABASE ulms_perf'
```

Every `loan.create` the script makes is immediately followed by
`loan.cancel` on the same reservation. A handful of creates during the run
raced staff-side auto-preparation (T0 stock is picked up on the spot per
FR-RSV-03, so `loan.create` itself creates a `Prepared` UsageLog) and could
no longer be self-cancelled (`CANNOT_CANCEL`/`ALREADY_PREPARED`) once that
happened; these were left in place rather than edited directly in the
database, and expire on their own next day via the app's own
`expireStaleRequests` cron job (§5.9) — the same thing that would happen to
a real borrower who never showed up.

## Rate limits

Login (`auth.login`) and a few other unauthenticated entry points go through
`LoginThrottleService` / `rateLimiter` (backend/src/auth/login-throttle.service.ts,
backend/src/common/security/rate-limiter.ts). The script logs in exactly
twice per run (once per test account) and reuses those cookies for all 200
virtual users, so the throttle was never hit. `item.list`, `item.getById`,
`item.getAvailability`, `loan.create` and `loan.cancel` are **not**
rate-limited, so they see the full concurrency the script generates.

## Results

### After the fix (2026-09-25), 10,000 units / 100,000 loan history rows

200 virtual users, 5 s think time (`--think 5000`), 60 s hold, dev build on a
4-core laptop also running Postgres and the dev servers. 0% errors.

| Endpoint | Target | p50 | p95 | p99 | Pass |
|---|---|---|---|---|---|
| item.list (100 items) | 2 s (NFR-PRF-01) | 257 ms | 1,528 ms | 2,235 ms | yes (p95) |
| item.getAvailability | 500 ms (NFR-PRF-04) | 24 ms | 451 ms | 887 ms | yes (p95) |
| loan.create | 3 s (NFR-PRF-02) | 61 ms | 1,089 ms | 2,079 ms | yes |
| item.getById | none | 44 ms | 748 ms | 1,317 ms | - |

What changed:
- `item.list` counts units in SQL and loads only one unit per type for the
  summary, instead of every unit and its loan.
- `item.getAvailability` is a single aggregate query.
- The next-available date starts from active loans, using a new index on
  `UsageLog(CurrentStatus)`; it had walked the whole loan history (408 ms to 3 ms).
- Catalogue counts are shared across callers for 5 s (in-process, one backend).
- The database pool is 20 connections by default (`DB_POOL_MAX`); node-postgres
  defaults to 10, which queued requests until transactions timed out.

Notes:
- `--think 0` (every user always mid-request) is a stress test, not 200 users;
  it still saturates this laptop.
- A request the client gives up on keeps its query running in Postgres. In
  production set a statement timeout, e.g. append
  `?options=-c%20statement_timeout%3D15000` to `DATABASE_URL`.
- `seed-large-dataset.sql` now writes history as `Inspected`; `Returned`
  (awaiting grading) made every unit look busy.

### Before the fix (first run)


### Dataset A — dev database (`app`): ~15 items, single-digit units each

200 VUs, 15s ramp, 60s hold, weighted mix (item.list 40%, availability 30%,
getById 20%, create+cancel 10%).

| Endpoint | Target (NFR) | p50 | p95 | p99 | Error % | Pass/Fail |
|---|---|---|---|---|---|---|
| `item.list` (pageSize 100) | ≤ 2s (PRF-01) | 2.78s | 6.23s | 6.72s | 0.0% | **FAIL** |
| `item.getAvailability` (catalogue polling) | ≤ 0.5s (PRF-04) | 2.16s | 4.93s | 5.30s | 0.0% | **FAIL** |
| `item.getById` | — (informational) | 2.75s | 6.26s | 6.67s | 0.0% | n/a |
| `loan.create` | ≤ 3s (PRF-02) | 4.46s | 9.42s | 10.00s | 1.1% | **FAIL** |
| `loan.cancel` | — (informational) | 6.68s | 8.76s | 8.76s | 0.0% | n/a |
| 200 concurrent users sustained | ≥ 200 (PRF-03) | — | — | — | ~0-3%¹ | borderline |

¹ An earlier 200-VU run on the same host, while three other agents were
concurrently running `jest`/`vite build`/a second backend instance (host
load average 12-14 on 4 cores), pushed error rate to ~75% with p95 near the
script's own 10s client timeout. The table above is the cleaner of two runs
(load average ~10-11); both are included as `results-dev.json` was
overwritten by the second, cleaner run. **This backend is single-process
Node in `nest start --watch` (unbuilt, source-mapped) sharing a 4-core VM
with other agents' builds and test runs — even the "clean" numbers above are
worse than an idle single-tenant dev server would show**, so treat them as a
pessimistic upper bound, not a clean measurement of the code alone.

### Dataset B — throwaway `ulms_perf`: +10,000 units, +100,000 loan history rows

50 VUs, 5s ramp, 30s hold (reduced from 200/60s because responses were
already saturating the 10s client timeout — see below).

| Endpoint | Target (NFR) | p50 | p95 | p99 | Error % | Pass/Fail |
|---|---|---|---|---|---|---|
| `item.list` (pageSize 100) | ≤ 2s (PRF-01) | >10s (timeout) | >10s | >10s | 97.8% | **FAIL** |
| `item.getAvailability` | ≤ 0.5s (PRF-04) | >10s (timeout) | >10s | >10s | 96.6% | **FAIL** |
| `item.getById` | — | >10s (timeout) | >10s | >10s | 97.4% | n/a |
| `loan.create` | ≤ 3s (PRF-02) | >10s (timeout) | >10s | >10s | 100% | **FAIL** |
| 10,000 units / 100,000 history rows present | PRF-05 | — | — | — | — | data loaded, but the app falls over on it |

A single, unloaded `item.list` request (no concurrency at all) against
this dataset took **2.9s** by itself — already over the 2s target before
any concurrent traffic is added. Under even 50 concurrent VUs the backend's
one Node process pegs a CPU core and most requests never return inside 10s.

## Root cause (best guess)

`ItemService.list` (`backend/src/item/item.service.ts:98`) loads **every**
`ItemInfo` row matching the filter via one `prisma.itemInfo.findMany`, with
a nested `select` that pulls in **every unit** of every matching type
(`Items: { ... Resource: { ManagementGroup, BorrowRuleInfo,
CurrentCondition, UsageLogs, Eligibilities, ... } }`), then computes
`availableUnits` and does the `available`/`name`/`popular`/`creditWeight`
sort **in JavaScript, in memory** (`sortItems` at line 616), before slicing
out the requested page. The code comments already flag this
(`"NOT sortable in SQL... the service pays for it differently"`,
`"computed in memory over the whole [result set]"`).

That is fine at seed-data scale (a few dozen units) but does not scale with
equipment count at all: one bulk `ItemInfo` type with 10,000 units means one
`item.list` call has to fetch and JS-sort ~10,000 deeply-joined rows (5
relations per unit) on every request, on a single Node event loop thread —
which is exactly why NFR-PRF-01 fails outright once NFR-PRF-05's data
volume is present, independent of concurrency, and why the failure gets
catastrophically worse (not just linearly worse) as concurrent load is
added: each CPU-bound sort blocks the event loop, so requests queue up
behind each other instead of running in parallel. `item.getAvailability`
(NFR-PRF-04) fails for a related but separate reason worth checking
separately — it queries a single item, so its slowness under load in
Dataset A is more likely event-loop contention from `item.list`'s
CPU-bound work than a scaling problem of its own; that should be reverified
once `item.list` is fixed.

The fix is architectural (move the availability count and the default sort
into SQL, or at least paginate the units subquery), not a tuning knob — an
index alone will not help a query that fetches every row into JS before
filtering.
