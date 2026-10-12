import type { Prisma } from '../../generated/prisma/client';
import { BusinessError } from '../errors/business-error';

/**
 * "This transaction lost a serialization race." Not a bug and not the caller's
 * fault - the work simply has to run again against what the winner committed.
 *
 * Two spellings, because the answer depends on how the query reached Postgres.
 * Prisma's own engine reports P2034; the pg driver adapter this project uses
 * (see PrismaService) wraps the driver's error instead, and the SQLSTATE comes
 * through on `cause.originalCode` with `code` left undefined. Matching only
 * P2034 meant every lost race escaped `runSerializable` as a raw
 * DriverAdapterError: no retry, and TransactionWriteConflict on the wire
 * instead of the business answer the second caller should have been given.
 */
const SERIALIZATION_FAILURE = 'P2034';

/** 40001 serialization_failure, 40P01 deadlock_detected - both mean "run it again". */
const RETRYABLE_SQLSTATES = new Set(['40001', '40P01']);

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
 * Runs a read-then-write at Serializable, retrying a lost race.
 *
 * Written for bookings and used by anything with the same shape — see
 * `admin.deleteFaculty`, where the read is "how many faculties are left" and
 * the write is the delete.
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
  if (typeof error !== 'object' || error === null) return false;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  if (code === SERIALIZATION_FAILURE) return true;
  if (typeof cause !== 'object' || cause === null) return false;
  const { originalCode } = cause as { originalCode?: unknown };
  return (
    typeof originalCode === 'string' && RETRYABLE_SQLSTATES.has(originalCode)
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
