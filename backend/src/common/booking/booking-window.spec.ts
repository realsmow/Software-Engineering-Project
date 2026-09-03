import {
  clashingWindowFilter,
  runSerializable,
  withBuffer,
  type SerializableRunner,
} from './booking-window';
import { BusinessError } from '../errors/business-error';

/**
 * The overlap rule, which decides whose request gets cancelled.
 *
 * Every case below is a real complaint waiting to happen: a room that cannot
 * be booked back to back, or two people promised the same multimeter.
 */

const at = (iso: string) => new Date(iso);

describe('withBuffer', () => {
  it('pads both ends, because the delay belongs to the unit', () => {
    const { from, to } = withBuffer(
      at('2026-09-10T03:00:00Z'),
      at('2026-09-12T03:00:00Z'),
      1,
    );
    expect(from).toEqual(at('2026-09-09T03:00:00Z'));
    expect(to).toEqual(at('2026-09-13T03:00:00Z'));
  });

  it('leaves the window alone when the unit needs no preparation', () => {
    const start = at('2026-09-10T03:00:00Z');
    const end = at('2026-09-10T05:00:00Z');
    const { from, to } = withBuffer(start, end, 0);
    expect(from).toEqual(start);
    expect(to).toEqual(end);
  });
});

describe('clashingWindowFilter', () => {
  const filter = clashingWindowFilter(
    7,
    at('2026-09-09T00:00:00Z'),
    at('2026-09-13T00:00:00Z'),
  );

  it('looks only at requests that still hold the unit', () => {
    // Rejected and Canceled rows are history; a query that counted them would
    // block a unit forever after one refusal.
    expect(filter.ApproveStatus).toEqual({ in: ['Pending', 'Approved'] });
  });

  it('is half-open, so back-to-back bookings do not collide', () => {
    // A slot ending exactly when the next begins must stay bookable, or every
    // consecutive lecture hour on a zero-buffer room is unreachable.
    expect(filter.StartTime).toEqual({ lt: at('2026-09-13T00:00:00Z') });
    expect(filter.EndTime).toEqual({ gt: at('2026-09-09T00:00:00Z') });
  });

  it('can exclude the request being decided', () => {
    // Approving a request must not find that request clashing with itself.
    const excluding = clashingWindowFilter(
      7,
      at('2026-09-09T00:00:00Z'),
      at('2026-09-13T00:00:00Z'),
      42,
    );
    expect(excluding.ReservationKey).toEqual({ not: 42 });
    expect(filter.ReservationKey).toBeUndefined();
  });
});

/**
 * The retry loop, which is the half of Serializable that decides what the
 * borrower actually reads.
 *
 * Serializable alone only guarantees the second writer is refused. Without a
 * retry that refusal reaches the screen as a database error; with one, the
 * rerun sees the winner's committed row and the clash check answers properly.
 */
describe('runSerializable', () => {
  /** Postgres losing a serialization race, shaped the way Prisma reports it. */
  const writeConflict = () =>
    Object.assign(new Error('write conflict'), { code: 'P2034' });

  /** A Prisma stub that fails the given number of times, then lets the work run. */
  const runnerThatFails = (...errors: Error[]) => {
    const isolationLevels: (string | undefined)[] = [];
    let attempt = 0;

    const db: SerializableRunner = {
      $transaction: async (fn, options) => {
        isolationLevels.push(options?.isolationLevel);
        const failure = errors[attempt++];
        if (failure) throw failure;
        return await fn({} as never);
      },
    };

    return { db, isolationLevels };
  };

  const work =
    <T>(value: T) =>
    () =>
      Promise.resolve(value);

  it('asks for Serializable, not the default isolation level', async () => {
    const { db, isolationLevels } = runnerThatFails();
    await runSerializable(db, work('done'));
    expect(isolationLevels).toEqual(['Serializable']);
  });

  it('runs the work again when it loses the race, so the rerun sees the winner', async () => {
    const { db, isolationLevels } = runnerThatFails(writeConflict());
    await expect(runSerializable(db, work('second time lucky'))).resolves.toBe(
      'second time lucky',
    );
    expect(isolationLevels).toHaveLength(2);
  });

  it('gives up as a business error, never as a raw database error', async () => {
    const { db, isolationLevels } = runnerThatFails(
      writeConflict(),
      writeConflict(),
      writeConflict(),
    );
    await expect(runSerializable(db, work('never reached'))).rejects.toThrow(
      BusinessError,
    );
    // Bounded: three attempts, not a loop that hammers a contended row.
    expect(isolationLevels).toHaveLength(3);
  });

  it('lets a real failure through untouched - only a lost race is retried', async () => {
    const boom = new Error('column does not exist');
    const { db, isolationLevels } = runnerThatFails(boom);
    await expect(runSerializable(db, work('never reached'))).rejects.toBe(boom);
    expect(isolationLevels).toHaveLength(1);
  });
});
