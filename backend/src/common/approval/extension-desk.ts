import type { Prisma } from '../../generated/prisma/client';
import { tryMapTier, type CreditTier } from '../schemas/status.schema';
import { extensionRouteFor, extensionWaitingOn } from './extension-policy';

/**
 * Enough of a pending extension to say whose desk it is on, and nothing else.
 *
 * The route is not a column: it is derived from the unit's tier, the
 * borrower's current credit band and how many extensions the loan has already
 * had, so the rows have to be read and counted in memory. There are only ever
 * a handful pending in one department, and the alternative — re-encoding the
 * policy as SQL — is the duplication that put a T2 extension in the staff
 * worklist and out of the staff counter at the same time (#202).
 */
const DESK_SELECT = {
  ExtendNo: true,
  InspectedCondition: true,
  RequestedByUser: { select: { UserCredit: true } },
  Usage: {
    select: {
      Resource: { select: { BorrowRuleInfo: { select: { RuleName: true } } } },
    },
  },
} satisfies Prisma.ExtensionRequestSelect;

type DeskRow = Prisma.ExtensionRequestGetPayload<{
  select: typeof DESK_SELECT;
}>;

/** The one Prisma call this needs, so a test can pass a stub. */
export interface ExtensionDeskReader {
  extensionRequest: {
    findMany(args: {
      where: Prisma.ExtensionRequestWhereInput;
      select: typeof DESK_SELECT;
    }): Promise<DeskRow[]>;
  };
}

export interface ExtensionDeskCounts {
  /** Waiting on the counter: a staff decision, or the T2 condition check. */
  staff: number;
  /** Checked and waiting on an academic's signature. */
  supervisor: number;
}

/**
 * How many pending extensions sit on each desk, within one caller's scope.
 *
 * Shared by the staff Work queue's "Extensions to check" and the supervisor
 * Approvals page's figures, so a row cannot be in one list and the other's
 * total. `toBand` is the caller's own credit-band mapper, passed in rather
 * than resolved here: both callers already hold one for the rest of their
 * screen and reading `CreditTier` twice per poll is waste.
 */
export async function countExtensionsByDesk(
  prisma: ExtensionDeskReader,
  resourceScope: Prisma.ResourceInfoWhereInput,
  toBand: (creditScore: number) => CreditTier,
): Promise<ExtensionDeskCounts> {
  const rows = await prisma.extensionRequest.findMany({
    where: { ApproveStatus: 'Pending', Usage: { Resource: resourceScope } },
    select: DESK_SELECT,
  });

  const counts: ExtensionDeskCounts = { staff: 0, supervisor: 0 };
  for (const row of rows) {
    const desk = extensionWaitingOn(
      extensionRouteFor({
        tier: tryMapTier(row.Usage.Resource.BorrowRuleInfo.RuleName),
        creditTier: toBand(row.RequestedByUser.UserCredit),
        extendNo: row.ExtendNo ?? 1,
      }),
      row.InspectedCondition !== null,
    );
    counts[desk] += 1;
  }
  return counts;
}
