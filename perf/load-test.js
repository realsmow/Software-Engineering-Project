#!/usr/bin/env node
// Dependency-light load test for the SRS performance requirements
// (NFR-PRF-01..04). No packages beyond Node 22's built-in `fetch`.
//
// Usage:
//   node perf/load-test.js [--base http://localhost:3000] [--vus 200]
//     [--duration 60000] [--ramp 10000] [--out perf/results-dev.json]
//
// What it does:
//   1. Logs in once as test_borrower and once as test_staff, keeps the two
//      session cookies, and reuses them for every virtual user (VU) - the
//      backend rate-limits login itself, so hammering it with 200 separate
//      logins would just trip NFR-SEC-05's throttle instead of measuring
//      anything.
//   2. Finds one T0 (walk-in) item with free units to use as the load target
//      for item.getById / item.getAvailability / loan.create+cancel.
//   3. Ramps virtual users from 0 to --vus over --ramp ms, holds for
//      --duration ms, then stops. Each VU loops picking a weighted-random
//      endpoint and recording latency + outcome.
//   4. Prints p50/p95/p99 and error rate per endpoint, and writes the raw
//      samples to --out as JSON.

// Node's global fetch (undici) defaults to a small per-origin connection
// pool, which would serialize most of our "concurrent" virtual users through
// a handful of sockets and measure the test client, not the server. Raise it
// to comfortably exceed --vus. This is the one place this script needs a
// dependency (perf/package.json's only devDependency) - nothing in
// backend/ or frontend/ was touched to get it.
try {
  const { Agent, setGlobalDispatcher } = await import('undici');
  setGlobalDispatcher(new Agent({ connections: 1000, pipelining: 1 }));
} catch {
  console.warn('[perf] undici not installed (run `npm install` in perf/) - falling back to the default connection pool, which will understate concurrency.');
}

const args = parseArgs(process.argv.slice(2));
const BASE = args.base || 'http://localhost:3000';
const MAX_VUS = Number(args.vus || 200);
const DURATION_MS = Number(args.duration || 60_000);
const RAMP_MS = Number(args.ramp || 10_000);
// Pause between one user's actions, randomised 50-150%. Real users read the
// page between clicks; 0 turns this into a stress test with every user always
// mid-request, which is far more than NFR-PRF-03's 200 concurrent users.
const THINK_MS = Number(args.think ?? 5_000);
const OUT = args.out || null;
const REQUEST_TIMEOUT_MS = 10_000;

const BORROWER = { username: 'test_borrower', password: 'borrower1234' };
const STAFF = { username: 'test_staff', password: 'staff1234' };

/** endpoint -> array of { ms, ok, code } samples */
const samples = new Map();

function record(endpoint, ms, ok, code) {
  if (!samples.has(endpoint)) samples.set(endpoint, []);
  samples.get(endpoint).push({ ms, ok, code: code ?? null });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

async function timed(fn) {
  const start = performance.now();
  try {
    const result = await fn();
    return { ms: performance.now() - start, ok: true, result };
  } catch (err) {
    return { ms: performance.now() - start, ok: false, error: err };
  }
}

async function fetchWithTimeout(url, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** POST a tRPC mutation. Returns { ok, status, code, data }. */
async function trpcMutate(path, cookie, input) {
  const res = await fetchWithTimeout(`${BASE}/trpc/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(input ?? {}),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.error) {
    return { ok: false, status: res.status, code: body?.error?.data?.code ?? body?.error?.message ?? res.status, data: body };
  }
  return { ok: true, status: res.status, data: body?.result?.data };
}

/** GET a tRPC query. Returns { ok, status, code, data }. */
async function trpcQuery(path, cookie, input) {
  const qs = input !== undefined ? `?input=${encodeURIComponent(JSON.stringify(input))}` : '';
  const res = await fetchWithTimeout(`${BASE}/trpc/${path}${qs}`, {
    method: 'GET',
    headers: { Cookie: cookie },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.error) {
    return { ok: false, status: res.status, code: body?.error?.data?.code ?? body?.error?.message ?? res.status, data: body };
  }
  return { ok: true, status: res.status, data: body?.result?.data };
}

function extractCookie(res) {
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  return raw.split(';')[0];
}

async function login(creds) {
  const res = await fetchWithTimeout(`${BASE}/trpc/auth.login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
  });
  const cookie = extractCookie(res);
  const body = await res.json().catch(() => null);
  if (!res.ok || !cookie || body?.error) {
    throw new Error(
      `login failed for ${creds.username}: ${res.status} ${JSON.stringify(body?.error ?? body)}`,
    );
  }
  return cookie;
}

/** Finds one T0, borrowable item with a free unit to hammer. */
async function findLoadTargetItem(cookie) {
  const list = await trpcQuery('item.list', cookie, {
    page: 1,
    pageSize: 100,
    tier: 'T0',
    availableOnly: true,
    sort: 'available',
  });
  if (!list.ok || !list.data.items.length) {
    throw new Error('no T0 item with free units found - cannot build a load target');
  }
  // Prefer an item with several free units so create/cancel churn does not
  // starve itself under high concurrency.
  const item = [...list.data.items].sort((a, b) => b.availableUnits - a.availableUnits)[0];
  const units = await trpcQuery('item.listUnits', cookie, { id: item.id });
  const resourceKeys = units.data
    .filter((u) => u.allowBorrow && u.status === 'InStorage')
    .map((u) => u.resourceKey);
  if (!resourceKeys.length) throw new Error(`item ${item.id} has no lendable units`);
  return { itemId: item.id, resourceKeys };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarize() {
  const rows = [];
  for (const [endpoint, list] of samples) {
    const times = list.map((s) => s.ms).sort((a, b) => a - b);
    const errors = list.filter((s) => !s.ok);
    rows.push({
      endpoint,
      count: list.length,
      p50: percentile(times, 50),
      p95: percentile(times, 95),
      p99: percentile(times, 99),
      errorRate: list.length ? errors.length / list.length : 0,
      sampleErrorCodes: [...new Set(errors.slice(0, 5).map((e) => e.code))],
    });
  }
  return rows;
}

function fmt(ms) {
  return ms === null ? 'n/a' : `${ms.toFixed(0)}ms`;
}

async function main() {
  console.log(`[perf] target ${BASE}, ramping to ${MAX_VUS} VUs over ${RAMP_MS}ms, holding ${DURATION_MS}ms`);

  let borrowerCookie, staffCookie;
  try {
    borrowerCookie = await login(BORROWER);
    staffCookie = await login(STAFF);
  } catch (err) {
    console.error('[perf] login failed:', err.message);
    console.error('[perf] if this is TOO_MANY_ATTEMPTS, the per-IP/per-account login throttle');
    console.error('[perf] (backend/src/auth/login-throttle.service.ts) is active - wait 15 min or restart the backend.');
    process.exit(1);
  }
  console.log('[perf] logged in as test_borrower and test_staff, reusing both cookies for every VU');

  const target = await findLoadTargetItem(borrowerCookie);
  console.log(`[perf] load target: item ${target.itemId}, ${target.resourceKeys.length} lendable unit(s)`);

  const startAt = Date.now();
  const rampEndAt = startAt + RAMP_MS;
  const stopAt = rampEndAt + DURATION_MS;

  let rkCursor = 0;
  function nextResourceKey() {
    const key = target.resourceKeys[rkCursor % target.resourceKeys.length];
    rkCursor++;
    return key;
  }

  // r.ok (from `timed`) means "did not throw" (no network error/timeout).
  // r.result.ok means "the tRPC call itself succeeded". Both must hold for
  // a genuine success; the reported code distinguishes exceptions from
  // business-error responses.
  function outcome(r) {
    if (!r.ok) return { success: false, code: 'EXCEPTION' };
    if (!r.result.ok) return { success: false, code: r.result.code };
    return { success: true, code: null };
  }

  async function doItemList() {
    const r = await timed(() =>
      trpcQuery('item.list', borrowerCookie, { page: 1, pageSize: 100 }),
    );
    const o = outcome(r);
    record('item.list', r.ms, o.success, o.code);
  }

  async function doAvailability() {
    const r = await timed(() =>
      trpcQuery('item.getAvailability', borrowerCookie, { id: target.itemId }),
    );
    const o = outcome(r);
    record('item.getAvailability', r.ms, o.success, o.code);
  }

  async function doGetById() {
    const r = await timed(() => trpcQuery('item.getById', borrowerCookie, { id: target.itemId }));
    const o = outcome(r);
    record('item.getById', r.ms, o.success, o.code);
  }

  async function doCreateCancel() {
    const now = new Date(Date.now() + 2 * 60_000); // 2 min from now, still "today"
    const end = new Date(now.getTime() + 60 * 60_000); // +1h
    const resourceKey = nextResourceKey();

    const createR = await timed(() =>
      trpcMutate('loan.create', borrowerCookie, {
        startTime: now.toISOString(),
        endTime: end.toISOString(),
        lines: [{ resourceKey }],
      }),
    );
    const createOutcome = outcome(createR);
    record('loan.create', createR.ms, createOutcome.success, createOutcome.code);

    if (!createOutcome.success) return;
    const created = createR.result.data.created[0];
    if (!created) return; // line was rejected (RESOURCE_UNAVAILABLE etc.) - nothing to cancel

    const cancelR = await timed(() =>
      trpcMutate('loan.cancel', borrowerCookie, {
        reservationKey: created.reservationKey,
        reason: 'perf load test cleanup',
      }),
    );
    const cancelOutcome = outcome(cancelR);
    record('loan.cancel', cancelR.ms, cancelOutcome.success, cancelOutcome.code);
  }

  // Weighted mix, mirroring real traffic: catalogue browsing and polling
  // dominate; creating a loan is comparatively rare.
  const WEIGHTED_TASKS = [
    ...Array(4).fill(doItemList),
    ...Array(3).fill(doAvailability),
    ...Array(2).fill(doGetById),
    ...Array(1).fill(doCreateCancel),
  ];

  function pickTask() {
    return WEIGHTED_TASKS[Math.floor(Math.random() * WEIGHTED_TASKS.length)];
  }

  async function vuLoop(vuIndex) {
    const myStart = startAt + (vuIndex / MAX_VUS) * RAMP_MS;
    const waitMs = myStart - Date.now();
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

    while (Date.now() < stopAt) {
      await pickTask()();
      if (THINK_MS > 0) {
        await new Promise((r) => setTimeout(r, THINK_MS * (0.5 + Math.random())));
      }
    }
  }

  const vus = [];
  for (let i = 0; i < MAX_VUS; i++) vus.push(vuLoop(i));

  // Progress ping every 10s so a long run is not silent.
  const ping = setInterval(() => {
    const total = [...samples.values()].reduce((n, l) => n + l.length, 0);
    console.log(`[perf] t+${((Date.now() - startAt) / 1000).toFixed(0)}s, ${total} requests so far`);
  }, 10_000);

  await Promise.all(vus);
  clearInterval(ping);

  const rows = summarize();
  console.log('\n[perf] results:');
  console.table(
    rows.map((r) => ({
      endpoint: r.endpoint,
      count: r.count,
      p50: fmt(r.p50),
      p95: fmt(r.p95),
      p99: fmt(r.p99),
      errorRate: `${(r.errorRate * 100).toFixed(1)}%`,
      sampleErrors: r.sampleErrorCodes.join(',') || '-',
    })),
  );

  if (OUT) {
    const fs = await import('node:fs');
    fs.writeFileSync(OUT, JSON.stringify({ base: BASE, maxVus: MAX_VUS, durationMs: DURATION_MS, rampMs: RAMP_MS, rows }, null, 2));
    console.log(`[perf] wrote ${OUT}`);
  }
}

main().catch((err) => {
  console.error('[perf] fatal:', err);
  process.exit(1);
});
