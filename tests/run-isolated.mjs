// Runs the current application against a new, disposable local database.
// The existing development database is never migrated, seeded or dropped.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  cp,
  mkdir,
  mkdtemp,
  open,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { resolve, dirname, basename, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "backend/package.json"));
require("dotenv").config({ path: resolve(root, "backend/.env"), quiet: true });
const { Client } = require("pg");
const mode = process.argv[2] ?? "--all";
if (!["--all", "--backend", "--e2e", "--load"].includes(mode))
  throw new Error("Use --all, --backend, --e2e or --load");
const url = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname))
  throw new Error("Only a local database is allowed");
const database = `ulms_test_${Date.now()}_${process.pid}`;
const admin = new Client({ connectionString: url.toString() });
const servers = [];
let created = false;
let mediaRoot;
const env = { ...process.env, NODE_ENV: "test" };
const artifacts = resolve(root, "tests/.artifacts");
const clockOptions = `--require="${resolve(root, "tests/e2e/fixtures/fixed-clock.cjs").replaceAll("\\", "/")}"`;
await mkdir(artifacts, { recursive: true });

async function requireFreePort(port) {
  const probe = createServer();
  await new Promise((done, reject) => {
    probe.once("error", () =>
      reject(
        new Error(
          `Port ${port} is in use; stop the existing server before running isolated tests`,
        ),
      ),
    );
    probe.listen(port, "127.0.0.1", () => probe.close(done));
  });
}
if (mode !== "--backend") {
  await requireFreePort(3000);
  if (mode !== "--load") await requireFreePort(5173);
}

function run(script, args, cwd = root, childEnv = env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [resolve(root, script), ...args], {
      cwd,
      env: childEnv,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolveRun() : reject(new Error(`${script} exited ${code}`)),
    );
  });
}
async function serve(script, args, cwd, childEnv, name) {
  const log = await open(resolve(artifacts, `${name}.log`), "w");
  const child = spawn(process.execPath, [resolve(root, script), ...args], {
    cwd,
    env: childEnv,
    stdio: ["ignore", log.fd, log.fd],
    windowsHide: true,
  });
  child.on("error", (error) => console.error(`${name}: ${error.message}`));
  servers.push({ child, log });
  return child;
}
async function ready(address, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`Server exited; see ${artifacts}`);
    try {
      if ((await fetch(address)).ok) return;
    } catch {
      /* starting */
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`Server did not become ready: ${address}`);
}
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  url.pathname = `/${database}`;
  env.DATABASE_URL = url.toString();
  console.log(`Isolated database: ${database}`);
  await run(
    "backend/node_modules/prisma/build/index.js",
    ["migrate", "deploy"],
    resolve(root, "backend"),
  );
  if (mode === "--backend" || mode === "--all") {
    await run(
      "backend/node_modules/jest/bin/jest.js",
      [
        "--runInBand",
        "--silent",
        "--coverage",
        "--collectCoverageFrom=src/**/*.ts",
        "--collectCoverageFrom=!src/generated/**",
        "--collectCoverageFrom=!src/**/*.spec.ts",
        "--coverageReporters=text-summary",
        "--coverageReporters=json-summary",
        "--coverageReporters=json",
      ],
      resolve(root, "backend"),
      { ...env, NODE_OPTIONS: "--experimental-vm-modules" },
    );
  }
  if (mode === "--all") {
    await run(
      "frontend/node_modules/vitest/vitest.mjs",
      [
        "run",
        "--coverage",
        "--coverage.all",
        "--coverage.include=src/**/*.{ts,tsx}",
        "--coverage.reporter=text-summary",
        "--coverage.reporter=json-summary",
        "--silent",
      ],
      resolve(root, "frontend"),
    );
  }
  if (mode !== "--backend") {
    // Generate and compile a disposable copy: committed src/generated may be
    // stale, and refreshing it in the checkout would violate the src boundary.
    const runtime = resolve(artifacts, database, "backend");
    await mkdir(runtime, { recursive: true });
    await cp(resolve(root, "backend/src"), resolve(runtime, "src"), {
      recursive: true,
    });
    await cp(resolve(root, "backend/prisma"), resolve(runtime, "prisma"), {
      recursive: true,
    });
    await symlink(
      resolve(root, "backend/node_modules"),
      resolve(runtime, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await writeFile(
      resolve(runtime, "tsconfig.json"),
      JSON.stringify({
        extends: resolve(root, "backend/tsconfig.json"),
        compilerOptions: {
          rootDir: "./src",
          outDir: "./dist",
          incremental: false,
          declaration: false,
        },
        include: ["src/**/*.ts"],
        exclude: ["src/**/*.spec.ts"],
      }),
    );
    await run(
      "backend/node_modules/prisma/build/index.js",
      ["generate", "--schema", resolve(runtime, "prisma/schema.prisma")],
      resolve(root, "backend"),
    );
    await run("backend/node_modules/typescript/bin/tsc", [
      "--project",
      resolve(runtime, "tsconfig.json"),
    ]);
    await run(resolve(runtime, "dist/seed.js"), [], resolve(root, "backend"));
    const clockFile = resolve(artifacts, database, "clock.txt");
    await writeFile(clockFile, "2031-09-26T00:00:00.000Z");
    // Express refuses files with any hidden ancestor (including .gemini).
    mediaRoot = await mkdtemp(resolve(tmpdir(), "ulms-test-media-"));
    const serverEnv = {
      ...env,
      PORT: "3000",
      PUBLIC_API_URL: "http://localhost:3000",
      MEDIA_ROOT: mediaRoot,
      ULMS_TEST_NOW: "2031-09-26T00:00:00.000Z",
      ULMS_TEST_CLOCK_FILE: clockFile,
    };
    const backend = await serve(
      resolve(runtime, "dist/main.js"),
      [],
      resolve(root, "backend"),
      mode === "--load"
        ? {
            ...serverEnv,
            ULMS_TEST_NOW: undefined,
            ULMS_TEST_CLOCK_FILE: undefined,
          }
        : { ...serverEnv, NODE_OPTIONS: clockOptions },
      "backend",
    );
    await ready("http://localhost:3000/trpc/auth.providers", backend);
    if (mode === "--load") {
      await new Promise((done, reject) => {
        const child = spawn(
          "k6",
          [
            "run",
            resolve(root, "tests/load/admin-system-load.k6.js"),
            "--summary-export",
            resolve(artifacts, "load-summary.json"),
          ],
          { env, stdio: "inherit", windowsHide: true },
        );
        child.on("error", reject);
        child.on("exit", (code) =>
          code === 0 ? done() : reject(new Error(`k6 exited ${code}`)),
        );
      });
    } else {
      const frontend = await serve(
        "frontend/node_modules/vite/bin/vite.js",
        ["--host", "127.0.0.1", "--port", "5173", "--strictPort"],
        resolve(root, "frontend"),
        env,
        "frontend",
      );
      await ready("http://localhost:5173", frontend);
      await run(
        "node_modules/@playwright/test/cli.js",
        ["test", "--reporter=list,json", ...process.argv.slice(3)],
        root,
        {
          ...serverEnv,
          NODE_OPTIONS: clockOptions,
          PLAYWRIGHT_JSON_OUTPUT_NAME: resolve(artifacts, "e2e-results.json"),
        },
      );
      await run("tests/check-e2e-report.mjs", []);
    }
  }
} finally {
  for (const { child, log } of servers.reverse()) {
    if (child.exitCode === null) {
      const stopped = new Promise((done) => child.once("exit", done));
      child.kill();
      await stopped;
    }
    await log.close();
  }
  if (created) {
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [database],
    );
    await admin.query(`DROP DATABASE "${database}"`);
    console.log(`Removed isolated database: ${database}`);
  }
  if (mediaRoot) {
    const target = resolve(mediaRoot);
    if (
      !target.startsWith(resolve(tmpdir()) + sep) ||
      !basename(target).startsWith("ulms-test-media-")
    )
      throw new Error("Unsafe temporary media cleanup path");
    await rm(target, { recursive: true, force: true });
  }
  await admin.end();
}
