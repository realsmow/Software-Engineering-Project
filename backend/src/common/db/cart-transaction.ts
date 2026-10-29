import type { PrismaService } from '../../prisma.service';
import type { AuditService } from '../audit/audit.service';
import { joinTransaction } from './join-transaction';
import { runSerializable } from './serializable';

/** A cart of ten lines runs a few dozen queries; Prisma's 5 s default is too tight on a slow host. */
const CART_TRANSACTION_TIMEOUT_MS = 30_000;

type AuditCall = Parameters<AuditService['record']>;

/**
 * Audit lines held back until the cart has committed: a line saying a unit
 * was handed over, for a hand-over that was then rolled back, would be false.
 */
export class DeferredAudit {
  private readonly calls: AuditCall[] = [];

  record(...call: AuditCall): Promise<void> {
    this.calls.push(call);
    return Promise.resolve();
  }

  async writeTo(audit: Pick<AuditService, 'record'>): Promise<void> {
    for (const call of this.calls) await audit.record(...call);
  }
}

/**
 * #236 step 2 (instructor item 1, team decision D-01): run one action for
 * every line of a cart as a single Serializable transaction - every line or
 * none. `work` gets the shared client and the held-back audit (see
 * `boundToCart`); the audit lines are written once the transaction has
 * committed. A lost serialization race or a deadlock retries the whole cart,
 * as runSerializable does for one line.
 */
export async function inCartTransaction<T>(
  prisma: PrismaService,
  audit: Pick<AuditService, 'record'>,
  work: (db: PrismaService, audits: DeferredAudit) => Promise<T>,
): Promise<T> {
  let audits = new DeferredAudit();
  const result = await runSerializable(
    prisma,
    (tx) => {
      // A retried attempt starts with no audit lines from the failed one.
      audits = new DeferredAudit();
      return work(joinTransaction(tx), audits);
    },
    { timeout: CART_TRANSACTION_TIMEOUT_MS },
  );
  await audits.writeTo(audit);
  return result;
}

/**
 * `service`, for one whole-cart action: the same object with its `prisma` and
 * `audit` swapped for the cart transaction's, so its per-item methods run
 * unchanged inside that transaction. The service must keep its database and
 * audit in fields named `prisma` and `audit`, as LoanService,
 * LoanRequestService and ApprovalService do.
 */
export function boundToCart<S extends object>(
  service: S,
  db: PrismaService,
  audits: DeferredAudit,
): S {
  return Object.assign(Object.create(service) as S, {
    prisma: db,
    audit: audits,
  });
}

/** Runs `step` for each line in turn and keeps the answers, in the same order. */
export async function eachLine<K, R>(
  lines: readonly K[],
  step: (line: K) => Promise<R>,
): Promise<R[]> {
  const answers: R[] = [];
  for (const line of lines) answers.push(await step(line));
  return answers;
}
