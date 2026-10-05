import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { isolatedMailEnv } from "../e2e/fixtures/isolated-mail.cjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const execute = promisify(execFile);
// Compile only the real mail-settings module, with the backend's own compiler
// and Nodemailer. No application server, database or developer SMTP is needed.
const send = `
  const { createRequire, Module } = require('node:module');
  const { readFileSync } = require('node:fs');
  const { resolve, dirname } = require('node:path');
  const backendRequire = createRequire(resolve('backend/package.json'));
  const ts = backendRequire('typescript');
  const path = resolve('backend/src/common/mail/mailer.ts');
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
  });
  const source = new Module(path);
  source.filename = path;
  source.paths = Module._nodeModulePaths(dirname(path));
  source._compile(compiled.outputText, path);
  const { mailer } = source.exports.mailSettings({ get: key => process.env[key] });
  mailer.sendMail({
    from: 'qa@example.test', to: 'borrower@example.test',
    subject: 'ULMs: ใกล้ครบกำหนดคืน', text: 'Lifecycle T2 due in 2031',
  }).then(info => {
    console.log(JSON.stringify({ message: JSON.parse(info.message), now: Date.now() }));
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
`;

async function smtpProbe(t) {
  let connections = 0;
  const server = createServer((socket) => {
    connections++;
    socket.end("554 QA connection probe; no mail accepted\r\n");
  });
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  t.after(() => new Promise((done) => server.close(done)));
  return {
    port: String(server.address().port),
    connections: () => connections,
  };
}

function environment(port, extra = {}) {
  return {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://qa:qa@localhost:5432/ulms_test_123_456",
    NODE_OPTIONS: "",
    ULMS_TEST_MAIL_ISOLATED: undefined,
    ULMS_TEST_NOW: undefined,
    ULMS_TEST_CLOCK_FILE: undefined,
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: port,
    SMTP_SECURE: "false",
    SMTP_USER: "",
    SMTP_PASS: "",
    ...extra,
  };
}

const childOptions = (env) => ({
  cwd: root,
  env,
  timeout: 10_000,
  windowsHide: true,
});

test("NODE_ENV=test alone still connects the real mailer to configured SMTP", async (t) => {
  const probe = await smtpProbe(t);
  await assert.rejects(
    execute(
      process.execPath,
      ["--eval", send],
      childOptions(environment(probe.port)),
    ),
  );
  assert.equal(probe.connections(), 1);
});

for (const scenario of [
  { name: "plain local SMTP", config: {} },
  {
    name: "authenticated TLS SMTP",
    config: { SMTP_SECURE: "true", SMTP_USER: "qa", SMTP_PASS: "qa-password" },
  },
  {
    name: "fixed E2E clock and authenticated STARTTLS SMTP",
    config: {
      SMTP_USER: "qa",
      SMTP_PASS: "qa-password",
      ULMS_TEST_NOW: "2031-09-26T00:00:00.000Z",
      NODE_OPTIONS: `--require="${resolve(root, "tests/e2e/fixtures/fixed-clock.cjs").replaceAll("\\", "/")}"`,
    },
  },
]) {
  test(`isolated runner mail stays in memory with ${scenario.name}`, async (t) => {
    const probe = await smtpProbe(t);
    const env = isolatedMailEnv(environment(probe.port, scenario.config));
    const started = Date.now();
    const { stdout } = await execute(
      process.execPath,
      ["--eval", send],
      childOptions(env),
    );
    const result = JSON.parse(stdout);
    assert.equal(result.message.subject, "ULMs: ใกล้ครบกำหนดคืน");
    assert.equal(result.message.text, "Lifecycle T2 due in 2031");
    assert.match(JSON.stringify(result.message.to), /borrower@example\.test/);
    assert.equal(probe.connections(), 0);
    if (scenario.config.ULMS_TEST_NOW) {
      assert.equal(result.now, Date.parse(scenario.config.ULMS_TEST_NOW));
    } else {
      assert.ok(result.now >= started && result.now <= Date.now());
    }
  });
}

for (const [name, config] of [
  ["non-test process", { NODE_ENV: "production" }],
  [
    "application database",
    { DATABASE_URL: "postgresql://qa:qa@localhost:5432/app" },
  ],
  [
    "non-local database",
    {
      DATABASE_URL: "postgresql://qa:qa@db.example.test:5432/ulms_test_123_456",
    },
  ],
]) {
  test(`mail isolation refuses a ${name}`, async () => {
    const env = isolatedMailEnv(environment("1025", config));
    await assert.rejects(
      execute(
        process.execPath,
        ["--eval", "throw new Error('Application must not start')"],
        childOptions(env),
      ),
      (error) => {
        assert.match(
          error.stderr,
          /Mail isolation requires a local isolated ulms_test_ database/,
        );
        assert.doesNotMatch(error.stderr, /Application must not start/);
        return true;
      },
    );
  });
}
