// Freeze business dates while keeping PostgreSQL I/O and transaction timers real.
export function freezeBusinessDate(now: Date): void {
  jest.useFakeTimers({
    now,
    doNotFake: [
      'nextTick',
      'setImmediate',
      'clearImmediate',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'hrtime',
      'performance',
      'queueMicrotask',
    ],
  });
}
