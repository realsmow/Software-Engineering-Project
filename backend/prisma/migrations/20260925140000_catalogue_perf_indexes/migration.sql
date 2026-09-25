-- NFR-PRF-05: item.list/getAvailability/getById and loan.create's clash
-- checks all hinge on these lookups. Under the load-test dataset (10,000
-- units / 100,000 loan rows) each was a sequential scan; see
-- backend/perf/README.md for before/after numbers.

-- "is this unit currently held" (CURRENT_LOAN_SELECT, heldUsageFilter):
-- ResourceKey + CurrentStatus, looked up per unit.
CREATE INDEX "UsageLog_ResourceKey_CurrentStatus_idx" ON "UsageLog"("ResourceKey", "CurrentStatus");

-- Clash checks (clashingWindowFilter) filter ApproveStatus alongside
-- ResourceKey before the time-range comparison; the existing
-- (ResourceKey, StartTime, EndTime) index does not lead with it.
CREATE INDEX "Reservations_ResourceKey_ApproveStatus_StartTime_EndTime_idx" ON "Reservations"("ResourceKey", "ApproveStatus", "StartTime", "EndTime");

-- The catalogue's per-type aggregate query (item.service.ts
-- lightweightItemRows) joins every unit of a type by ItemKey.
CREATE INDEX "ItemIndiv_ItemKey_idx" ON "ItemIndiv"("ItemKey");

-- Same query's eligibility check looks up a unit's rules by ResourceKey
-- alone; the existing unique constraint does not lead with that column.
CREATE INDEX "Eligibility_ResourceKey_idx" ON "Eligibility"("ResourceKey");
