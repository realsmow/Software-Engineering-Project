import { z } from 'zod';

/**
 * A primary key from this schema - every one is a Postgres `Int` (`serial`/
 * `autoincrement()`), never a `bigint`.
 *
 * `z.number().int().positive()` alone accepts anything up to
 * Number.MAX_SAFE_INTEGER (2^53-1). Postgres `int4` tops out at 2147483647;
 * anything past that reaches Prisma as a value the driver cannot encode, and
 * the resulting PrismaClientKnownRequestError carries its message (with a
 * server file path) straight through formatTrpcError - which strips
 * `data.stack` in production but never touches `shape.message`, so the leak
 * is not dev-only. Capping the input here turns it into an ordinary
 * BAD_REQUEST instead, for every procedure that uses this.
 */
export const dbId = z.number().int().positive().max(2147483647);
