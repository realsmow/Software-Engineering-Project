// Only the isolated test runner may opt into a fixed business clock. Network
// timers stay real; the browser uses Playwright's setFixedTime separately.
if (process.env.ULMS_TEST_NOW) {
  if (process.env.NODE_ENV !== 'test' || !new URL(process.env.DATABASE_URL).pathname.startsWith('/ulms_test_')) {
    throw new Error('The fixed clock requires an isolated ulms_test_ database');
  }
  const NativeDate = Date;
  const fs = require('node:fs');
  function timestamp() {
    const value = NativeDate.parse(process.env.ULMS_TEST_CLOCK_FILE ? fs.readFileSync(process.env.ULMS_TEST_CLOCK_FILE, 'utf8') : process.env.ULMS_TEST_NOW);
    if (!Number.isFinite(value)) throw new Error('Invalid test clock');
    return value;
  }
  global.Date = class extends NativeDate {
    constructor(...args) {
      if (args.length === 0) super(timestamp());
      else super(...args);
    }
    static now() { return timestamp(); }
  };
}
