import type { Prisma } from '../../generated/prisma/client';
import { activePenaltyWhere } from '../schemas/penalty.schema';

/** FR-CRD-01: everyone starts at 100. */
export const BASE_CREDIT = 100;

type CreditWriter = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'penaltyInfo' | 'accountInfo'
>;

/**
 * FR-CRD-06: the score is 100 minus the penalties still in force, never
 * adjusted by hand. `UserCredit` is kept only as a stored copy of that sum so
 * every screen can read it cheaply; this is the one place that writes it.
 *
 * Call it inside the transaction that changed the penalties. The account row
 * is locked first, so the sum below sees any penalty another transaction wrote
 * for the same person; without the lock two deductions landing together could
 * each write a total that is missing the other.
 */
export async function recomputeCredit(
  tx: CreditWriter,
  accountKey: number,
): Promise<number> {
  await tx.$queryRaw`SELECT 1 FROM "AccountInfo" WHERE "AccountKey" = ${accountKey} FOR UPDATE`;
  const { _sum } = await tx.penaltyInfo.aggregate({
    where: { AccountKey: accountKey, ...activePenaltyWhere() },
    _sum: { CreditDeducted: true },
  });
  const score = Math.max(0, BASE_CREDIT - (_sum.CreditDeducted ?? 0));
  await tx.accountInfo.update({
    where: { AccountKey: accountKey },
    data: { UserCredit: score },
  });
  return score;
}
