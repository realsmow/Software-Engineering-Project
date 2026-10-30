import type { Prisma } from '../generated/prisma/client';
import { recomputeCredit } from '../common/credit/recompute-credit';

export interface PurgeTarget {
  accountKeys: number[];
  resourceKeys: number[];
  itemKeys: number[];
  groupKeys: number[];
  mediaKeys?: string[];
}

/**
 * Deletes accounts, units (equipment or rooms), equipment types and
 * departments together with every row made with them: loans, requests,
 * photos, inspections, penalties, appeals, extensions, condition records.
 *
 * Runs inside the caller's transaction. A row outside the target that still
 * points at something being deleted makes Postgres refuse, which rolls the
 * whole transaction back, so a wrong target never deletes half a record.
 *
 * People who keep their account but lose a penalty here get their credit
 * recalculated.
 */
export async function purge(tx: Prisma.TransactionClient, t: PurgeTarget) {
  const A = t.accountKeys;
  const R = t.resourceKeys;
  const G = t.groupKeys;

  const usages = (
    await tx.usageLog.findMany({
      where: { OR: [{ AccountKey: { in: A } }, { ResourceKey: { in: R } }] },
      select: { UsageKey: true },
    })
  ).map((u) => u.UsageKey);
  const reservations = await tx.reservations.findMany({
    where: { OR: [{ ReservedBy: { in: A } }, { ResourceKey: { in: R } }] },
    select: { ReservationKey: true, CartKey: true },
  });
  const reservationKeys = reservations.map((r) => r.ReservationKey);
  const carts = reservations
    .map((r) => r.CartKey)
    .filter((k): k is number => k !== null);
  const penalties = await tx.penaltyInfo.findMany({
    where: { OR: [{ UsageKey: { in: usages } }, { AccountKey: { in: A } }] },
    select: { PenaltyKey: true, AccountKey: true },
  });
  const penaltyKeys = penalties.map((p) => p.PenaltyKey);
  const inspections = (
    await tx.inspection.findMany({
      where: { OR: [{ UsageKey: { in: usages } }, { ResourceKey: { in: R } }] },
      select: { InspectionKey: true },
    })
  ).map((i) => i.InspectionKey);

  await tx.notification.deleteMany({ where: { AccountKey: { in: A } } });
  await tx.auditLog.deleteMany({ where: { ActorKey: { in: A } } });
  await tx.images.deleteMany({
    where: {
      OR: [
        { UsageKey: { in: usages } },
        { ResourceKey: { in: R } },
        { SubmittedBy: { in: A } },
        { InspectionKey: { in: inspections } },
      ],
    },
  });
  await tx.inspection.deleteMany({
    where: { InspectionKey: { in: inspections } },
  });
  await tx.appealInfo.deleteMany({
    where: {
      OR: [
        { FiledBy: { in: A } },
        { OriginalPenalty: { in: penaltyKeys } },
        { NewPenalty: { in: penaltyKeys } },
      ],
    },
  });
  await tx.penaltyInfo.deleteMany({
    where: { PenaltyKey: { in: penaltyKeys } },
  });
  await tx.usageLog.updateMany({
    where: { UsageKey: { in: usages } },
    data: { PendingExtension: null },
  });
  await tx.extensionRequest.deleteMany({ where: { UsageKey: { in: usages } } });
  await tx.repairLog.deleteMany({
    where: {
      OR: [
        { ResourceKey: { in: R } },
        { ReservationKey: { in: reservationKeys } },
      ],
    },
  });
  await tx.retirementRequest.deleteMany({ where: { ResourceKey: { in: R } } });
  await tx.usageLog.deleteMany({ where: { UsageKey: { in: usages } } });
  await tx.resourceInfo.updateMany({
    where: { ResourceKey: { in: R } },
    data: { ConditionKey: null },
  });
  await tx.roomCheckRound.deleteMany({ where: { ResourceKey: { in: R } } });
  await tx.conditionLog.deleteMany({
    where: { OR: [{ ResourceKey: { in: R } }, { LoggedBy: { in: A } }] },
  });
  await tx.reservations.deleteMany({
    where: { ReservationKey: { in: reservationKeys } },
  });
  await tx.requestCart.deleteMany({
    where: { CartKey: { in: carts }, Lines: { none: {} } },
  });
  await tx.eligibility.deleteMany({
    where: { OR: [{ ResourceKey: { in: R } }, { GroupKey: { in: G } }] },
  });
  await tx.authority.deleteMany({
    where: { OR: [{ AccountKey: { in: A } }, { ManageGroupKey: { in: G } }] },
  });
  await tx.itemIndiv.deleteMany({ where: { ResourceKey: { in: R } } });
  await tx.roomInfo.deleteMany({ where: { ResourceKey: { in: R } } });
  await tx.resourceInfo.deleteMany({ where: { ResourceKey: { in: R } } });
  await tx.itemInfo.deleteMany({
    where: { ItemKey: { in: t.itemKeys }, Items: { none: {} } },
  });
  await tx.branchInfo.deleteMany({ where: { ManageGroupKey: { in: G } } });
  await tx.clubInfo.deleteMany({ where: { ManageGroupKey: { in: G } } });
  await tx.managementGroup.deleteMany({ where: { ManageGroupKey: { in: G } } });
  if (t.mediaKeys?.length) {
    await tx.mediaFile.deleteMany({ where: { Key: { in: t.mediaKeys } } });
  }
  await tx.sessionInfo.deleteMany({ where: { AccountKey: { in: A } } });
  await tx.accountInfo.deleteMany({ where: { AccountKey: { in: A } } });

  // Lost a penalty but kept the account: credit is derived from penalties.
  const kept = [...new Set(penalties.map((p) => p.AccountKey))].filter(
    (k) => !A.includes(k),
  );
  for (const accountKey of kept) await recomputeCredit(tx, accountKey);

  return {
    loans: usages.length,
    requests: reservationKeys.length,
    penalties: penaltyKeys.length,
    creditRecalculated: kept.length,
  };
}
