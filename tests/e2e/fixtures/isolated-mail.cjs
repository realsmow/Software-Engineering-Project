// Preloaded only in the isolated backend process. SMTP settings may still be
// reported by the application, but its Nodemailer transports stay in memory.
const { createRequire } = require("node:module");
const { resolve } = require("node:path");

exports.isolatedMailEnv = function isolatedMailEnv(env) {
  const preload = `--require="${__filename.replaceAll("\\", "/")}"`;
  return {
    ...env,
    ULMS_TEST_MAIL_ISOLATED: "1",
    NODE_OPTIONS: [env.NODE_OPTIONS, preload].filter(Boolean).join(" "),
  };
};

if (process.env.ULMS_TEST_MAIL_ISOLATED === "1") {
  const database = new URL(process.env.DATABASE_URL);
  if (
    process.env.NODE_ENV !== "test" ||
    !["localhost", "127.0.0.1", "::1"].includes(database.hostname) ||
    !/^\/ulms_test_\d+_\d+$/.test(database.pathname)
  ) {
    throw new Error(
      "Mail isolation requires a local isolated ulms_test_ database",
    );
  }
  const requireBackend = createRequire(
    resolve(__dirname, "../../../backend/package.json"),
  );
  const nodemailer = requireBackend("nodemailer");
  const createTransport = nodemailer.createTransport;
  const jsonTransport = (_options, defaults) =>
    createTransport({ jsonTransport: true }, defaults);
  nodemailer.createTransport = jsonTransport;
  // Nodemailer 10 also exposes a default object in its CommonJS build.
  if (nodemailer.default) nodemailer.default.createTransport = jsonTransport;
}
