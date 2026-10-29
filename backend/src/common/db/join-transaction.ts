import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma.service';

const JOINED = Symbol('joined-transaction');

/**
 * #236 step 2 (team decision D-01): a client for code that opens its own
 * transaction but has to run inside a bigger one - a per-item action reused
 * for a whole cart. `$transaction` joins the transaction already open instead
 * of starting another, so the reused code keeps every check, lock and write it
 * had, and the whole cart commits or rolls back as one. Everything else goes
 * straight to `tx`.
 */
export function joinTransaction(tx: Prisma.TransactionClient): PrismaService {
  return new Proxy(tx, {
    get(target, property) {
      if (property === JOINED) return true;
      if (property === '$transaction')
        return async (
          work:
            | ((transaction: Prisma.TransactionClient) => Promise<unknown>)
            | Promise<unknown>[],
        ) => {
          if (typeof work === 'function') return work(target);
          const rows: unknown[] = [];
          for (const query of work) rows.push(await query);
          return rows;
        };
      const value: unknown = Reflect.get(target, property);
      if (typeof value !== 'function') return value;
      // Called on `tx` itself, as Prisma's methods expect.
      const method = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]): unknown =>
        method.apply(target, args) as unknown;
    },
  }) as unknown as PrismaService;
}

/** True for a client made by `joinTransaction`. */
export function isJoinedTransaction(db: unknown): boolean {
  return (
    typeof db === 'object' &&
    db !== null &&
    (db as Record<symbol, unknown>)[JOINED] === true
  );
}
