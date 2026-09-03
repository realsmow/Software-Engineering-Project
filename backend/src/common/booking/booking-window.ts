import type { Prisma } from '../../generated/prisma/client';
import { BusinessError } from '../errors/business-error';
import { addDays } from '../schemas/datetime.schema';

/**
 * Which reservation states still hold a unit.
 *
 * `Rejected` and `Canceled` are gone; the other two are not. A `Pending`
 * request counts because two people may not queue for the same unit over the
 * same hours — whoever is approved second would find it already promised.
 */
export const HOLDING_APPROVE_STATES = ['Pending', 'Approved'] as const;

/**
 * Turns a requested window into the range that must be free.
 *
 * `ResourceInfo.BufferTime` is the days staff need around a loan — checking a
 * unit back in, testing it, charging it — so it is applied on *both* sides.
 * A one-day buffer on a unit due back Friday means the next borrower cannot
 * start before Saturday, and someone whose loan ends Thursday cannot be
 * followed by a Friday pickup.
 *
 * The buffer belongs to the unit, not to either request: it is the same delay
 * whichever direction the clash comes from.
 */
export function withBuffer(
  startTime: Date,
  endTime: Date,
  bufferDays: number,
): { from: Date; to: Date } {
  return {
    from: addDays(startTime, -bufferDays),
    to: addDays(endTime, bufferDays),
  };
}

/**
 * A Prisma filter for "reservations on this unit that clash with this window".
 *
 * Half-open on purpose: a booking that ends exactly when another starts does
 * not clash, once the buffer has already pushed them apart. Without that, a
 * room booked 09:00-10:00 would block the 10:00-11:00 slot on a zero-buffer
 * resource, and every back-to-back lecture slot would be unbookable.
 */
export function clashingWindowFilter(
  resourceKey: number,
  from: Date,
  to: Date,
  excludeReservationKey?: number,
): Prisma.ReservationsWhereInput {
  return {
    ResourceKey: resourceKey,
    ApproveStatus: { in: [...HOLDING_APPROVE_STATES] },
    StartTime: { lt: to },
    EndTime: { gt: from },
    ...(excludeReservationKey === undefined
      ? {}
      : { ReservationKey: { not: excludeReservationKey } }),
  };
}

/**
 * Postgres' code for "this transaction lost a serialization race", as Prisma
 * reports it. Not a bug and not the caller's fault - the work simply has to
 * run again against what the winner committed.
 */
const SERIALIZATION_FAILURE = 'P2034';

/** Enough for the contention two people clicking at once produce. */
const MAX_ATTEMPTS = 3;

/** The little of PrismaService `runSerializable` needs, so tests can pass a stub. */
export interface SerializableRunner {
  $transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T>;
}

/**
 * Runs a clash-checked booking write at Serializable, retrying a lost race.
 *
 * Every caller of `clashingWindowFilter` reads first and writes second: count
 * the reservations already holding the window, then insert or approve. At
 * Postgres' default Read Committed that is not enough. Two people submitting
 * the same unit over the same hours both read zero - neither can see the
 * other's uncommitted row - and both then write. FR-REQ-09 ("ต้อง roll back
 * คำขอที่ส่งช้ากว่า") needs the database to catch that, and only Serializable
 * does: it takes predicate locks over the rows the query *would* have matched,
 * so the second commit is refused.
 *
 * No unique index can stand in for this. "Nothing else overlaps this window on
 * this unit" is a range predicate, not an equality, so it needs either an
 * exclusion constraint - which the schema does not have - or this isolation
 * level.
 *
 * Retrying is the half that turns the refusal into a good answer. On the
 * second run the winner's row is committed and visible, so the clash check
 * itself throws WINDOW_NOT_AVAILABLE and the borrower reads "ช่วงเวลานี้ไม่ว่าง
 * แล้ว" instead of a database error. Only sustained contention gets as far as
 * TRANSACTION_CONFLICT.
 */
export async function runSerializable<T>(
  db: SerializableRunner,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(work, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (!isSerializationFailure(error)) throw error;
      if (attempt >= MAX_ATTEMPTS) {
        throw new BusinessError('TRANSACTION_CONFLICT', {
          attempts: MAX_ATTEMPTS,
        });
      }
      // Jittered, so two callers retrying together do not collide again on the
      // same tick and burn an attempt each.
      await delay(attempt * 10 + Math.floor(Math.random() * 10));
    }
  }
}

function isSerializationFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === SERIALIZATION_FAILURE
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
