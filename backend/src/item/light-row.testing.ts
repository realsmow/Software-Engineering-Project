/**
 * The extra columns `lightweightItemRows` computes in SQL, restated in JS for
 * specs that stand in for the query. Same rules as the mapper's
 * isBorrowable / unitReadyAt / typeTier, over units already filtered of
 * Retired ones.
 */
type Unit = {
  Resource: {
    ResourceStatus: string;
    AllowBorrow: boolean;
    BufferTime: number;
    BorrowRuleInfo: { RuleName: string | null };
    UsageLogs: { DueTime: Date; CurrentStatus: string }[];
  };
};

const DAY_MS = 86_400_000;

export function sqlAggregates(units: Unit[]) {
  const ready = units
    .map((u) => u.Resource.UsageLogs[0])
    .map((loan, i) =>
      loan && loan.CurrentStatus !== 'Returned'
        ? loan.DueTime.getTime() + units[i].Resource.BufferTime * DAY_MS
        : null,
    )
    .filter((at): at is number => at !== null);
  const tiered = units.find((u) =>
    ['T0', 'T1', 'T2', 'T3'].includes(
      (u.Resource.BorrowRuleInfo.RuleName ?? '').trim().toUpperCase(),
    ),
  );
  return {
    borrowableUnits: units.filter(
      (u) =>
        u.Resource.ResourceStatus !== 'Missing' &&
        u.Resource.ResourceStatus !== 'Retired' &&
        u.Resource.AllowBorrow,
    ).length,
    readyAt: ready.length ? new Date(Math.min(...ready)) : null,
    tier: tiered?.Resource.BorrowRuleInfo.RuleName ?? null,
  };
}
