import { Prisma } from '../../generated/prisma/client';

/** Tables whose rows a state change locks, and their key column. */
const KEY_COLUMN = {
  Reservations: 'ReservationKey',
  UsageLog: 'UsageKey',
  AppealInfo: 'AppealKey',
} as const;

export type LockableTable = keyof typeof KEY_COLUMN;

/**
 * Locks one row for the rest of the transaction (SELECT ... FOR UPDATE).
 *
 * #220: every state change read the state first and wrote second, so two
 * clicks at once both passed the check and both wrote. With the row locked
 * first, the second caller waits for the first to commit and then re-reads
 * the state it left, so it gets "already done" instead of doing it again.
 * Re-read the state after calling this, inside the same transaction.
 */
export async function lockRow(
  tx: Prisma.TransactionClient,
  table: LockableTable,
  key: number,
): Promise<void> {
  // Table and column come from the constant above, never from input.
  await tx.$queryRaw(
    Prisma.sql`SELECT 1 FROM ${Prisma.raw(`"${table}"`)} WHERE ${Prisma.raw(
      `"${KEY_COLUMN[table]}"`,
    )} = ${key} FOR UPDATE`,
  );
}
